//! USB port watchdog: polls output ports at 1s intervals and falls back to BLE on disconnect.
//!
//! @see docs/specs/110-backend-midi-ble/spec.md [FR-12]
//! @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-DOMAIN]

use std::sync::Arc;
use std::time::Duration;

use tauri::Runtime;

use crate::app::AppState;
use crate::domain::{DeviceState, MidiPort, PortKind};
use crate::infrastructure::midi::port_manager;
use crate::ipc::events;

fn port_signature(ports: &[MidiPort]) -> Vec<String> {
    let mut signature = ports
        .iter()
        .map(|port| format!("{}|{}|{:?}", port.id, port.name, port.direction))
        .collect::<Vec<_>>();
    signature.sort();
    signature
}

pub fn spawn_usb_port_watchdog<R>(app_handle: tauri::AppHandle<R>, state: Arc<AppState>)
where
    R: Runtime + 'static,
{
    tauri::async_runtime::spawn(async move {
        let mut last_signature: Option<Vec<String>> = None;

        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;

            let ports = match port_manager::list_output_ports() {
                Ok(ports) => ports,
                Err(error) => {
                    events::emit_log(
                        &app_handle,
                        "warn",
                        &format!("USB MIDI port check failed: {error}"),
                    );
                    continue;
                }
            };

            let signature = port_signature(&ports);
            if last_signature.as_ref() != Some(&signature) {
                events::emit_ports_changed(&app_handle, &ports);
                last_signature = Some(signature);
            }

            let connected_usb_name = {
                let device = state.device.lock().await;
                match device.as_ref() {
                    Some(device)
                        if device.kind == PortKind::Usb
                            && device.state == DeviceState::Connected =>
                    {
                        Some(device.name.clone())
                    }
                    _ => None,
                }
            };

            let Some(device_name) = connected_usb_name else {
                continue;
            };

            if ports.iter().any(|port| port.name == device_name) {
                continue;
            }

            state.midi_input_connections.lock().await.clear();
            events::emit_log(
                &app_handle,
                "warn",
                &format!("USB MIDI device disconnected: {device_name}"),
            );

            #[cfg(feature = "ble")]
            let ble_is_connected = {
                let handle = state.ble_peripheral.lock().await.clone();
                match handle {
                    Some(handle) => handle.is_connected().await,
                    None => false,
                }
            };

            #[cfg(not(feature = "ble"))]
            let ble_is_connected = false;

            if ble_is_connected {
                state
                    .set_connected("Neural DSP Nano Cortex (Bluetooth)".into(), PortKind::Ble)
                    .await;
                {
                    let mut nano = state.nano_state.lock().await;
                    nano.connection_status = "connected".into();
                    nano.sync_mode = crate::domain::SyncMode::CommandOnly;
                    nano.stale = false;
                }
                events::emit_connected(&app_handle, "Neural DSP Nano Cortex (Bluetooth)");
                events::emit_log(
                    &app_handle,
                    "info",
                    "USB command transport lost; continuing with BLE observation transport",
                );
            } else {
                state.set_disconnected().await;
                {
                    let mut nano = state.nano_state.lock().await;
                    nano.connection_status = "disconnected".into();
                    nano.sync_mode = crate::domain::SyncMode::DisconnectedPreview;
                    nano.stale = true;
                }
                events::emit_disconnected(&app_handle);
            }
        }
    });
}
