//! Compile-time build configuration reading feature flags for BLE support.
//!
//! @see docs/specs/120-backend-ipc/spec.md [FR-25]
//! @see docs/specs/120-backend-ipc/design.md [DES-IPC-ERROR]

/// Build-time configuration, set by env-driven feature flags.
#[derive(Debug, Clone)]
pub struct BuildConfig {
    /// Whether BLE support is compiled in (enabled via the `ble` feature).
    pub ble_enabled: bool,
}

impl BuildConfig {
    pub fn from_env() -> Self {
        Self {
            ble_enabled: cfg!(feature = "ble"),
        }
    }
}
