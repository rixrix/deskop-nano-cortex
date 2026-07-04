//! USB MIDI port enumeration and Nano Cortex name matching.
//!
//! @see docs/specs/100-backend-midi-usb/spec.md [FR-1] [FR-2]
//! @see docs/specs/100-backend-midi-usb/design.md [DES-USB-API] [DES-USB-ARCH]

use crate::domain::{MidiPort, PortDirection, PortKind};
use midir::{MidiInput, MidiOutput};

/// Enumerate all available MIDI output ports.
/// Filters out virtual/internal ports where possible.
pub fn list_output_ports() -> Result<Vec<MidiPort>, String> {
    let midi_out = MidiOutput::new("Nano Cortex Scanner")
        .map_err(|e| format!("Failed to create MIDI output: {e}"))?;

    let ports: Vec<MidiPort> = midi_out
        .ports()
        .iter()
        .filter_map(|p| {
            let name = midi_out.port_name(p).ok()?;
            Some(MidiPort {
                id: format!("usb:{}", name),
                name,
                direction: PortDirection::Output,
                kind: PortKind::Usb,
            })
        })
        .collect();

    Ok(ports)
}

/// Enumerate all available MIDI input ports.
pub fn list_input_ports() -> Result<Vec<MidiPort>, String> {
    let midi_in = MidiInput::new("Nano Cortex Input Scanner")
        .map_err(|e| format!("Failed to create MIDI input: {e}"))?;

    let ports: Vec<MidiPort> = midi_in
        .ports()
        .iter()
        .filter_map(|p| {
            let name = midi_in.port_name(p).ok()?;
            Some(MidiPort {
                id: format!("usb-in:{}", name),
                name,
                direction: PortDirection::Input,
                kind: PortKind::Usb,
            })
        })
        .collect();

    Ok(ports)
}

/// Find the first output port that looks like a Nano Cortex device.
pub fn find_nano_cortex_port(ports: &[MidiPort]) -> Option<&MidiPort> {
    ports.iter().find(|p| p.is_nano_cortex())
}

/// Find the best host input port for receiving messages from Nano Cortex.
/// MIDI port names are often from the device perspective: device "OUT" is host input.
pub fn find_nano_cortex_input_port(ports: &[MidiPort]) -> Option<&MidiPort> {
    ports
        .iter()
        .find(|p| {
            let lower = p.name.to_lowercase();
            p.is_nano_cortex() && lower.contains("out")
        })
        .or_else(|| ports.iter().find(|p| p.is_nano_cortex()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_nano_cortex() {
        let p1 = MidiPort {
            id: "test".into(),
            name: "Nano Cortex MIDI OUT".into(),
            direction: PortDirection::Output,
            kind: PortKind::Usb,
        };
        assert!(p1.is_nano_cortex());

        let p2 = MidiPort {
            id: "test".into(),
            name: "MIDI OUT (Port 1)".into(),
            direction: PortDirection::Output,
            kind: PortKind::Usb,
        };
        assert!(!p2.is_nano_cortex());
    }

    #[test]
    fn test_find_nano_cortex_port() {
        let ports = vec![
            MidiPort {
                id: "a".into(),
                name: "MIDI Out 1".into(),
                direction: PortDirection::Output,
                kind: PortKind::Usb,
            },
            MidiPort {
                id: "b".into(),
                name: "Nano Cortex".into(),
                direction: PortDirection::Output,
                kind: PortKind::Usb,
            },
        ];
        let found = find_nano_cortex_port(&ports);
        assert!(found.is_some());
        assert_eq!(found.unwrap().name, "Nano Cortex");
    }

    #[test]
    fn input_match_prefers_device_out_port() {
        // Device "OUT" is the host's input; prefer it when several Nano ports exist.
        let ports = vec![
            MidiPort {
                id: "in".into(),
                name: "Nano Cortex MIDI IN".into(),
                direction: PortDirection::Input,
                kind: PortKind::Usb,
            },
            MidiPort {
                id: "out".into(),
                name: "Nano Cortex MIDI OUT".into(),
                direction: PortDirection::Input,
                kind: PortKind::Usb,
            },
        ];
        assert_eq!(
            find_nano_cortex_input_port(&ports).unwrap().name,
            "Nano Cortex MIDI OUT"
        );
    }

    #[test]
    fn input_match_falls_back_to_any_nano_port() {
        // macOS often exposes a single port simply named "Nano Cortex".
        let ports = vec![MidiPort {
            id: "x".into(),
            name: "Nano Cortex".into(),
            direction: PortDirection::Input,
            kind: PortKind::Usb,
        }];
        assert_eq!(
            find_nano_cortex_input_port(&ports).unwrap().name,
            "Nano Cortex"
        );
        assert!(find_nano_cortex_input_port(&[]).is_none());
    }
}
