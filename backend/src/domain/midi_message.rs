//! Timestamped raw MIDI message value object with helper predicates.
//!
//! @see docs/specs/100-backend-midi-usb/spec.md [FR-7]
//! @see docs/specs/100-backend-midi-usb/design.md [DES-USB-DATA]

use serde::Serialize;

/// A raw MIDI message with a monotonic timestamp.
#[derive(Debug, Clone, Serialize)]
pub struct MidiMessage {
    /// Monotonic milliseconds since session start.
    pub ts_ms: u64,
    /// Raw MIDI bytes (e.g. [0xC0, 0x00] for Program Change → preset 0).
    pub bytes: Vec<u8>,
}

impl MidiMessage {
    pub fn new(ts_ms: u64, bytes: Vec<u8>) -> Self {
        Self { ts_ms, bytes }
    }

    /// Parse the MIDI status byte to determine the message type.
    pub fn status_byte(&self) -> Option<u8> {
        self.bytes.first().copied()
    }

    /// Returns true if this is a MIDI real-time message (single byte, no data).
    pub fn is_realtime(&self) -> bool {
        matches!(self.bytes.first(), Some(0xF8..=0xFF))
    }

    /// Returns true if this is a System Exclusive message.
    pub fn is_sysex(&self) -> bool {
        self.bytes.first() == Some(&0xF0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_byte_returns_first_byte() {
        assert_eq!(
            MidiMessage::new(10, vec![0xC0, 0x05]).status_byte(),
            Some(0xC0)
        );
        assert_eq!(MidiMessage::new(0, vec![]).status_byte(), None);
    }

    #[test]
    fn detects_realtime_messages() {
        // 0xF8..=0xFF are single-byte real-time messages (clock, start, stop, ...).
        assert!(MidiMessage::new(0, vec![0xF8]).is_realtime());
        assert!(MidiMessage::new(0, vec![0xFF]).is_realtime());
        assert!(!MidiMessage::new(0, vec![0xC0, 0x00]).is_realtime());
        assert!(!MidiMessage::new(0, vec![]).is_realtime());
    }

    #[test]
    fn detects_sysex_but_not_program_change() {
        assert!(MidiMessage::new(0, vec![0xF0, 0x7E, 0xF7]).is_sysex());
        assert!(!MidiMessage::new(0, vec![0xC0, 0x00]).is_sysex());
    }
}
