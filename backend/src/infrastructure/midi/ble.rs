//! BLE GATT scan, connect, write, subscribe, and disconnect via btleplug.
//!
//! @see docs/specs/110-backend-midi-ble/spec.md [FR-1]
//! @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-CONNECT] [DES-BLE-DISCONNECT]

use crate::infrastructure::midi::ble_debug::{hex, BlePacketDirection, BlePacketLogger};
use crate::infrastructure::midi::ble_inspector::inspect_characteristics;
use btleplug::api::{
    Central, CentralEvent, CharPropFlags, Manager as _, Peripheral, ScanFilter, WriteType,
};
use btleplug::platform::{Adapter, Manager, Peripheral as BtlePeripheral};
use futures::FutureExt;
use futures::StreamExt;
use std::sync::Arc;
use std::time::Duration;
use tauri::Runtime;
use tokio::sync::Mutex;
use tokio::time;

pub const MIDI_IO_CHAR_UUIDS: &[&str] = &[
    "7772e5db-3868-4112-a1a9-f2669d106bf3",
    "03b80e5a-ede8-4b33-a751-6ce34ec4c700",
    "0000c302-0000-1000-8000-00805f9b34fb",
];

/// MIDI service UUIDs (used to detect MIDI devices by their advertised services
/// when name matching fails — common for already-paired devices).
pub const MIDI_SERVICE_UUIDS: &[&str] = &[
    // Bluetooth SIG BLE-MIDI service UUID
    "03b80e5a-ede8-4b33-a751-6ce34ec4c700",
    // Nano Cortex / Nordic-style BLE-MIDI service UUID observed in the spec notes
    "0000a002-0000-1000-8000-00805f9b34fb",
    // Kept as fallbacks for devices that advertise characteristic/vendor UUIDs as services
    "7772e5db-3868-4112-a1a9-f2669d106bf3",
    "00cb7a5b-bf06-470a-b9b8-1c5d2c7e7b00",
];

/// Hard cap on the entire find-and-connect flow. If anything hangs, we bail.
const BLE_TOTAL_TIMEOUT: Duration = Duration::from_secs(40);
const BLE_CONNECT_TIMEOUT: Duration = Duration::from_secs(12);
const BLE_SERVICE_DISCOVERY_TIMEOUT: Duration = Duration::from_secs(8);
const BLE_CONNECT_ATTEMPTS: usize = 2;

/// Stored BLE handle that lives in AppState so send_midi can route BLE traffic.
#[derive(Clone)]
pub struct BleHandle {
    pub peripheral: Arc<Mutex<BtlePeripheral>>,
    pub characteristic: btleplug::api::Characteristic,
    pub subscribed_characteristics: Vec<btleplug::api::Characteristic>,
    pub packet_logger: BlePacketLogger,
}

impl BleHandle {
    /// Send raw MIDI bytes over BLE.
    pub async fn send(&self, bytes: &[u8]) -> Result<(), String> {
        let p = self.peripheral.lock().await;
        let write_type = if self
            .characteristic
            .properties
            .contains(CharPropFlags::WRITE_WITHOUT_RESPONSE)
        {
            WriteType::WithoutResponse
        } else {
            WriteType::WithResponse
        };
        tracing::info!(
            target: "ble",
            "[ble] write {} ({write_type:?}): {}",
            self.characteristic.uuid,
            hex(bytes)
        );
        if BlePacketLogger::is_enabled() {
            self.packet_logger.record_payload(
                BlePacketDirection::Write,
                &self.characteristic,
                bytes,
                Some(format!("write_type={write_type:?}")),
            );
        }
        time::timeout(
            Duration::from_secs(3),
            p.write(&self.characteristic, bytes, write_type),
        )
        .await
        .map_err(|_| "BLE write timed out (3s) — connection may be stale".to_string())?
        .map_err(|e| format!("BLE write failed: {e}"))
    }

    /// Write raw bytes to a specific characteristic, matched by UUID fragment (e.g. `"c304"`).
    /// Used to verify the captured command path against hardware; the device's
    /// reply arrives asynchronously on the subscribed `c305` notify stream.
    ///
    /// @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
    pub async fn write_to_char(&self, uuid_fragment: &str, bytes: &[u8]) -> Result<(), String> {
        let fragment = uuid_fragment.to_lowercase();
        let p = self.peripheral.lock().await;
        let target = p
            .characteristics()
            .into_iter()
            .find(|c| {
                (c.properties.contains(CharPropFlags::WRITE)
                    || c.properties.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE))
                    && c.uuid.to_string().to_lowercase().contains(&fragment)
            })
            .ok_or_else(|| format!("no writable characteristic matching '{uuid_fragment}'"))?;
        let write_type = if target
            .properties
            .contains(CharPropFlags::WRITE_WITHOUT_RESPONSE)
        {
            WriteType::WithoutResponse
        } else {
            WriteType::WithResponse
        };
        tracing::info!(
            target: "ble",
            "[ble] command write {} ({write_type:?}): {}",
            target.uuid,
            hex(bytes)
        );
        if BlePacketLogger::is_enabled() {
            self.packet_logger.record_payload(
                BlePacketDirection::Write,
                &target,
                bytes,
                Some(format!("command frame write_type={write_type:?}")),
            );
        }
        // Bound the GATT write: a stale/dropped connection can otherwise block forever
        // (WithResponse waits for a device ACK that never arrives).
        time::timeout(Duration::from_secs(3), p.write(&target, bytes, write_type))
            .await
            .map_err(|_| {
                "BLE write timed out (3s) — connection may be stale; reconnect and retry"
                    .to_string()
            })?
            .map_err(|e| format!("BLE write failed: {e}"))
    }

    /// Check if the peripheral is still connected.
    pub async fn is_connected(&self) -> bool {
        let p = self.peripheral.lock().await;
        p.is_connected().await.unwrap_or(false)
    }

    /// Disconnect the peripheral cleanly.
    pub async fn disconnect(&self) -> Result<(), String> {
        let p = self.peripheral.lock().await;

        // CoreBluetooth can keep a peripheral around if notify/indicate streams are
        // still active. Best-effort unsubscribe first, then disconnect.
        for ch in &self.subscribed_characteristics {
            match time::timeout(Duration::from_secs(1), p.unsubscribe(ch)).await {
                Ok(Ok(())) => tracing::info!(target: "ble", "[ble] unsubscribed {}", ch.uuid),
                Ok(Err(e)) => {
                    tracing::warn!(target: "ble", "[ble] unsubscribe {} failed: {e}", ch.uuid)
                }
                Err(_) => tracing::warn!(target: "ble", "[ble] unsubscribe {} timed out", ch.uuid),
            }
        }

        if !p.is_connected().await.unwrap_or(false) {
            return Ok(());
        }

        time::timeout(Duration::from_secs(5), p.disconnect())
            .await
            .map_err(|_| "BLE disconnect timed out (5s)".to_string())?
            .map_err(|e| format!("BLE disconnect failed: {e}"))
    }
}

/// Decide if a peripheral looks like a Nano Cortex, using name OR service UUIDs.
fn looks_like_nano(name: &str, uuids: &[String]) -> bool {
    let lname = name.to_lowercase();
    if lname.contains("nano") || lname.contains("cortex") || lname.contains("neural") {
        return true;
    }
    // Fallback: check advertised service UUIDs
    let l_uuids: Vec<String> = uuids.iter().map(|u| u.to_lowercase()).collect();
    MIDI_SERVICE_UUIDS.iter().any(|known| {
        let prefix = known[..8].to_lowercase();
        l_uuids.iter().any(|u| u.starts_with(&prefix))
    })
}

fn upsert_discovered_device(
    devices: &mut Vec<DiscoveredDevice>,
    peripheral: btleplug::platform::Peripheral,
    name: String,
    uuids: Vec<String>,
    is_nano: bool,
) {
    let id = peripheral.id();
    if let Some(existing) = devices.iter_mut().find(|d| d.peripheral.id() == id) {
        if existing.name.is_empty() && !name.is_empty() {
            existing.name = name.clone();
        }
        if existing.uuids.is_empty() && !uuids.is_empty() {
            existing.uuids = uuids.clone();
        }
        existing.is_nano |= is_nano;
    } else {
        devices.push(DiscoveredDevice {
            peripheral,
            name,
            uuids,
            is_nano,
        });
    }
}

async fn known_peripherals_with_log<R: Runtime>(
    adapter: &Adapter,
    app: Option<&tauri::AppHandle<R>>,
    context: &str,
) -> Result<Vec<DiscoveredDevice>, String> {
    let log = |level: &str, msg: &str| {
        tracing::info!(target: "ble", "[ble] {}", msg);
        if let Some(a) = app {
            crate::ipc::events::emit_log(a, level, &format!("[ble] {}", msg));
        }
    };

    log("info", context);
    let peripherals = time::timeout(Duration::from_secs(3), adapter.peripherals())
        .await
        .map_err(|_| "known peripheral lookup timed out (3s)".to_string())?
        .map_err(|e| format!("known peripheral lookup failed: {e}"))?;

    log(
        "info",
        &format!("known peripheral lookup: {} device(s)", peripherals.len()),
    );

    let mut devices = Vec::new();
    for p in peripherals {
        let id = p.id();
        match time::timeout(Duration::from_millis(1500), p.properties()).await {
            Ok(Ok(Some(props))) => {
                let dev_name = props.local_name.clone().unwrap_or_default();
                let uuids: Vec<String> = props.services.iter().map(|u| u.to_string()).collect();
                let matched = looks_like_nano(&dev_name, &uuids);
                if dev_name.is_empty() && uuids.is_empty() {
                    log(
                        "info",
                        &format!("  known device {id}: <no name, no services>"),
                    );
                } else {
                    log(
                        "info",
                        &format!(
                            "  known device {id}: name=\"{}\" services=[{}] matched={}",
                            dev_name,
                            uuids.join(", "),
                            matched
                        ),
                    );
                }
                if matched || !dev_name.is_empty() || !uuids.is_empty() {
                    upsert_discovered_device(&mut devices, p, dev_name, uuids, matched);
                }
            }
            Ok(Ok(None)) => log("info", &format!("  known device {id}: properties=None")),
            Ok(Err(e)) => log(
                "warn",
                &format!("  known device {id}: properties() error: {e}"),
            ),
            Err(_) => log(
                "warn",
                &format!("  known device {id}: properties() timed out"),
            ),
        }
    }

    Ok(devices)
}

/// Get the BLE adapter with timeout.
pub async fn get_adapter() -> Result<Adapter, String> {
    get_adapter_with_log::<tauri::Wry>(None).await
}

pub async fn get_adapter_with_log<R: Runtime>(
    app: Option<&tauri::AppHandle<R>>,
) -> Result<Adapter, String> {
    let log = |level: &str, msg: &str| {
        tracing::info!(target: "ble", "[ble] {}", msg);
        if let Some(a) = app {
            crate::ipc::events::emit_log(a, level, &format!("[ble] {}", msg));
        }
    };

    log("info", "get_adapter: initializing manager");
    let result = time::timeout(Duration::from_secs(5), async {
        let manager = Manager::new().await.map_err(|e| {
            log("error", &format!("Manager::new failed: {e}"));
            format!("BLE init: {e}")
        })?;
        let adapters = manager.adapters().await.map_err(|e| {
            log("error", &format!("adapters() failed: {e}"));
            format!("BLE adapters: {e}")
        })?;
        let count = adapters.len();
        log("info", &format!("found {count} BLE adapter(s)"));
        for (i, a) in adapters.iter().enumerate() {
            log(
                "info",
                &format!("  adapter[{i}]: addr={:?}", a.adapter_info().await),
            );
        }
        adapters
            .into_iter()
            .next()
            .ok_or_else(|| "No BLE adapter".to_string())
    })
    .await;

    match result {
        Ok(r) => {
            log("info", "adapter acquired OK");
            r
        }
        Err(_) => {
            log("error", "adapter check timed out (5s)");
            Err("BLE adapter check timed out (5s)".into())
        }
    }
}

/// Scan for up to `timeout_secs` and return all discovered peripherals.
pub async fn scan_all(
    adapter: &Adapter,
    timeout_secs: u64,
) -> Result<Vec<DiscoveredDevice>, String> {
    scan_all_with_log::<tauri::Wry>(adapter, timeout_secs, None).await
}

pub async fn scan_all_with_log<R: Runtime>(
    adapter: &Adapter,
    timeout_secs: u64,
    app: Option<&tauri::AppHandle<R>>,
) -> Result<Vec<DiscoveredDevice>, String> {
    let log = |level: &str, msg: &str| {
        tracing::info!(target: "ble", "[ble] {}", msg);
        if let Some(a) = app {
            crate::ipc::events::emit_log(a, level, &format!("[ble] {}", msg));
        }
    };

    log("info", &format!("start_scan (timeout={timeout_secs}s)"));
    let start_result = time::timeout(
        Duration::from_secs(3),
        adapter.start_scan(ScanFilter::default()),
    )
    .await;
    if start_result.is_err() {
        let _ = adapter.stop_scan().await;
        log("error", "start_scan timed out (3s)");
        return Err("start_scan timed out (3s)".into());
    }
    if let Err(e) = start_result.unwrap() {
        log("error", &format!("start_scan failed: {e}"));
        return Err(format!("Scan start: {e}"));
    }
    log("info", "start_scan OK — scanning...");

    let events_result = time::timeout(Duration::from_secs(2), adapter.events()).await;
    let mut events = match events_result {
        Ok(Ok(s)) => {
            log("info", "event stream acquired");
            Some(s)
        }
        Ok(Err(e)) => {
            log("warn", &format!("events() error: {e} — polling only"));
            None
        }
        Err(_) => {
            log("warn", "events() timed out (2s) — polling only");
            None
        }
    };

    let mut devices = Vec::new();
    // Keep event discovery separate from property logging. Events often arrive before
    // CoreBluetooth exposes local_name/services, so using one "seen" set suppresses
    // the only useful diagnostic lines.
    let mut seen_events = std::collections::HashSet::new();
    let mut logged_properties = std::collections::HashMap::new();
    let deadline = time::Instant::now() + Duration::from_secs(timeout_secs);

    let mut last_poll = time::Instant::now();
    const POLL_INTERVAL: Duration = Duration::from_millis(500);
    let mut poll_count: u32 = 0;

    while time::Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(time::Instant::now());
        let sleep_dur = remaining.min(Duration::from_millis(200));

        if let Some(stream) = events.as_mut() {
            for _ in 0..10 {
                match stream.next().now_or_never() {
                    Some(Some(CentralEvent::DeviceDiscovered(id))) => {
                        if seen_events.insert(id.clone()) {
                            log("info", &format!("event: DeviceDiscovered({id})"));
                        }
                    }
                    Some(Some(other)) => {
                        tracing::debug!("[ble] event: {other:?}");
                    }
                    Some(None) => {
                        log("warn", "event stream closed — polling only");
                        events = None;
                        break;
                    }
                    None => break,
                }
            }
        }

        if last_poll.elapsed() >= POLL_INTERVAL {
            last_poll = time::Instant::now();
            poll_count += 1;
            match adapter.peripherals().await {
                Ok(peripherals) => {
                    let count = peripherals.len();
                    log("info", &format!("poll #{poll_count}: {count} device(s)"));
                    for p in peripherals {
                        let id = p.id();
                        match p.properties().await {
                            Ok(Some(props)) => {
                                let dev_name = props.local_name.clone().unwrap_or_default();
                                let uuids: Vec<String> =
                                    props.services.iter().map(|u| u.to_string()).collect();
                                let matched = looks_like_nano(&dev_name, &uuids);
                                let signature = format!("{}|{}", dev_name, uuids.join(","));

                                // Log every device the first time we have properties, and log again if
                                // the advertisement data changes from empty -> useful during the scan.
                                if logged_properties.get(&id).map(String::as_str)
                                    != Some(signature.as_str())
                                {
                                    if dev_name.is_empty() && uuids.is_empty() {
                                        log("info", &format!("  device {id}: <no name, no services> (cannot match)"));
                                    } else {
                                        log(
                                            "info",
                                            &format!(
                                            "  device {id}: name=\"{}\" services=[{}] matched={}",
                                            dev_name, uuids.join(", "), matched
                                        ),
                                        );
                                    }
                                    logged_properties.insert(id.clone(), signature);
                                }

                                // Keep any named or service-advertising device as a candidate so the
                                // scan summary is useful, but only auto-connect to devices that match
                                // Nano Cortex by name or known MIDI service UUID. Also keep devices
                                // that expose NO advertisement but are already connected at the OS
                                // level — a Nano held by bluetoothd (e.g. after an app restart) does
                                // not advertise, and the service-discovery fallback can identify it.
                                if matched || !dev_name.is_empty() || !uuids.is_empty() {
                                    upsert_discovered_device(
                                        &mut devices,
                                        p,
                                        dev_name,
                                        uuids,
                                        matched,
                                    );
                                } else if p.is_connected().await.unwrap_or(false) {
                                    log(
                                        "info",
                                        &format!(
                                            "  device {id}: system-connected without advertisement — keeping as probe candidate"
                                        ),
                                    );
                                    upsert_discovered_device(
                                        &mut devices,
                                        p,
                                        "<system-connected>".into(),
                                        Vec::new(),
                                        false,
                                    );
                                }
                            }
                            Ok(None) => {
                                let signature = "<properties=None>".to_string();
                                if logged_properties.get(&id).map(String::as_str)
                                    != Some(signature.as_str())
                                {
                                    log("info", &format!("  device {id}: properties=None"));
                                    logged_properties.insert(id.clone(), signature);
                                }
                                if p.is_connected().await.unwrap_or(false) {
                                    upsert_discovered_device(
                                        &mut devices,
                                        p,
                                        "<system-connected>".into(),
                                        Vec::new(),
                                        false,
                                    );
                                }
                            }
                            Err(e) => {
                                let signature = format!("<properties error: {e}>");
                                if logged_properties.get(&id).map(String::as_str)
                                    != Some(signature.as_str())
                                {
                                    log("warn", &format!("  device {id}: properties() error: {e}"));
                                    logged_properties.insert(id.clone(), signature);
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    log("warn", &format!("poll #{poll_count} failed: {e}"));
                }
            }
        }

        if devices.iter().any(|d| d.is_nano) {
            log("info", "found Nano Cortex — early exit");
            break;
        }

        tokio::time::sleep(sleep_dur).await;
    }

    let _ = adapter.stop_scan().await;
    log(
        "info",
        &format!(
            "scan done: {} candidate(s), {} polls",
            devices.len(),
            poll_count
        ),
    );
    for (i, d) in devices.iter().enumerate() {
        log(
            "info",
            &format!(
                "  candidate[{i}]: id={} name=\"{}\" services=[{}] is_nano={}",
                d.peripheral.id(),
                d.name,
                d.uuids.join(", "),
                d.is_nano
            ),
        );
    }
    Ok(devices)
}

/// Find "Neural DSP Nano Cortex" via scan + direct connect.
/// Wrapped in a hard timeout so the UI never hangs forever.
pub async fn find_and_connect() -> Result<BleHandle, String> {
    find_and_connect_with_log::<tauri::Wry>(None).await
}

/// Same as find_and_connect, but also emits progress events to the frontend log panel.
pub async fn find_and_connect_with_log<R: Runtime + 'static>(
    app: Option<&tauri::AppHandle<R>>,
) -> Result<BleHandle, String> {
    let log = |level: &str, msg: &str| {
        tracing::info!(target: "ble", "[ble] {}", msg);
        if let Some(a) = app {
            crate::ipc::events::emit_log(a, level, &format!("[ble] {}", msg));
        }
    };

    log("info", "find_and_connect START");
    let result = time::timeout(BLE_TOTAL_TIMEOUT, async {
        let adapter = get_adapter_with_log(app).await?;
        let known_devices = known_peripherals_with_log(
            &adapter,
            app,
            "checking already-known BLE peripherals before scanning",
        )
        .await?;
        let target = if let Some(target) = known_devices.into_iter().find(|d| d.is_nano) {
            log("info", "using already-known Nano Cortex BLE peripheral");
            target
        } else {
            let devices = scan_all_with_log(&adapter, 8, app).await?;
            let mut nano = None;
            let mut probes = Vec::new();
            for d in devices {
                if nano.is_none() && d.is_nano {
                    nano = Some(d);
                } else if d.peripheral.is_connected().await.unwrap_or(false) {
                    probes.push(d);
                }
            }
            // Fallback: a Nano already connected at the OS level (held by bluetoothd, e.g. after
            // an app restart) does not advertise, so it can only be identified by connecting and
            // discovering its services. Probe each system-connected candidate; discovery is a
            // read-only operation, harmless on non-Nano devices.
            if nano.is_none() {
                for d in probes {
                    log(
                        "info",
                        &format!("probing system-connected peripheral {} for MIDI service…", d.peripheral.id()),
                    );
                    let discovered = time::timeout(Duration::from_secs(4), d.peripheral.discover_services()).await;
                    if !matches!(discovered, Ok(Ok(()))) {
                        continue;
                    }
                    let uuids: Vec<String> = d
                        .peripheral
                        .services()
                        .iter()
                        .map(|s| s.uuid.to_string())
                        .collect();
                    if looks_like_nano("", &uuids) {
                        log("success", "system-connected peripheral exposes the MIDI service — reconnecting to it");
                        nano = Some(d);
                        break;
                    }
                }
            }
            nano.ok_or_else(|| {
                log("warn", "no Nano Cortex in known peripherals, scan results, or system-connected probes");
                "Nano Cortex not found over Bluetooth. If its LED is NOT pulsing blue, it is likely still connected to this Mac or another host — power-cycle the Nano (or toggle Bluetooth in System Settings), then try again. Otherwise hold EXIT + CAPTURE on the Nano to enter pairing mode.".to_string()
            })?
        };

        log("info", &format!("target found: name=\"{}\" services={}", target.name, target.uuids.join(", ")));
        let already_connected = target.peripheral.is_connected().await.unwrap_or(false);
        if already_connected {
            log("success", "already connected; reusing BLE peripheral");
        } else {
            let mut last_error = String::new();
            for attempt in 1..=BLE_CONNECT_ATTEMPTS {
                log(
                    "info",
                    &format!(
                        "connecting... attempt {attempt}/{BLE_CONNECT_ATTEMPTS} (timeout={}s)",
                        BLE_CONNECT_TIMEOUT.as_secs()
                    ),
                );
                match time::timeout(BLE_CONNECT_TIMEOUT, target.peripheral.connect()).await {
                    Ok(Ok(())) => {
                        log("success", "connected");
                        last_error.clear();
                        break;
                    }
                    Ok(Err(e)) => {
                        last_error = format!("BLE connect failed: {e}");
                        log("warn", &last_error);
                    }
                    Err(_) => {
                        if target.peripheral.is_connected().await.unwrap_or(false) {
                            log(
                                "success",
                                "connect call timed out, but CoreBluetooth reports connected",
                            );
                            last_error.clear();
                            break;
                        }
                        last_error =
                            format!("BLE connect timed out ({}s)", BLE_CONNECT_TIMEOUT.as_secs());
                        log("warn", &last_error);
                    }
                }

                let _ = time::timeout(Duration::from_secs(2), target.peripheral.disconnect()).await;
                time::sleep(Duration::from_millis(700)).await;
            }
            if !last_error.is_empty() {
                return Err(last_error);
            }
        }
        time::sleep(Duration::from_millis(800)).await;

        log("info", "discovering services...");
        time::timeout(BLE_SERVICE_DISCOVERY_TIMEOUT, target.peripheral.discover_services())
            .await
            .map_err(|_| {
                format!(
                    "Service discovery timed out ({}s)",
                    BLE_SERVICE_DISCOVERY_TIMEOUT.as_secs()
                )
            })?
            .map_err(|e| format!("Service discovery failed: {e}"))?;
        time::sleep(Duration::from_millis(300)).await;

        let characteristics: Vec<_> = target.peripheral.characteristics().into_iter().collect();
        let service_uuids: Vec<String> = target
            .peripheral
            .services()
            .iter()
            .map(|s| s.uuid.to_string())
            .collect();
        let inspection = inspect_characteristics(service_uuids, &characteristics);
        log(
            "info",
            &format!(
                "inspection: services=[{}] readable=[{}] writable=[{}] notify/indicate=[{}]",
                inspection.service_uuids.join(", "),
                inspection.readable_characteristics.join(", "),
                inspection.writable_characteristics.join(", "),
                inspection.notifying_characteristics.join(", ")
            ),
        );
        let packet_logger = BlePacketLogger::new();
        for c in &characteristics {
            packet_logger.record_characteristic(c);
        }
        let all_uuids_str: Vec<String> = characteristics
            .iter()
            .map(|c| format!("{} ({:?})", c.uuid, c.properties))
            .collect();
        log(
            "info",
            &format!(
                "found {} characteristic(s): {}",
                characteristics.len(),
                all_uuids_str.join(", ")
            ),
        );

        if BlePacketLogger::is_enabled() {
            log("info", "BLE debug packet logging enabled (NANO_BLE_DEBUG=1)");
            for c in characteristics
                .iter()
                .filter(|c| c.properties.contains(CharPropFlags::READ))
            {
                match time::timeout(Duration::from_secs(2), target.peripheral.read(c)).await {
                    Ok(Ok(bytes)) => {
                        packet_logger.record_payload(BlePacketDirection::Read, c, &bytes, None);
                        log("info", &format!("read {}: {}", c.uuid, hex(&bytes)));
                    }
                    Ok(Err(e)) => log("warn", &format!("read {} failed: {e}", c.uuid)),
                    Err(_) => log("warn", &format!("read {} timed out", c.uuid)),
                }
            }
        }

        let is_writable = |props: CharPropFlags| {
            props.contains(CharPropFlags::WRITE)
                || props.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE)
        };
        let is_notifiable = |props: CharPropFlags| {
            props.contains(CharPropFlags::NOTIFY) || props.contains(CharPropFlags::INDICATE)
        };

        let matched_ch = characteristics
            .iter()
            .find_map(|c| {
                let cuuid = c.uuid.to_string().to_lowercase();
                if !is_writable(c.properties) {
                    return None;
                }
                let hits = MIDI_IO_CHAR_UUIDS
                    .iter()
                    .any(|known| cuuid.starts_with(&known[..8].to_lowercase()));
                if hits {
                    Some(c.clone())
                } else {
                    None
                }
            })
            .or_else(|| {
                characteristics
                    .iter()
                    .find(|c| is_writable(c.properties))
                    .cloned()
            })
            .ok_or_else(|| {
                format!(
                    "No writable MIDI characteristic found. Available: {}",
                    all_uuids_str.join(", ")
                )
            })?;

        log(
            "info",
            &format!(
                "selected MIDI write char: {} (props: {:?})",
                matched_ch.uuid, matched_ch.properties
            ),
        );

        let notifiable_chars: Vec<_> = characteristics
            .iter()
            .filter(|c| is_notifiable(c.properties))
            .cloned()
            .collect();
        let mut subscribed_characteristics = Vec::new();
        if notifiable_chars.is_empty() {
            log("info", "no NOTIFY/INDICATE characteristic; skipping subscribe");
        } else {
            for notify_ch in &notifiable_chars {
                let sub_ok = time::timeout(Duration::from_secs(3), target.peripheral.subscribe(notify_ch))
                    .await
                    .map(|r| r.is_ok())
                    .unwrap_or(false);
                log(
                    "info",
                    &format!(
                        "subscribe notify/indicate char {}: {}",
                        notify_ch.uuid,
                        if sub_ok { "OK" } else { "FAILED (continuing anyway)" }
                    ),
                );
                if sub_ok {
                    subscribed_characteristics.push(notify_ch.clone());
                }
            }
        }

        if !subscribed_characteristics.is_empty() {
            match target.peripheral.notifications().await {
                Ok(mut stream) => {
                    let logger = packet_logger.clone();
                    let known_characteristics = characteristics.clone();
                    let app_for_notifications = app.cloned();
                    tokio::spawn(async move {
                        while let Some(notification) = stream.next().await {
                            let payload_hex = hex(&notification.value);
                            if let Some(ch) = known_characteristics
                                .iter()
                                .find(|c| c.uuid == notification.uuid)
                            {
                                let msg = format!(
                                    "[ble] notification {} (props: {:?}): {}",
                                    notification.uuid, ch.properties, payload_hex
                                );
                                tracing::info!(target: "ble", "{}", msg);
                                if let Some(app) = app_for_notifications.as_ref() {
                                    crate::ipc::events::emit_log(app, "debug", &msg);
                                }
                                logger.record_payload(
                                    BlePacketDirection::Notification,
                                    ch,
                                    &notification.value,
                                    Some("raw notification; decode is provisional".into()),
                                );
                            } else {
                                let msg = format!(
                                    "[ble] notification {}: {}",
                                    notification.uuid, payload_hex
                                );
                                tracing::info!(target: "ble", "{}", msg);
                                if let Some(app) = app_for_notifications.as_ref() {
                                    crate::ipc::events::emit_log(app, "debug", &msg);
                                }
                            }
                        }
                        if let Some(app) = app_for_notifications.as_ref() {
                            crate::ipc::events::emit_log(
                                app,
                                "warn",
                                "[ble] notification stream ended",
                            );
                        }
                    });
                }
                Err(e) => log("warn", &format!("notifications() failed: {e}")),
            }
        }

        Ok(BleHandle {
            peripheral: Arc::new(Mutex::new(target.peripheral)),
            characteristic: matched_ch,
            subscribed_characteristics,
            packet_logger,
        })
    })
    .await;

    match result {
        Ok(Ok(handle)) => {
            log("success", "find_and_connect OK");
            Ok(handle)
        }
        Ok(Err(e)) => {
            log("error", &format!("find_and_connect failed: {e}"));
            Err(e)
        }
        Err(_) => {
            log(
                "error",
                &format!("TIMEOUT after {}s", BLE_TOTAL_TIMEOUT.as_secs()),
            );
            Err(format!(
                "BLE operation timed out after {}s. Try again or restart the app.",
                BLE_TOTAL_TIMEOUT.as_secs()
            ))
        }
    }
}

// Internal scan result
pub struct DiscoveredDevice {
    pub peripheral: btleplug::platform::Peripheral,
    pub name: String,
    pub uuids: Vec<String>,
    pub is_nano: bool,
}
