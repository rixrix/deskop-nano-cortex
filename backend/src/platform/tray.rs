//! System tray creation and connection-state tooltip updates.
//!
//! @see docs/specs/130-backend-platform/spec.md [FR-1]
//! @see docs/specs/130-backend-platform/design.md [DES-PLAT-TRAY]

use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Manager, Runtime};

/// Create the system tray with connection status indicator.
pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<TrayIcon<R>> {
    let mut builder = TrayIconBuilder::new();
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    let tray = builder
        .tooltip("Unofficial Nano Cortex")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(tray)
}

/// Update the tray tooltip to reflect connection state.
pub fn update_tray_connection<R: Runtime>(
    tray: &TrayIcon<R>,
    connected: bool,
    device_name: Option<&str>,
) {
    let tip = if connected {
        format!(
            "Nano Cortex — Connected ({})",
            device_name.unwrap_or("unknown")
        )
    } else {
        "Nano Cortex — Disconnected".to_string()
    };
    tray.set_tooltip(Some(&tip)).ok();
}
