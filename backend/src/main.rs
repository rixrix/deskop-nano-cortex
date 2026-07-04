//! Binary entry point: delegates to `desktop_nano_cortex_lib::run()`.
//!
//! @see docs/specs/130-backend-platform/spec.md [FR-17]
//! @see docs/specs/130-backend-platform/design.md [DES-PLAT-SHELL]

// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    desktop_nano_cortex_lib::run()
}
