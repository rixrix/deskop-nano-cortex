//! All Tauri command handlers: USB/BLE device control, MIDI send, and settings I/O.
//!
//! @see docs/specs/120-backend-ipc/spec.md [FR-1]
//! @see docs/specs/120-backend-ipc/design.md [DES-IPC-COMMANDS]

use crate::app::AppState;
use crate::domain::{
    CapabilityMatrix, MidiPort, NanoFootswitchAssignments, NanoSlotRole, NanoState, PortKind,
};
use crate::infrastructure::midi::{connection, listener, port_manager};
use crate::ipc::events;
use std::path::PathBuf;
use std::sync::Arc;

#[cfg(feature = "ble")]
use crate::infrastructure::midi::ble;

const SETTINGS_FILE_SIZE_LIMIT_BYTES: u64 = 10 * 1024 * 1024;

/// Clone the active BLE handle, or return a user-facing "not connected" error.
#[cfg(feature = "ble")]
async fn ble_handle(state: &AppState) -> Result<ble::BleHandle, String> {
    state
        .ble_peripheral
        .lock()
        .await
        .clone()
        .ok_or_else(|| "Not connected over Bluetooth".to_string())
}

/// Emit a human action marker into both the terminal log and in-app event log.
/// Used to bracket hardware reverse-engineering sessions.
#[tauri::command]
pub fn trace_marker(
    app_handle: tauri::AppHandle,
    label: String,
    phase: String,
) -> Result<(), String> {
    let clean_label = label.trim();
    let clean_phase = phase.trim().to_uppercase();

    if clean_label.is_empty() {
        return Err("Trace marker label cannot be empty".into());
    }
    if clean_phase.is_empty() {
        return Err("Trace marker phase cannot be empty".into());
    }

    let marker = format!("TRACE {clean_phase}: {clean_label}");
    tracing::info!("{marker}");
    events::emit_log(&app_handle, "info", &marker);
    Ok(())
}

fn expand_user_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Settings file path cannot be empty".into());
    }

    if trimmed == "~" || trimmed.starts_with("~/") {
        let home = std::env::var_os("HOME")
            .ok_or_else(|| "Could not resolve home directory for ~ path".to_string())?;
        let mut expanded = PathBuf::from(home);
        if trimmed.len() > 2 {
            expanded.push(&trimmed[2..]);
        }
        return Ok(expanded);
    }

    Ok(PathBuf::from(trimmed))
}

#[tauri::command]
pub fn export_settings_json(
    app_handle: tauri::AppHandle,
    path: String,
    contents: String,
) -> Result<String, String> {
    let path = expand_user_path(&path)?;
    if path.is_dir() {
        return Err("Settings export path points to a directory; include a .json file name".into());
    }
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err(format!(
                "Settings export folder does not exist: {}",
                parent.display()
            ));
        }
    }

    std::fs::write(&path, contents).map_err(|e| format!("Could not write settings file: {e}"))?;
    let saved_path = path.display().to_string();
    events::emit_log(
        &app_handle,
        "success",
        &format!("Settings exported to {saved_path}"),
    );
    Ok(saved_path)
}

/// Returns the backend crate version so diagnostic bundles carry an accurate app version.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-27]
#[tauri::command]
pub fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

/// Opens an `http(s)` URL in the OS default browser (for the About panel's links).
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-30]
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only http(s) URLs may be opened".into());
    }
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("cmd")
        .args(["/C", "start", "", &url])
        .spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(&url).spawn();
    result
        .map(|_| ())
        .map_err(|e| format!("Could not open URL: {e}"))
}

/// Writes a frontend-built diagnostic log bundle to a user-chosen path. Path validation
/// mirrors `export_settings_json` (non-directory, existing parent, `~` expansion).
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-28]
#[tauri::command]
pub fn export_diagnostic_bundle(
    app_handle: tauri::AppHandle,
    path: String,
    contents: String,
) -> Result<String, String> {
    let path = expand_user_path(&path)?;
    if path.is_dir() {
        return Err("Diagnostic export path points to a directory; include a file name".into());
    }
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err(format!(
                "Diagnostic export folder does not exist: {}",
                parent.display()
            ));
        }
    }

    std::fs::write(&path, contents).map_err(|e| format!("Could not write diagnostic file: {e}"))?;
    let saved_path = path.display().to_string();
    events::emit_log(
        &app_handle,
        "success",
        &format!("Diagnostic bundle exported to {saved_path}"),
    );
    Ok(saved_path)
}

#[tauri::command]
pub fn import_settings_json(app_handle: tauri::AppHandle, path: String) -> Result<String, String> {
    let path = expand_user_path(&path)?;
    if !path.exists() {
        return Err(format!("Settings file does not exist: {}", path.display()));
    }
    if path.is_dir() {
        return Err("Settings import path points to a directory; choose a JSON file".into());
    }

    let metadata = std::fs::metadata(&path)
        .map_err(|e| format!("Could not read settings file metadata: {e}"))?;
    if metadata.len() > SETTINGS_FILE_SIZE_LIMIT_BYTES {
        return Err("Settings file is too large to import safely".into());
    }

    let contents =
        std::fs::read_to_string(&path).map_err(|e| format!("Could not read settings file: {e}"))?;
    events::emit_log(
        &app_handle,
        "info",
        &format!("Settings imported from {}", path.display()),
    );
    Ok(contents)
}

fn midi_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("0x{b:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}

async fn start_usb_input_monitor(
    app_handle: &tauri::AppHandle,
    state: &Arc<AppState>,
) -> Result<usize, String> {
    let input_ports = port_manager::list_input_ports()?;
    let nano_inputs: Vec<MidiPort> = input_ports
        .into_iter()
        .filter(|port| port.is_nano_cortex())
        .collect();

    {
        let mut existing = state.midi_input_connections.lock().await;
        existing.clear();
    }

    if nano_inputs.is_empty() {
        events::emit_log(
            app_handle,
            "warn",
            "No Nano Cortex USB MIDI input found; USB hardware logs are not active",
        );
        return Ok(0);
    }

    let mut connections = Vec::new();
    let mut started_names = Vec::new();

    for input_port in nano_inputs {
        match listener::start_listener(&input_port.name) {
            Ok((rx, conn)) => {
                let port_name = input_port.name.clone();
                let app_for_thread = app_handle.clone();
                started_names.push(port_name.clone());
                std::thread::spawn(move || {
                    while let Ok(msg) = rx.recv() {
                        let hex = midi_hex(&msg.bytes);
                        events::emit_log(
                            &app_for_thread,
                            "debug",
                            &format!("MIDI in from {port_name}: {hex}"),
                        );
                        events::emit_midi_message(&app_for_thread, &msg);
                    }
                    events::emit_log(
                        &app_for_thread,
                        "warn",
                        &format!("USB MIDI input listener ended: {port_name}"),
                    );
                });
                connections.push(conn);
            }
            Err(e) => events::emit_log(
                app_handle,
                "warn",
                &format!(
                    "Could not start USB MIDI input listener on {}: {e}",
                    input_port.name
                ),
            ),
        }
    }

    let count = connections.len();
    {
        let mut existing = state.midi_input_connections.lock().await;
        *existing = connections;
    }

    if count > 0 {
        events::emit_log(
            app_handle,
            "success",
            &format!(
                "Listening to {count} USB MIDI input(s): {}",
                started_names.join(", ")
            ),
        );
    }

    Ok(count)
}

/// List all available MIDI output ports (USB only).
#[tauri::command]
pub fn list_ports(app_handle: tauri::AppHandle) -> Result<Vec<MidiPort>, String> {
    events::emit_log(&app_handle, "info", "Listing MIDI ports...");
    let result = port_manager::list_output_ports();
    match &result {
        Ok(ports) => events::emit_log(
            &app_handle,
            "info",
            &format!("Found {} MIDI port(s)", ports.len()),
        ),
        Err(e) => events::emit_log(&app_handle, "error", &format!("Port list failed: {e}")),
    }
    result
}

/// Connect to a device by name (USB).
#[tauri::command]
pub async fn connect(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    device_name: String,
) -> Result<String, String> {
    events::emit_log(
        &app_handle,
        "info",
        &format!("Connecting to USB: {device_name}..."),
    );
    let ports = port_manager::list_output_ports()?;
    let port = ports
        .iter()
        .find(|p| p.name == device_name)
        .ok_or_else(|| format!("Device '{device_name}' not found"))?;
    state.set_connected(port.name.clone(), PortKind::Usb).await;
    {
        let mut nano = state.nano_state.lock().await;
        nano.connection_status = "connected".into();
        nano.sync_mode = crate::domain::SyncMode::CommandOnly;
        nano.stale = false;
    }

    // Start two-way USB MIDI listening, mirroring the reference WebMIDI app.
    // Nano Cortex MIDI port names are from the device perspective: device OUT is our input.
    let _ = start_usb_input_monitor(&app_handle, state.inner()).await;

    events::emit_log(
        &app_handle,
        "success",
        &format!("Connected to {device_name} via USB"),
    );
    events::emit_connected(&app_handle, &device_name);
    Ok(format!("Connected to {}", port.name))
}

/// Disconnect from the current device.
#[tauri::command]
pub async fn disconnect(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<(), String> {
    events::emit_log(&app_handle, "info", "Disconnecting...");

    #[cfg(feature = "ble")]
    let ble_handle = {
        let mut bp = state.ble_peripheral.lock().await;
        bp.take()
    };

    // Update app/UI state immediately. CoreBluetooth disconnect can be slow, so do
    // the physical BLE disconnect in the background with a timeout.
    state.set_disconnected().await;
    {
        let mut nano = state.nano_state.lock().await;
        nano.connection_status = "disconnected".into();
        nano.sync_mode = crate::domain::SyncMode::DisconnectedPreview;
        nano.stale = true;
    }
    events::emit_disconnected(&app_handle);
    events::emit_log(&app_handle, "info", "Disconnected");

    #[cfg(feature = "ble")]
    if let Some(handle) = ble_handle {
        let app_handle = app_handle.clone();
        tokio::spawn(async move {
            events::emit_log(&app_handle, "info", "Disconnecting BLE peripheral...");
            match tokio::time::timeout(std::time::Duration::from_secs(8), handle.disconnect()).await
            {
                Ok(Ok(())) => {
                    events::emit_log(&app_handle, "success", "BLE peripheral disconnected")
                }
                Ok(Err(e)) => events::emit_log(&app_handle, "warn", &e),
                Err(_) => events::emit_log(
                    &app_handle,
                    "warn",
                    "BLE peripheral disconnect timed out after unsubscribe; macOS may release it shortly",
                ),
            }
        });
    }

    Ok(())
}

/// Send raw MIDI bytes to a named port.
/// Routes by stored device kind. The Nano's BLE channel is NOT BLE-MIDI, so when BLE is the
/// primary connection, raw MIDI is routed out the Nano's USB port when attached; otherwise the
/// send fails honestly (keeping the BLE session alive) rather than writing to the c30x
/// characteristics, which the device rejects.
#[tauri::command]
pub async fn send_midi(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    port_name: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let hex: Vec<String> = bytes.iter().map(|b| format!("0x{b:02X}")).collect();
    events::emit_log(
        &app_handle,
        "info",
        &format!("Send MIDI to {port_name}: {}", hex.join(" ")),
    );

    // Check if this is a BLE-connected device
    let is_ble = {
        let device = state.device.lock().await;
        device
            .as_ref()
            .map(|d| d.kind == PortKind::Ble)
            .unwrap_or(false)
    };

    if is_ble {
        // The Nano's BLE channel speaks its proprietary editor protocol, NOT BLE-MIDI: raw MIDI
        // written to the c30x characteristics is rejected by the device and can drop the link
        // (hardware-observed: a PC write over BLE disconnected the session). Route MIDI out the
        // USB cable when one is attached — the same dual-transport model the device's own
        // ecosystem uses — and otherwise fail honestly while keeping the BLE session alive.
        let usb_ports = port_manager::list_output_ports().unwrap_or_default();
        if let Some(port) = port_manager::find_nano_cortex_port(&usb_ports) {
            let port_name = port.name.clone();
            events::emit_log(
                &app_handle,
                "info",
                &format!("BLE primary: routing MIDI via USB port \"{port_name}\""),
            );
            if bytes.len() == 2 && (bytes[0] & 0xF0) == 0xC0 && bytes[1] < 64 {
                let preset = bytes[1];
                let mut nano = state.nano_state.lock().await;
                nano.active_preset_slot = Some(preset);
                nano.bank = Some(((b'A' + (preset / 8).min(7)) as char).to_string());
                nano.sync_mode = crate::domain::SyncMode::CommandOnly;
                nano.provisional = true;
                nano.stale = false;
            }
            return connection::send_to_port(&port_name, &bytes);
        }
        return Err(
            "The Nano's Bluetooth link doesn't accept MIDI — preset, FX, tuner, tap, and expression \
             commands need the USB cable (the Bluetooth command for these isn't decoded yet). Amp \
             knobs, preset names, and device state still work over Bluetooth."
                .into(),
        );
    }

    if bytes.len() == 2 && (bytes[0] & 0xF0) == 0xC0 && bytes[1] < 64 {
        let preset = bytes[1];
        let mut nano = state.nano_state.lock().await;
        nano.active_preset_slot = Some(preset);
        nano.bank = Some(((b'A' + (preset / 8).min(7)) as char).to_string());
        nano.sync_mode = crate::domain::SyncMode::CommandOnly;
        nano.provisional = true;
        nano.stale = false;
    }

    // USB path
    connection::send_to_port(&port_name, &bytes)
}

/// Write a raw command frame to a named BLE characteristic (default `c304`) for verifying the
/// captured command path against hardware. The device's reply arrives async on the
/// subscribed `c305` notify stream and appears in the log. Experimental / unverified.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-29]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[tauri::command]
pub async fn send_ble_frame(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    bytes: Vec<u8>,
    char_uuid: Option<String>,
) -> Result<String, String> {
    let target = char_uuid.unwrap_or_else(|| "c304".to_string());
    let hex: Vec<String> = bytes.iter().map(|b| format!("{b:02X}")).collect();
    events::emit_log(
        &app_handle,
        "info",
        &format!("[ble] command frame → {target}: {}", hex.join(" ")),
    );

    #[cfg(feature = "ble")]
    {
        let handle = ble_handle(&state).await?;
        handle.write_to_char(&target, &bytes).await?;
        Ok(format!("wrote {} byte(s) to {target}", bytes.len()))
    }
    #[cfg(not(feature = "ble"))]
    {
        let _ = &state;
        Err("BLE not compiled in".into())
    }
}

/// Write the read-only state-dump request to `c304`, wait for the `c305` reply captured by the
/// notification task, decode it into `NanoState`, and graduate the confirmed-readable capabilities.
/// This is the authoritative backend read path (not frontend log-scraping). Returns the updated
/// `NanoState`.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-31]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn request_state_dump(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<NanoState, String> {
    use crate::domain::{CapabilityStatus, SyncMode};
    use crate::infrastructure::midi::ble_debug::{now_ms, BlePacketDirection};
    use crate::infrastructure::midi::ble_schema::decode_latest_state_dump_payloads;

    const DUMP_FRAME: [u8; 14] = [
        0x0c, 0xc0, 0x08, 0x03, 0x18, 0x01, 0x20, 0x01, 0x28, 0x01, 0x01, 0x00, 0x00, 0x00,
    ];

    let handle = ble_handle(&state).await?;
    let write_at = now_ms();
    handle.write_to_char("c304", &DUMP_FRAME).await?;

    // The reply is captured by the notification task; give it time to arrive.
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;

    let payloads: Vec<Vec<u8>> = handle
        .packet_logger
        .snapshot()
        .into_iter()
        .filter(|entry| matches!(entry.direction, BlePacketDirection::Notification))
        .filter(|entry| entry.timestamp_ms >= write_at)
        .filter_map(|entry| entry.payload_hex)
        .filter_map(|payload_hex| parse_hex_payload(&payload_hex))
        .collect();
    let dump = decode_latest_state_dump_payloads(&payloads)
        .ok_or("No state-dump reply received (device idle, disconnected, or protocol changed)")?;

    {
        let mut nano = state.nano_state.lock().await;
        nano.amp_gain = dump.gain;
        nano.amp_level = dump.level;
        nano.amp_bass = dump.bass;
        nano.amp_mid = dump.mid;
        nano.amp_treble = dump.treble;
        nano.footswitch_assignments =
            dump.footswitch_assignments
                .as_ref()
                .map(|assignments| NanoFootswitchAssignments {
                    ia: assignments.ia,
                    ib: assignments.ib,
                    iia: assignments.iia,
                    iib: assignments.iib,
                });
        nano.capture_slot = dump.capture_slot;
        nano.capture_volume = dump.capture_volume;
        nano.gate_on = dump.gate_on;
        nano.gate_reduction = dump.gate_reduction;
        nano.cab_ir_on = dump.cab_ir_on;
        if dump.capture_name.is_some() {
            nano.capture_assignment = dump.capture_name.clone();
        }
        if dump.ir_name.is_some() {
            nano.ir_assignment = dump.ir_name.clone();
        }
        if let Some(slot) = nano.slots.get_mut(&NanoSlotRole::Capture) {
            slot.loaded_name = dump.capture_name.clone();
            let active = dump.capture_slot.map(|capture_slot| capture_slot > 0);
            slot.active = active;
            slot.bypassed = active.map(|is_active| !is_active);
            slot.confirmed = dump.capture_name.is_some();
        }
        if let Some(slot) = nano.slots.get_mut(&NanoSlotRole::IrCab) {
            slot.loaded_name = dump.ir_name.clone();
            slot.active = dump.cab_ir_on;
            slot.bypassed = dump.cab_ir_on.map(|is_active| !is_active);
            slot.confirmed = dump.ir_name.is_some();
        }
        if let Some(slot) = nano.slots.get_mut(&NanoSlotRole::Gate) {
            slot.active = dump.gate_on;
            slot.bypassed = dump.gate_on.map(|is_active| !is_active);
            slot.confirmed = dump.gate_on.is_some();
        }
        for (role, model_id) in [
            NanoSlotRole::PreFx1,
            NanoSlotRole::PreFx2,
            NanoSlotRole::PostFx1,
            NanoSlotRole::PostFx2,
            NanoSlotRole::PostFx3,
        ]
        .into_iter()
        .zip(dump.fx_model_ids.iter())
        {
            if let Some(slot) = nano.slots.get_mut(&role) {
                slot.model_id = model_id.as_ref().map(|model| model.raw_hex.clone());
                slot.model_id_numeric = model_id.as_ref().and_then(|model| model.numeric);
            }
        }
        if let Some(bypass) = dump.bypass.as_ref() {
            for (role, bypass_byte) in [
                NanoSlotRole::PreFx1,
                NanoSlotRole::PreFx2,
                NanoSlotRole::PostFx1,
                NanoSlotRole::PostFx2,
                NanoSlotRole::PostFx3,
            ]
            .into_iter()
            .zip(bypass.iter().copied())
            {
                if let Some(slot) = nano.slots.get_mut(&role) {
                    let bypassed = bypass_byte != 0;
                    slot.bypassed = Some(bypassed);
                    slot.active = Some(!bypassed);
                    slot.confirmed = true;
                }
            }
        }
        nano.sync_mode = SyncMode::WriteNotificationSync;
        nano.stale = false;
    }
    if let Some(assignments) = dump.footswitch_assignments.as_ref() {
        let mut footswitches = state.footswitches.lock().await;
        footswitches.footswitch_i.current_assigned_a = assignments.ia;
        footswitches.footswitch_i.current_assigned_b = assignments.ib;
        footswitches.footswitch_ii.current_assigned_a = assignments.iia;
        footswitches.footswitch_ii.current_assigned_b = assignments.iib;
    }
    {
        // We now have a repeatable labeled hardware trace of these read fields ([NFR-8]).
        let mut caps = state.capability_matrix.lock().await;
        caps.amp_knobs = CapabilityStatus::ConfirmedReadable;
        if dump.capture_name.is_some() {
            caps.capture_assignment = CapabilityStatus::ConfirmedReadable;
        }
        if dump.ir_name.is_some() {
            caps.ir_assignment = CapabilityStatus::ConfirmedReadable;
        }
        if dump.bypass.is_some() || dump.gate_on.is_some() || dump.cab_ir_on.is_some() {
            caps.bypass_flags = CapabilityStatus::ConfirmedReadable;
        }
    }
    let fx_model_summary = dump
        .fx_model_ids
        .iter()
        .enumerate()
        .map(|(index, model)| {
            let label = ["pre1", "pre2", "post1", "post2", "post3"]
                .get(index)
                .copied()
                .unwrap_or("fx");
            format!(
                "{label}={}",
                model
                    .as_ref()
                    .map(|model| model.raw_hex.as_str())
                    .unwrap_or("--")
            )
        })
        .collect::<Vec<_>>()
        .join(" ");
    let fx_bypass_summary = dump
        .bypass
        .as_ref()
        .map(|bypass| {
            bypass
                .iter()
                .copied()
                .take(5)
                .enumerate()
                .map(|(index, byte)| {
                    let label = ["pre1", "pre2", "post1", "post2", "post3"]
                        .get(index)
                        .copied()
                        .unwrap_or("fx");
                    format!("{label}={}", if byte == 0 { "on" } else { "off" })
                })
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_else(|| "--".to_string());
    let fixed_summary = format!(
        "gate={} gate_reduction={} capture={} cab_ir={}",
        dump.gate_on
            .map(|on| if on { "on" } else { "off" })
            .unwrap_or("--"),
        dump.gate_reduction
            .map(|value| format!("{value}%"))
            .unwrap_or_else(|| "--".to_string()),
        dump.capture_slot
            .map(|slot| if slot > 0 { "on" } else { "off" })
            .unwrap_or("--"),
        dump.cab_ir_on
            .map(|on| if on { "on" } else { "off" })
            .unwrap_or("--")
    );
    let footswitch_summary = dump
        .footswitch_assignments
        .as_ref()
        .map(|assignments| {
            format!(
                "IA={} IB={} IIA={} IIB={}",
                assignments.ia, assignments.ib, assignments.iia, assignments.iib
            )
        })
        .unwrap_or_else(|| "--".to_string());
    events::emit_log(
        &app_handle,
        "success",
        &format!(
            "[ble] state dump decoded from device; fixed {fixed_summary}; footswitch {footswitch_summary}; fx models {fx_model_summary}; fx bypass {fx_bypass_summary}"
        ),
    );
    Ok(state.nano_state.lock().await.clone())
}

/// Parse a space-separated hex payload (as stored in `BlePacketLogEntry.payload_hex`) into bytes.
#[cfg(feature = "ble")]
fn parse_hex_payload(payload_hex: &str) -> Option<Vec<u8>> {
    payload_hex
        .split_whitespace()
        .map(|token| u8::from_str_radix(token, 16).ok())
        .collect()
}

#[cfg(feature = "ble")]
fn is_metadata_stream_packet(bytes: &[u8]) -> bool {
    bytes.len() > 2 && (matches!(bytes[0], 0xFE | 0xFD | 0xCE | 0xD0) || bytes[1] & 0x80 != 0)
}

#[cfg(feature = "ble")]
fn metadata_stream_characteristic_rank(uuid: &str) -> u8 {
    if uuid.to_ascii_lowercase().contains("c305") {
        2
    } else if uuid.to_ascii_lowercase().contains("c306") {
        1
    } else {
        0
    }
}

#[cfg(feature = "ble")]
fn reassemble_metadata_stream(
    entries: Vec<crate::infrastructure::midi::ble_debug::BlePacketLogEntry>,
    write_at: u128,
) -> (Vec<u8>, usize, usize, Option<String>) {
    use crate::infrastructure::midi::ble_debug::BlePacketDirection;
    use std::collections::BTreeMap;

    let stream_entries: Vec<_> = entries
        .into_iter()
        .filter(|entry| matches!(entry.direction, BlePacketDirection::Notification))
        .filter(|entry| entry.timestamp_ms >= write_at)
        .filter_map(|entry| {
            let bytes = entry.payload_hex.as_deref().and_then(parse_hex_payload)?;
            if !is_metadata_stream_packet(&bytes) {
                return None;
            }
            Some((entry.characteristic_uuid.unwrap_or_default(), bytes))
        })
        .collect();

    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for (uuid, _) in &stream_entries {
        *counts.entry(uuid.clone()).or_default() += 1;
    }

    let selected_uuid = counts
        .into_iter()
        .max_by(|(left_uuid, left_count), (right_uuid, right_count)| {
            left_count.cmp(right_count).then_with(|| {
                metadata_stream_characteristic_rank(left_uuid)
                    .cmp(&metadata_stream_characteristic_rank(right_uuid))
            })
        })
        .map(|(uuid, _)| uuid);

    let mut reassembled = Vec::new();
    let mut selected_count = 0usize;
    if let Some(uuid) = selected_uuid.as_deref() {
        for (entry_uuid, bytes) in &stream_entries {
            if entry_uuid == uuid {
                reassembled.extend_from_slice(&bytes[2..]);
                selected_count += 1;
            }
        }
    }

    (
        reassembled,
        selected_count,
        stream_entries.len(),
        selected_uuid,
    )
}

/// Request the device metadata dump (preset/capture/IR name lists): write the request to `c304`,
/// collect the multi-packet `FE`-stream `c305` reply, reassemble it (strip each packet's 2-byte
/// header, concatenate), and decode the names.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-33]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn request_metadata(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<crate::infrastructure::midi::ble_schema::MetadataDump, String> {
    use crate::infrastructure::midi::ble_debug::{now_ms, BlePacketDirection};
    use crate::infrastructure::midi::ble_schema::decode_metadata;

    const META_FRAME: [u8; 8] = [0x06, 0xc0, 0x08, 0x03, 0x01, 0x00, 0x00, 0x00];

    let handle = ble_handle(&state).await?;
    let write_at = now_ms();
    handle.write_to_char("c304", &META_FRAME).await?;

    // Multi-packet FE-stream reply; wait until packets stop arriving instead of assuming a fixed
    // transfer time. The metadata stream can be longer than the state dump and may arrive in bursts.
    let mut last_stream_count = 0usize;
    let mut quiet_since = write_at;
    loop {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        let now = now_ms();
        let stream_count = handle
            .packet_logger
            .snapshot()
            .into_iter()
            .filter(|entry| {
                matches!(entry.direction, BlePacketDirection::Notification)
                    && entry.timestamp_ms >= write_at
                    && entry
                        .payload_hex
                        .as_deref()
                        .and_then(parse_hex_payload)
                        .is_some_and(|bytes| is_metadata_stream_packet(&bytes))
            })
            .count();

        if stream_count > last_stream_count {
            last_stream_count = stream_count;
            quiet_since = now;
        }
        if stream_count > 0 && now.saturating_sub(quiet_since) >= 600 {
            break;
        }
        if now.saturating_sub(write_at) >= 5_000 {
            break;
        }
    }

    let (reassembled, selected_stream_count, total_stream_count, selected_uuid) =
        reassemble_metadata_stream(handle.packet_logger.snapshot(), write_at);
    if reassembled.is_empty() {
        return Err(
            "No metadata reply received (device idle, disconnected, or protocol changed)".into(),
        );
    }
    let mut metadata = decode_metadata(&reassembled);
    metadata.packet_count = selected_stream_count;
    let preset_name_count = metadata
        .preset_names
        .iter()
        .filter(|name| !name.trim().is_empty())
        .count();
    events::emit_log(
        &app_handle,
        "success",
        &format!(
            "[ble] metadata decoded: {preset_name_count} usable preset names; slots {}/{}; packets {} of {} observed on {}; payload {} bytes",
            metadata.preset_slots,
            metadata.expected_preset_slots,
            metadata.packet_count,
            total_stream_count,
            selected_uuid
                .as_deref()
                .unwrap_or("unknown characteristic"),
            metadata.payload_bytes
        ),
    );
    Ok(metadata)
}

#[cfg(feature = "ble")]
fn fx_param_refresh_slot(slot: &str) -> Option<u8> {
    match slot {
        "pre-1" => Some(0),
        "pre-2" => Some(1),
        "post-1" => Some(2),
        "post-2" => Some(3),
        "post-3" => Some(4),
        _ => None,
    }
}

#[cfg(feature = "ble")]
fn parse_compact_hex_bytes(input: &str) -> Result<Vec<u8>, String> {
    let compact: String = input
        .chars()
        .filter(|ch| !ch.is_whitespace() && *ch != ':' && *ch != '-')
        .collect();

    if compact.is_empty() {
        return Err("FX model id cannot be empty".into());
    }
    if !compact.len().is_multiple_of(2) {
        return Err(format!("FX model id must contain full bytes: {input}"));
    }

    compact
        .as_bytes()
        .chunks(2)
        .map(|chunk| {
            let text = std::str::from_utf8(chunk)
                .map_err(|_| format!("FX model id is not valid UTF-8: {input}"))?;
            u8::from_str_radix(text, 16)
                .map_err(|_| format!("FX model id contains non-hex bytes: {input}"))
        })
        .collect()
}

/// Request read-only FX parameter values for one editable FX slot. This sends the non-destructive
/// refresh frame to `c304`, then decodes the timestamp-scoped `c305` reply into normalized float
/// values. It does not write any parameter values or graduate write capability.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-31]
/// @see docs/specs/110-backend-midi-ble/spec.md [FR-22]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn request_fx_params(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    slot: String,
) -> Result<crate::infrastructure::midi::ble_schema::FxParamRefresh, String> {
    use crate::infrastructure::midi::ble_debug::{now_ms, BlePacketDirection};
    use crate::infrastructure::midi::ble_schema::decode_fx_param_refresh;

    let refresh_slot =
        fx_param_refresh_slot(&slot).ok_or_else(|| format!("unsupported FX slot: {slot}"))?;
    let frame = [
        0x08,
        0xc0,
        0x08,
        0x03,
        0x18,
        refresh_slot,
        0x89,
        0x00,
        0x00,
        0x00,
    ];

    let handle = ble_handle(&state).await?;
    let write_at = now_ms();
    handle.write_to_char("c304", &frame).await?;

    tokio::time::sleep(std::time::Duration::from_millis(700)).await;

    let refresh = handle
        .packet_logger
        .snapshot()
        .into_iter()
        .rev()
        .filter(|entry| matches!(entry.direction, BlePacketDirection::Notification))
        .filter(|entry| entry.timestamp_ms >= write_at)
        .filter(|entry| {
            entry
                .characteristic_uuid
                .as_deref()
                .is_none_or(|uuid| uuid.to_ascii_lowercase().contains("c305"))
        })
        .filter_map(|entry| entry.payload_hex.and_then(|payload| parse_hex_payload(&payload)))
        .find_map(|payload| decode_fx_param_refresh(&payload))
        .ok_or_else(|| {
            format!(
                "No FX parameter refresh reply received for {slot} (device idle, disconnected, or protocol changed)"
            )
        })?;

    events::emit_log(
        &app_handle,
        "success",
        &format!(
            "[ble] FX parameter refresh decoded for {slot}: {} value(s)",
            refresh.values.len()
        ),
    );
    Ok(refresh)
}

/// Request read-only Cab/IR level/filter/mic values for a selected device Cab/IR slot. The slot is
/// one-based (`1..=5`) and must already be loaded on the device.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-31]
/// @see docs/specs/110-backend-midi-ble/spec.md [FR-22]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn request_cab_ir_params(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    slot: u8,
) -> Result<crate::infrastructure::midi::ble_schema::CabIrParamRefresh, String> {
    use crate::infrastructure::midi::ble_debug::{now_ms, BlePacketDirection};
    use crate::infrastructure::midi::ble_encoder::cab_ir_param_refresh_frame;
    use crate::infrastructure::midi::ble_schema::decode_cab_ir_param_refresh;

    let frame = cab_ir_param_refresh_frame(slot).map_err(str::to_string)?;
    let handle = ble_handle(&state).await?;
    let write_at = now_ms();
    handle.write_to_char("c304", &frame).await?;

    tokio::time::sleep(std::time::Duration::from_millis(700)).await;

    let refresh = handle
        .packet_logger
        .snapshot()
        .into_iter()
        .rev()
        .filter(|entry| matches!(entry.direction, BlePacketDirection::Notification))
        .filter(|entry| entry.timestamp_ms >= write_at)
        .filter(|entry| {
            entry
                .characteristic_uuid
                .as_deref()
                .is_none_or(|uuid| uuid.to_ascii_lowercase().contains("c305"))
        })
        .filter_map(|entry| entry.payload_hex.and_then(|payload| parse_hex_payload(&payload)))
        .find_map(|payload| decode_cab_ir_param_refresh(&payload))
        .ok_or_else(|| {
            format!(
                "No Cab/IR parameter refresh reply received for slot {slot} (device idle, disconnected, or protocol changed)"
            )
        })?;

    events::emit_log(
        &app_handle,
        "success",
        &format!("[ble] Cab/IR parameter refresh decoded for slot {slot}"),
    );
    Ok(refresh)
}

/// Write one normalized FX parameter for an editable FX slot. The write changes the live device
/// state only; it is not persisted to a preset unless the user saves on the device or through an
/// explicitly approved save path.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn set_fx_param(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    slot: String,
    param_index: u8,
    normalized_value: f32,
) -> Result<(), String> {
    use crate::infrastructure::midi::ble_encoder::fx_param_frame;

    let model_slot =
        fx_param_refresh_slot(&slot).ok_or_else(|| format!("unsupported FX slot: {slot}"))?;
    let value = if normalized_value.is_finite() {
        normalized_value.clamp(0.0, 1.0)
    } else {
        0.0
    };
    let handle = ble_handle(&state).await?;
    handle
        .write_to_char("c304", &fx_param_frame(model_slot, param_index, value))
        .await?;

    events::emit_log(
        &app_handle,
        "info",
        &format!(
            "[ble] set FX param {slot} #{} = {value:.4} (live state; save required to persist)",
            param_index.saturating_add(1)
        ),
    );
    Ok(())
}

/// Select an FX model for an editable FX slot. The command changes live device state only; callers
/// must immediately re-read the device state and refresh the selected slot's values before showing
/// the new model as confirmed.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn set_fx_model(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    slot: String,
    model_id: String,
) -> Result<(), String> {
    use crate::infrastructure::midi::ble_encoder::fx_model_frame;

    let model_slot =
        fx_param_refresh_slot(&slot).ok_or_else(|| format!("unsupported FX slot: {slot}"))?;
    let model_bytes = parse_compact_hex_bytes(&model_id)?;
    let frame = fx_model_frame(model_slot, &model_bytes).map_err(str::to_string)?;

    let handle = ble_handle(&state).await?;
    handle.write_to_char("c304", &frame).await?;

    events::emit_log(
        &app_handle,
        "info",
        &format!("[ble] set FX model {slot} = {model_id} (live state; save required to persist)"),
    );
    Ok(())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-33]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn request_metadata(
) -> Result<crate::infrastructure::midi::ble_schema::MetadataDump, String> {
    Err("BLE not compiled in".into())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-31]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn request_fx_params(
    _slot: String,
) -> Result<crate::infrastructure::midi::ble_schema::FxParamRefresh, String> {
    Err("BLE not compiled in".into())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-31]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn request_cab_ir_params(
    _slot: u8,
) -> Result<crate::infrastructure::midi::ble_schema::CabIrParamRefresh, String> {
    Err("BLE not compiled in".into())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn set_fx_param(
    _slot: String,
    _param_index: u8,
    _normalized_value: f32,
) -> Result<(), String> {
    Err("BLE not compiled in".into())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn set_fx_model(_slot: String, _model_id: String) -> Result<(), String> {
    Err("BLE not compiled in".into())
}

/// Select a Capture slot in live device state. Slot `0` bypasses Capture; non-zero slots select
/// one of the device capture slots. Save separately to persist.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn set_capture_slot(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    slot: u8,
) -> Result<(), String> {
    use crate::infrastructure::midi::ble_encoder::capture_slot_frame;

    let frame = capture_slot_frame(slot).map_err(str::to_string)?;
    let handle = ble_handle(&state).await?;
    handle.write_to_char("c304", &frame).await?;

    {
        let mut nano = state.nano_state.lock().await;
        nano.capture_slot = Some(slot);
    }
    events::emit_log(
        &app_handle,
        "info",
        &format!("[ble] set Capture slot {slot} (live state; save required to persist)"),
    );
    Ok(())
}

/// Select a Cab/IR slot in live device state. Slot `0` bypasses Cab/IR; non-zero slots select
/// one of the device IR/Cab slots. Save separately to persist.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn set_cab_ir_slot(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    slot: u8,
) -> Result<(), String> {
    use crate::infrastructure::midi::ble_encoder::cab_ir_slot_frame;

    let frame = cab_ir_slot_frame(slot).map_err(str::to_string)?;
    let handle = ble_handle(&state).await?;
    handle.write_to_char("c304", &frame).await?;

    events::emit_log(
        &app_handle,
        "info",
        &format!("[ble] set Cab/IR slot {slot} (live state; save required to persist)"),
    );
    Ok(())
}

/// Toggle the fixed input gate in live device state. Save separately to persist.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn set_gate_enabled(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    enabled: bool,
) -> Result<(), String> {
    use crate::infrastructure::midi::ble_encoder::gate_enabled_frame;

    let handle = ble_handle(&state).await?;
    handle
        .write_to_char("c304", &gate_enabled_frame(enabled))
        .await?;

    {
        let mut nano = state.nano_state.lock().await;
        nano.gate_on = Some(enabled);
        if let Some(slot) = nano.slots.get_mut(&NanoSlotRole::Gate) {
            slot.active = Some(enabled);
            slot.bypassed = Some(!enabled);
        }
    }
    events::emit_log(
        &app_handle,
        "info",
        &format!(
            "[ble] set Gate {} (live state; save required to persist)",
            if enabled { "on" } else { "off" }
        ),
    );
    Ok(())
}

/// Write the fixed input gate reduction value in live device state. Save separately to persist.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn set_gate_reduction(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    percent: u8,
) -> Result<(), String> {
    use crate::infrastructure::midi::ble_encoder::gate_reduction_frame;

    let value = percent.min(100);
    let handle = ble_handle(&state).await?;
    handle
        .write_to_char("c304", &gate_reduction_frame(value))
        .await?;

    events::emit_log(
        &app_handle,
        "info",
        &format!("[ble] set Gate reduction {value}% (live state; save required to persist)"),
    );
    Ok(())
}

/// Write Capture volume in dB in live device state. Save separately to persist.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn set_capture_volume(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    db: f32,
) -> Result<(), String> {
    use crate::infrastructure::midi::ble_encoder::{capture_db_to_raw, capture_volume_frame};

    let handle = ble_handle(&state).await?;
    handle
        .write_to_char("c304", &capture_volume_frame(db))
        .await?;

    {
        let mut nano = state.nano_state.lock().await;
        nano.capture_volume = Some(capture_db_to_raw(db));
    }
    events::emit_log(
        &app_handle,
        "info",
        &format!("[ble] set Capture volume {db:.1} dB (live state; save required to persist)"),
    );
    Ok(())
}

/// Write a fixed Cab/IR parameter in live device state. Save separately to persist.
///
/// `param` accepts `level`, `high-pass`, or `low-pass`; `value` is the display value
/// (`dB` or `Hz`), not a normalized float.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn set_cab_ir_param(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    param: String,
    value: f32,
) -> Result<(), String> {
    use crate::infrastructure::midi::ble_encoder::{
        cab_ir_high_pass_frame, cab_ir_level_frame, cab_ir_low_pass_frame,
    };

    let key = param.trim().to_ascii_lowercase();
    let (label, frame) = match key.as_str() {
        "level" => ("level", cab_ir_level_frame(value)),
        "high-pass" | "high_pass" | "highpass" => ("high pass", cab_ir_high_pass_frame(value)),
        "low-pass" | "low_pass" | "lowpass" => ("low pass", cab_ir_low_pass_frame(value)),
        _ => return Err(format!("unsupported Cab/IR parameter: {param}")),
    };

    let handle = ble_handle(&state).await?;
    handle.write_to_char("c304", &frame).await?;

    events::emit_log(
        &app_handle,
        "info",
        &format!("[ble] set Cab/IR {label} {value:.1} (live state; save required to persist)"),
    );
    Ok(())
}

/// Write factory Cab/IR microphone/position in live device state. Save separately to persist.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn set_cab_ir_mic_position(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    cab_name: String,
    mic_name: String,
    position: u8,
) -> Result<(), String> {
    use crate::infrastructure::midi::ble_encoder::cab_ir_mic_position_frame;

    let frame =
        cab_ir_mic_position_frame(&cab_name, &mic_name, position).map_err(str::to_string)?;
    let handle = ble_handle(&state).await?;
    handle.write_to_char("c304", &frame).await?;

    events::emit_log(
        &app_handle,
        "info",
        &format!(
            "[ble] set Cab/IR mic {mic_name} position {} (live state; save required to persist)",
            position.clamp(1, 6)
        ),
    );
    Ok(())
}

/// Candidate live write for the four footswitch quick-access preset assignments. The device
/// readback reports all four assignments together, so this command writes the complete snapshot
/// instead of trying to patch one slot in isolation.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-34]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn set_footswitch_assignments(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    selected_preset: u8,
    ia: u8,
    ib: u8,
    iia: u8,
    iib: u8,
) -> Result<(), String> {
    use crate::infrastructure::midi::ble_encoder::footswitch_assignments_frame;

    let frame = footswitch_assignments_frame(selected_preset, ia, ib, iia, iib)
        .map_err(|error| error.to_string())?;
    let handle = ble_handle(&state).await?;
    handle.write_to_char("c304", &frame).await?;
    events::emit_log(
        &app_handle,
        "info",
        &format!(
            "[ble] write footswitch assignments selected={selected_preset} IA={ia} IB={ib} IIA={iia} IIB={iib} — live state; save to persist"
        ),
    );
    Ok(())
}

/// Acknowledge an app-initiated preset change while a BLE session is active. Writes the
/// preset-change acknowledgement frame (`06 C0 20 01 1E 00 00 00`) to `c304`, matching the
/// documented switch-preset flow (PC → ack → state request). Without the ack the device can stay
/// in a pending preset-change context that ignores subsequent PC until the on-device EXIT.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-36]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn acknowledge_preset_change(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<(), String> {
    use crate::infrastructure::midi::ble_encoder::preset_change_ack_frame;

    let frame = preset_change_ack_frame();
    let handle = ble_handle(&state).await?;
    handle.write_to_char("c304", &frame).await?;
    events::emit_log(&app_handle, "info", "[ble] preset-change ack sent");
    Ok(())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn set_capture_slot(_slot: u8) -> Result<(), String> {
    Err("BLE not compiled in".into())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn set_cab_ir_slot(_slot: u8) -> Result<(), String> {
    Err("BLE not compiled in".into())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn set_gate_enabled(_enabled: bool) -> Result<(), String> {
    Err("BLE not compiled in".into())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn set_gate_reduction(_percent: u8) -> Result<(), String> {
    Err("BLE not compiled in".into())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn set_capture_volume(_db: f32) -> Result<(), String> {
    Err("BLE not compiled in".into())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn set_cab_ir_param(_param: String, _value: f32) -> Result<(), String> {
    Err("BLE not compiled in".into())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-35]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn set_cab_ir_mic_position(
    _cab_name: String,
    _mic_name: String,
    _position: u8,
) -> Result<(), String> {
    Err("BLE not compiled in".into())
}

/// Stub when the `ble` feature is disabled.
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn set_footswitch_assignments(
    _selected_preset: u8,
    _ia: u8,
    _ib: u8,
    _iia: u8,
    _iib: u8,
) -> Result<(), String> {
    Err("BLE not compiled in".into())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-36]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn acknowledge_preset_change() -> Result<(), String> {
    Err("BLE not compiled in".into())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-31]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn request_state_dump() -> Result<NanoState, String> {
    Err("BLE not compiled in".into())
}

/// Set an amp knob (`gain`/`level`/`bass`/`mid`/`treble`, raw `0-255`) on the device: build the
/// `c304` frame, write it, update `NanoState` optimistically, and graduate `amp_knobs` to
/// `ConfirmedWritable` (write confirmed reversibly against hardware).
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-32]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn set_amp_knob(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    knob: String,
    value: u8,
) -> Result<(), String> {
    use crate::domain::CapabilityStatus;
    use crate::infrastructure::midi::ble_encoder::{amp_knob_frame, amp_knob_slot};

    let slot = amp_knob_slot(&knob).ok_or_else(|| format!("unknown amp knob: {knob}"))?;
    let handle = ble_handle(&state).await?;
    handle
        .write_to_char("c304", &amp_knob_frame(slot, value))
        .await?;

    {
        let mut nano = state.nano_state.lock().await;
        match knob.as_str() {
            "gain" => nano.amp_gain = Some(value),
            "level" => nano.amp_level = Some(value),
            "bass" => nano.amp_bass = Some(value),
            "mid" => nano.amp_mid = Some(value),
            "treble" => nano.amp_treble = Some(value),
            _ => {}
        }
    }
    {
        // The amp-knob write path is hardware-verified (reversible round-trip) ([NFR-8]).
        let mut caps = state.capability_matrix.lock().await;
        caps.amp_knobs = CapabilityStatus::ConfirmedWritable;
    }
    events::emit_log(&app_handle, "info", &format!("[ble] set {knob} = {value}"));
    Ok(())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-32]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn set_amp_knob(_knob: String, _value: u8) -> Result<(), String> {
    Err("BLE not compiled in".into())
}

/// Save the device's live state (and preset name) into a preset slot: build the `c304` save frame
/// and write it. This is intentionally explicit and destructive: the frontend guards it behind the
/// current full-control state, user confirmation, and a post-save state/metadata refresh.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-34]
/// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn save_active_preset(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    preset: u8,
    name: String,
) -> Result<(), String> {
    use crate::infrastructure::midi::ble_encoder::save_preset_frame;

    if preset > 63 {
        return Err(format!("preset slot out of range: {preset}"));
    }
    let handle = ble_handle(&state).await?;
    handle
        .write_to_char("c304", &save_preset_frame(preset, &name))
        .await?;
    events::emit_log(
        &app_handle,
        "info",
        &format!("[ble] save preset {preset} (\"{name}\") — guarded device save"),
    );
    Ok(())
}

/// Stub when the `ble` feature is disabled.
///
/// @see docs/specs/120-backend-ipc/spec.md [FR-34]
#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn save_active_preset(_preset: u8, _name: String) -> Result<(), String> {
    Err("BLE not compiled in".into())
}

/// Normalized Nano Cortex state decoded or inferred from BLE/commands.
#[tauri::command]
pub async fn get_nano_state(state: tauri::State<'_, Arc<AppState>>) -> Result<NanoState, String> {
    Ok(state.nano_state.lock().await.clone())
}

/// Capability matrix for captured state fields.
#[tauri::command]
pub async fn get_ble_capabilities(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<CapabilityMatrix, String> {
    Ok(state.capability_matrix.lock().await.clone())
}

/// Current in-memory BLE packet/debug log. Enable raw payload capture with NANO_BLE_DEBUG=1.
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn get_ble_debug_log(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<crate::infrastructure::midi::ble_debug::BlePacketLogEntry>, String> {
    let handle = {
        let bp = state.ble_peripheral.lock().await;
        bp.clone()
    };
    Ok(handle
        .map(|h| h.packet_logger.snapshot())
        .unwrap_or_default())
}

#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn get_ble_debug_log() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

/// Get the current connection state.
#[tauri::command]
pub async fn get_state(state: tauri::State<'_, Arc<AppState>>) -> Result<String, String> {
    let device = state.device.lock().await;
    Ok(device
        .as_ref()
        .map(|d| {
            match d.state {
                crate::domain::DeviceState::Connected => "connected",
                crate::domain::DeviceState::Connecting => "connecting",
                crate::domain::DeviceState::Disconnected => "disconnected",
                crate::domain::DeviceState::Error => "error",
            }
            .to_string()
        })
        .unwrap_or_else(|| "disconnected".to_string()))
}

/// Get the connected device name, if any.
#[tauri::command]
pub async fn get_device_name(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Option<String>, String> {
    Ok(state.device_name().await)
}

// ── BLE ────────────────────────────────────────────────

/// Fast BLE connect (5s scan + connect). Stores peripheral in AppState for MIDI I/O.
/// Spawns a background watcher that auto-detects disconnection.
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn ble_scan(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<String>, String> {
    let keep_usb_as_primary = {
        let device = state.device.lock().await;
        matches!(
            device.as_ref(),
            Some(device)
                if device.kind == PortKind::Usb
                    && device.state == crate::domain::DeviceState::Connected
        )
    };

    let existing_ble = {
        let bp = state.ble_peripheral.lock().await;
        bp.clone()
    };
    if let Some(handle) = existing_ble {
        if handle.is_connected().await {
            if !keep_usb_as_primary {
                state
                    .set_connected("Neural DSP Nano Cortex (Bluetooth)".into(), PortKind::Ble)
                    .await;
                events::emit_connected(&app_handle, "Neural DSP Nano Cortex (Bluetooth)");
            }
            {
                let mut nano = state.nano_state.lock().await;
                nano.connection_status = "connected".into();
                nano.sync_mode = crate::domain::SyncMode::CommandOnly;
                nano.stale = false;
            }
            events::emit_log(
                &app_handle,
                "success",
                "Bluetooth already connected; reusing existing handle",
            );
            return Ok(vec![
                "✅ Already connected via Bluetooth".into(),
                "Reusing existing peripheral handle".into(),
            ]);
        }

        events::emit_log(
            &app_handle,
            "warn",
            "Dropping stale BLE handle before reconnect",
        );
        let mut bp = state.ble_peripheral.lock().await;
        *bp = None;
    }

    {
        let mut s = state.ble_scanning.lock().await;
        if *s {
            return Err("Already scanning".into());
        }
        *s = true;
    }

    let result = ble::find_and_connect_with_log(Some(&app_handle)).await;

    {
        let mut s = state.ble_scanning.lock().await;
        *s = false;
    }

    match result {
        Ok(handle) => {
            let char_str = handle.characteristic.uuid.to_string();

            // ── Immediate liveness check: don't report success if device already gone ──
            if !handle.is_connected().await {
                let _ = handle.disconnect().await;
                events::emit_log(
                    &app_handle,
                    "warn",
                    "BLE device disconnected immediately after handshake",
                );
                return Err(
                    "Device disconnected during handshake. Is it still in pairing mode?".into(),
                );
            }

            // Store the peripheral for subsequent send_midi calls
            {
                let mut bp = state.ble_peripheral.lock().await;
                *bp = Some(handle);
            }

            let _ = start_usb_input_monitor(&app_handle, state.inner()).await;

            if keep_usb_as_primary {
                events::emit_log(
                    &app_handle,
                    "success",
                    "BLE observation attached; keeping USB as command/log transport",
                );
            } else {
                state
                    .set_connected("Neural DSP Nano Cortex (Bluetooth)".into(), PortKind::Ble)
                    .await;
                events::emit_connected(&app_handle, "Neural DSP Nano Cortex");
            }

            {
                let mut nano = state.nano_state.lock().await;
                nano.connection_status = "connected".into();
                nano.sync_mode = crate::domain::SyncMode::CommandOnly;
                nano.stale = false;
            }
            events::emit_log(
                &app_handle,
                "success",
                &format!("BLE connected — char: {char_str}"),
            );

            // Spawn disconnect watcher: polls is_connected every 500ms
            let state_clone = Arc::clone(&state);
            let handle_clone = app_handle.clone();
            let preserve_usb_on_ble_disconnect = keep_usb_as_primary;
            tokio::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    let handle = {
                        let bp = state_clone.ble_peripheral.lock().await;
                        bp.clone()
                    };
                    let Some(handle) = handle else {
                        break;
                    };
                    let still_connected = handle.is_connected().await;
                    if !still_connected {
                        events::emit_log(&handle_clone, "warn", "BLE peripheral disconnected");
                        {
                            let mut bp = state_clone.ble_peripheral.lock().await;
                            *bp = None;
                        }
                        if !preserve_usb_on_ble_disconnect {
                            events::emit_disconnected(&handle_clone);
                            state_clone.set_disconnected().await;
                        }
                        break;
                    }
                }
            });

            Ok(vec![
                "✅ Connected via BLE".into(),
                format!("Characteristic: {char_str}"),
                "Ready for MIDI I/O".into(),
            ])
        }
        Err(e) => {
            events::emit_log(&app_handle, "error", &format!("BLE connect failed: {e}"));
            // On failure, also log the list of devices we found
            // (scan_all_with_log already logs each device, but a summary helps)
            events::emit_log(
                &app_handle,
                "warn",
                "HINT: open the log panel to see all discovered BLE devices. \
                 If the Nano is already paired, keep it awake and try again. \
                 For new pairing, put the device in pairing mode with EXIT + CAPTURE.",
            );
            Err(e)
        }
    }
}

/// Quick BLE availability check.
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn ble_ping() -> Result<String, String> {
    let _ = ble::get_adapter().await?;
    Ok("BLE adapter OK".into())
}

#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn ble_scan() -> Result<Vec<String>, String> {
    Err("BLE not compiled in".into())
}

#[cfg(not(feature = "ble"))]
#[tauri::command]
pub async fn ble_ping() -> Result<String, String> {
    Err("BLE not compiled in".into())
}

#[cfg(all(test, feature = "ble"))]
mod tests {
    use super::*;
    use crate::infrastructure::midi::ble_debug::{BlePacketDirection, BlePacketLogEntry};

    fn notification(uuid: &str, timestamp_ms: u128, payload_hex: &str) -> BlePacketLogEntry {
        BlePacketLogEntry {
            timestamp_ms,
            direction: BlePacketDirection::Notification,
            device_name: None,
            service_uuid: None,
            characteristic_uuid: Some(uuid.to_string()),
            properties: None,
            payload_hex: Some(payload_hex.to_string()),
            note: None,
        }
    }

    #[test]
    fn metadata_stream_packet_accepts_continuation_headers() {
        assert!(is_metadata_stream_packet(&[0xFE, 0x01, 0x92]));
        assert!(is_metadata_stream_packet(&[0x4E, 0x81, 0x33]));
        assert!(!is_metadata_stream_packet(&[0x4E, 0x01, 0x33]));
        assert!(!is_metadata_stream_packet(&[0xFE, 0x01]));
    }

    #[test]
    fn metadata_reassembly_uses_one_characteristic_stream() {
        let c305 = "0000c305-0000-1000-8000-00805f9b34fb";
        let c306 = "0000c306-0000-1000-8000-00805f9b34fb";
        let (body, selected_count, total_count, selected_uuid) = reassemble_metadata_stream(
            vec![
                notification(c305, 100, "FE 01 AA BB"),
                notification(c306, 101, "FE 01 11 22"),
                notification(c305, 102, "4E 81 CC DD"),
                notification(c306, 103, "4E 81 33 44"),
            ],
            99,
        );

        assert_eq!(body, vec![0xAA, 0xBB, 0xCC, 0xDD]);
        assert_eq!(selected_count, 2);
        assert_eq!(total_count, 4);
        assert_eq!(selected_uuid.as_deref(), Some(c305));
    }
}
