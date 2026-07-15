//! Tauri crate entry: plugin registration, AppState setup, command wiring, and shell events.
//!
//! @see docs/specs/130-backend-platform/spec.md [FR-13]
//! @see docs/specs/130-backend-platform/design.md [DES-PLAT-SHELL]

pub mod app;
pub mod domain;
pub mod infrastructure;
pub mod ipc;
pub mod platform;

use app::AppState;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let app_state = AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(app_state.clone())
        .setup(move |app| {
            // Load persisted settings
            match platform::settings_store::load_settings(app.handle()) {
                Ok(settings) => {
                    let mut s = app_state.settings.blocking_lock();
                    *s = settings;
                }
                Err(e) => tracing::warn!("Failed to load settings: {e}"),
            }

            // Create system tray
            if let Ok(tray) = platform::tray::create_tray(app.handle()) {
                let _ = tray;
            }

            // Register global shortcuts
            if let Err(e) = platform::shortcuts::register_shortcuts(app.handle()) {
                tracing::warn!("Failed to register shortcuts: {e}");
            }

            infrastructure::midi::port_watchdog::spawn_usb_port_watchdog(
                app.handle().clone(),
                app_state.clone(),
            );

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::commands::trace_marker,
            ipc::commands::export_settings_json,
            ipc::commands::import_settings_json,
            ipc::commands::get_app_version,
            ipc::commands::open_external,
            ipc::commands::export_diagnostic_bundle,
            ipc::commands::list_ports,
            ipc::commands::connect,
            ipc::commands::disconnect,
            ipc::commands::send_midi,
            ipc::commands::send_ble_frame,
            ipc::commands::request_state_dump,
            ipc::commands::set_amp_knob,
            ipc::commands::save_active_preset,
            ipc::commands::request_metadata,
            ipc::commands::request_fx_params,
            ipc::commands::request_cab_ir_params,
            ipc::commands::set_fx_param,
            ipc::commands::set_fx_model,
            ipc::commands::set_capture_slot,
            ipc::commands::set_cab_ir_slot,
            ipc::commands::set_gate_enabled,
            ipc::commands::set_gate_reduction,
            ipc::commands::set_capture_volume,
            ipc::commands::set_cab_ir_param,
            ipc::commands::set_cab_ir_mic_position,
            ipc::commands::set_footswitch_assignments,
            ipc::commands::acknowledge_preset_change,
            ipc::commands::get_state,
            ipc::commands::get_device_name,
            ipc::commands::get_nano_state,
            ipc::commands::get_ble_capabilities,
            ipc::commands::get_ble_debug_log,
            ipc::commands::ble_scan,
            ipc::commands::ble_ping,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app_handle = window.app_handle().clone();
                let pos = window.outer_position().ok();
                let size = window.outer_size().ok();
                tauri::async_runtime::spawn(async move {
                    if let Some(state) = app_handle.try_state::<Arc<AppState>>() {
                        if let (Some(pos), Some(size)) = (pos, size) {
                            let mut settings = state.settings.lock().await;
                            settings.window_x = Some(pos.x);
                            settings.window_y = Some(pos.y);
                            settings.window_w = Some(size.width as i32);
                            settings.window_h = Some(size.height as i32);
                            let _ = platform::settings_store::save_settings(&app_handle, &settings);
                        }
                        // Release the BLE peripheral so the Nano is free to advertise/pair again
                        // instead of staying held by bluetoothd after the app closes.
                        #[cfg(feature = "ble")]
                        {
                            let handle = state.ble_peripheral.lock().await.take();
                            if let Some(handle) = handle {
                                let _ = tokio::time::timeout(
                                    std::time::Duration::from_secs(3),
                                    handle.disconnect(),
                                )
                                .await;
                            }
                        }
                    }
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
