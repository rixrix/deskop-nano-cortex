//! MidiPort, PortDirection, and PortKind value objects for the IPC boundary.
//!
//! @see docs/specs/100-backend-midi-usb/spec.md [FR-1] [FR-3]
//! @see docs/specs/100-backend-midi-usb/design.md [DES-USB-DATA]

use serde::{Deserialize, Serialize};

/// Direction of a MIDI port from the host's perspective.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PortDirection {
    #[serde(rename = "in")]
    Input,
    #[serde(rename = "out")]
    Output,
}

/// Kind of MIDI transport.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PortKind {
    #[serde(rename = "usb")]
    Usb,
    #[serde(rename = "ble")]
    Ble,
}

/// Information about a discovered MIDI port.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiPort {
    /// Opaque stable identifier across enumeration cycles.
    pub id: String,
    /// Human-readable port name (e.g. "Nano Cortex", "Nano Cortex MIDI OUT").
    pub name: String,
    /// Port direction from host perspective.
    pub direction: PortDirection,
    /// Transport type.
    pub kind: PortKind,
}

impl MidiPort {
    /// Check if this port looks like a Nano Cortex device.
    pub fn is_nano_cortex(&self) -> bool {
        let lower = self.name.to_lowercase();
        lower.contains("nano") || lower.contains("cortex")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn port(name: &str) -> MidiPort {
        MidiPort {
            id: "test".into(),
            name: name.into(),
            direction: PortDirection::Output,
            kind: PortKind::Usb,
        }
    }

    #[test]
    fn matches_nano_cortex_case_insensitively() {
        assert!(port("Nano Cortex").is_nano_cortex());
        assert!(port("NANO CORTEX MIDI OUT").is_nano_cortex());
        assert!(port("neural cortex").is_nano_cortex());
        assert!(port("My nano synth").is_nano_cortex());
    }

    #[test]
    fn rejects_unrelated_ports() {
        assert!(!port("IAC Driver Bus 1").is_nano_cortex());
        assert!(!port("MIDI OUT (Port 1)").is_nano_cortex());
    }

    #[test]
    fn port_direction_serializes_to_host_perspective() {
        assert_eq!(
            serde_json::to_string(&PortDirection::Input).unwrap(),
            "\"in\""
        );
        assert_eq!(
            serde_json::to_string(&PortDirection::Output).unwrap(),
            "\"out\""
        );
        assert_eq!(serde_json::to_string(&PortKind::Usb).unwrap(), "\"usb\"");
        assert_eq!(serde_json::to_string(&PortKind::Ble).unwrap(), "\"ble\"");
    }
}
