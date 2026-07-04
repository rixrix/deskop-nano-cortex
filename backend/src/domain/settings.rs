//! Persisted application settings value object with window geometry and last-device fields.
//!
//! @see docs/specs/130-backend-platform/spec.md [FR-8]
//! @see docs/specs/130-backend-platform/design.md [DES-PLAT-SETTINGS]

use serde::{Deserialize, Serialize};

/// Persisted settings for the desktop app.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// Last connected device name (for auto-reconnect).
    pub last_device_name: Option<String>,
    /// Last preset index (0-63) to restore on launch.
    pub last_preset: Option<u8>,
    /// Window geometry.
    pub window_x: Option<i32>,
    pub window_y: Option<i32>,
    pub window_w: Option<i32>,
    pub window_h: Option<i32>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            last_device_name: None,
            last_preset: None,
            window_x: None,
            window_y: None,
            window_w: Some(800),
            window_h: Some(600),
        }
    }
}
