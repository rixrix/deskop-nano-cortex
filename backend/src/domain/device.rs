//! Device and DeviceState value objects tracking connection lifecycle state.
//!
//! @see docs/specs/100-backend-midi-usb/spec.md [FR-9]
//! @see docs/specs/100-backend-midi-usb/design.md [DES-USB-DATA]

use serde::{Deserialize, Serialize};

/// The state of a connected device.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DeviceState {
    #[serde(rename = "disconnected")]
    Disconnected,
    #[serde(rename = "connecting")]
    Connecting,
    #[serde(rename = "connected")]
    Connected,
    #[serde(rename = "error")]
    Error,
}

/// Represents a known device (Nano Cortex).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    /// Display name (e.g. "Nano Cortex").
    pub name: String,
    /// Current connection state.
    pub state: DeviceState,
    /// Which transport this device uses.
    pub kind: super::port::PortKind,
    /// Last known preset index (0-63).
    pub last_preset: Option<u8>,
    /// Error message if state == Error.
    pub last_error: Option<String>,
}

impl Device {
    pub fn new(name: String, kind: super::port::PortKind) -> Self {
        Self {
            name,
            state: DeviceState::Disconnected,
            kind,
            last_preset: None,
            last_error: None,
        }
    }
}
