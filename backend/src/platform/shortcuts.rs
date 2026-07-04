//! Global keyboard shortcut registration for preset switching keys.
//!
//! @see docs/specs/130-backend-platform/spec.md [FR-4]
//! @see docs/specs/130-backend-platform/design.md [DES-PLAT-SHORTCUTS]

use tauri::AppHandle;

/// Register preset-switching keyboard shortcuts.
pub fn register_shortcuts(_app: &AppHandle) -> Result<(), String> {
    // Deferred for the workbench release: unmodified number/arrow shortcuts interfere with typing
    // in the control surface. Re-enable behind an explicit user setting in a later release.
    Ok(())
}
