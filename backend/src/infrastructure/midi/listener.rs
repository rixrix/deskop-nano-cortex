//! Persistent USB MIDI input listener delivering timestamped messages over mpsc.
//!
//! @see docs/specs/100-backend-midi-usb/spec.md [FR-6] [FR-7]
//! @see docs/specs/100-backend-midi-usb/design.md [DES-USB-API]

use midir::{Ignore, MidiInput, MidiInputConnection};
use std::sync::mpsc;

use crate::domain::MidiMessage;

/// Start listening for incoming MIDI messages on a named input port.
/// Returns a receiver and a handle to drop the connection.
pub fn start_listener(
    port_name: &str,
) -> Result<(mpsc::Receiver<MidiMessage>, MidiInputConnection<()>), String> {
    let mut midi_in = MidiInput::new("Nano Cortex Listener")
        .map_err(|e| format!("Failed to create MIDI input: {e}"))?;
    midi_in.ignore(Ignore::None);

    let ports = midi_in.ports();
    let port = ports
        .iter()
        .find(|p| midi_in.port_name(p).is_ok_and(|name| name == port_name))
        .ok_or_else(|| format!("Input port '{port_name}' not found"))?;

    let (tx, rx) = mpsc::channel::<MidiMessage>();
    let start = std::time::Instant::now();

    let conn = midi_in
        .connect(
            port,
            "nano-cortex-listener",
            move |_stamp, data, _| {
                let ts = start.elapsed().as_millis() as u64;
                let _ = tx.send(MidiMessage::new(ts, data.to_vec()));
            },
            (),
        )
        .map_err(|e| format!("Failed to connect input: {e}"))?;

    Ok((rx, conn))
}
