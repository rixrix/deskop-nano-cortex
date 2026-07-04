//! Pure serde boundary helpers converting domain types to JSON wire values.
//!
//! @see docs/specs/120-backend-ipc/spec.md [FR-26]
//! @see docs/specs/120-backend-ipc/design.md [DES-IPC-MAPPING]

use crate::domain::{MidiMessage, MidiPort};

/// Convert a domain MidiPort to the wire format.
pub fn port_to_wire(port: &MidiPort) -> serde_json::Value {
    serde_json::to_value(port).unwrap_or_default()
}

/// Convert a slice of MidiPorts to a JSON array for event payloads.
pub fn ports_to_wire(ports: &[MidiPort]) -> serde_json::Value {
    serde_json::to_value(ports).unwrap_or_default()
}

/// Convert a MidiMessage to the wire format.
pub fn message_to_wire(msg: &MidiMessage) -> serde_json::Value {
    serde_json::to_value(msg).unwrap_or_default()
}
