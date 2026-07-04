//! Raw MIDI byte send over a named USB output port.
//!
//! @see docs/specs/100-backend-midi-usb/spec.md [FR-5]
//! @see docs/specs/100-backend-midi-usb/design.md [DES-USB-API]

use midir::{MidiOutput, MidiOutputConnection};

/// Send raw MIDI bytes to a named output port.
/// Connects, sends, then disconnects.
pub fn send_to_port(port_name: &str, bytes: &[u8]) -> Result<(), String> {
    let midi_out = MidiOutput::new("Nano Cortex Sender")
        .map_err(|e| format!("Failed to create MIDI output: {e}"))?;

    let ports = midi_out.ports();
    let port = ports
        .iter()
        .find(|p| midi_out.port_name(p).is_ok_and(|name| name == port_name))
        .ok_or_else(|| format!("Port '{port_name}' not found"))?;

    let mut conn: MidiOutputConnection = midi_out
        .connect(port, "nano-cortex-sender")
        .map_err(|e| format!("Failed to connect: {e}"))?;

    conn.send(bytes)
        .map_err(|e| format!("Failed to send: {e}"))?;
    // Connection dropped, port released.
    Ok(())
}
