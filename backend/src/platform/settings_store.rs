//! Persistent settings load and save via tauri-plugin-store.
//!
//! @see docs/specs/130-backend-platform/spec.md [FR-6]
//! @see docs/specs/130-backend-platform/design.md [DES-PLAT-SETTINGS]

use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::domain::Settings;

const STORE_FILE: &str = "settings.json";

/// Load persisted settings from the Tauri store plugin.
pub fn load_settings(app: &AppHandle) -> Result<Settings, String> {
    let store = app.store(STORE_FILE).map_err(|e| format!("Store: {e}"))?;
    let value = store.get("settings");
    let settings: Settings =
        serde_json::from_value(value.unwrap_or(serde_json::json!({}))).unwrap_or_default();
    Ok(settings)
}

/// Save settings to the Tauri store plugin.
pub fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| format!("Store: {e}"))?;
    let value = serde_json::to_value(settings).map_err(|e| format!("Serialize: {e}"))?;
    store.set("settings", value);
    store.save().map_err(|e| format!("Save: {e}"))
}
