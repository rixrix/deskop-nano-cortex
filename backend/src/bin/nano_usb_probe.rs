//! Diagnostic binary: enumerate all USB MIDI input ports and log raw MIDI events.
//!
//! @see docs/specs/100-backend-midi-usb/spec.md [FR-12]
//! @see docs/specs/100-backend-midi-usb/design.md [DES-USB-TEST]

use midir::{Ignore, MidiInput, MidiInputConnection};
use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::mpsc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Debug)]
struct MidiEvent {
    port_name: String,
    stamp: u64,
    bytes: Vec<u8>,
}

fn repo_log_path() -> PathBuf {
    let backend_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    backend_dir
        .parent()
        .unwrap_or(&backend_dir)
        .join("logs")
        .join("usb-probe.log")
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn describe(bytes: &[u8]) -> &'static str {
    let Some(status) = bytes.first().copied() else {
        return "empty";
    };

    match status {
        0x80..=0x8F => "note-off",
        0x90..=0x9F => "note-on",
        0xA0..=0xAF => "poly-pressure",
        0xB0..=0xBF => "control-change",
        0xC0..=0xCF => "program-change",
        0xD0..=0xDF => "channel-pressure",
        0xE0..=0xEF => "pitch-bend",
        0xF0 => "sysex",
        0xF1 => "time-code",
        0xF2 => "song-position",
        0xF3 => "song-select",
        0xF6 => "tune-request",
        0xF8 => "timing-clock",
        0xFA => "start",
        0xFB => "continue",
        0xFC => "stop",
        0xFE => "active-sensing",
        0xFF => "reset",
        _ => "system",
    }
}

fn open_log() -> Result<std::fs::File, Box<dyn std::error::Error>> {
    let path = repo_log_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    Ok(OpenOptions::new().create(true).append(true).open(path)?)
}

fn log_line(log: &mut std::fs::File, line: &str) {
    println!("{line}");
    let _ = writeln!(log, "{line}");
    let _ = log.flush();
}

fn scan_input_ports() -> Result<Vec<String>, String> {
    let midi_in = MidiInput::new("Nano USB Probe Scanner")
        .map_err(|error| format!("failed to create MIDI scanner: {error}"))?;

    midi_in
        .ports()
        .iter()
        .map(|port| {
            midi_in
                .port_name(port)
                .map_err(|error| format!("failed to read MIDI port name: {error}"))
        })
        .collect()
}

fn connect_port(
    index: usize,
    expected_name: &str,
    tx: mpsc::Sender<MidiEvent>,
) -> Result<MidiInputConnection<()>, String> {
    let mut midi_in = MidiInput::new(&format!("Nano USB Probe {index}"))
        .map_err(|error| format!("failed to create MIDI input for {expected_name}: {error}"))?;
    midi_in.ignore(Ignore::None);

    let ports = midi_in.ports();
    let port_index = ports
        .iter()
        .position(|port| {
            midi_in
                .port_name(port)
                .is_ok_and(|name| name == expected_name)
        })
        .or_else(|| (index < ports.len()).then_some(index))
        .ok_or_else(|| format!("input port disappeared: {expected_name}"))?;

    let port = ports
        .get(port_index)
        .ok_or_else(|| format!("input port index disappeared: {expected_name}"))?;
    let actual_name = midi_in
        .port_name(port)
        .unwrap_or_else(|_| expected_name.to_string());
    let callback_name = actual_name.clone();

    midi_in
        .connect(
            port,
            &format!("nano-usb-probe-{index}"),
            move |stamp, bytes, _| {
                let _ = tx.send(MidiEvent {
                    port_name: callback_name.clone(),
                    stamp,
                    bytes: bytes.to_vec(),
                });
            },
            (),
        )
        .map_err(|error| format!("failed to connect input '{actual_name}': {error}"))
}

fn print_usage() {
    println!(
        "Usage:
  cargo run --manifest-path backend/Cargo.toml --bin nano_usb_probe -- --list
  cargo run --manifest-path backend/Cargo.toml --bin nano_usb_probe -- [duration_seconds]

Examples:
  cargo run --manifest-path backend/Cargo.toml --bin nano_usb_probe -- --list
  cargo run --manifest-path backend/Cargo.toml --bin nano_usb_probe -- 60"
    );
}

fn parse_args() -> Result<(bool, u64), String> {
    let mut list_only = false;
    let mut duration_secs = 60u64;

    for arg in env::args().skip(1) {
        match arg.as_str() {
            "--help" | "-h" => {
                print_usage();
                std::process::exit(0);
            }
            "--list" | "-l" => list_only = true,
            _ => {
                duration_secs = arg
                    .parse::<u64>()
                    .map_err(|_| format!("unknown argument: {arg}"))?;
            }
        }
    }

    Ok((list_only, duration_secs))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let (list_only, duration_secs) = parse_args()?;
    let duration = Duration::from_secs(duration_secs);
    let mut log = open_log()?;

    log_line(
        &mut log,
        &format!(
            "=== USB PROBE START {} duration={}s log={} ===",
            unix_ms(),
            duration_secs,
            repo_log_path().display()
        ),
    );

    let input_names = scan_input_ports()?;
    if input_names.is_empty() {
        log_line(&mut log, "No CoreMIDI input ports found.");
        log_line(
            &mut log,
            &format!("=== USB PROBE STOP {} events=0 ===", unix_ms()),
        );
        return Ok(());
    }

    log_line(&mut log, "CoreMIDI input ports:");
    for (index, name) in input_names.iter().enumerate() {
        log_line(&mut log, &format!("  [{index}] {name}"));
    }

    if list_only {
        log_line(
            &mut log,
            &format!("=== USB PROBE STOP {} list-only events=0 ===", unix_ms()),
        );
        return Ok(());
    }

    let (tx, rx) = mpsc::channel::<MidiEvent>();
    let mut connections = Vec::new();
    for (index, name) in input_names.iter().enumerate() {
        match connect_port(index, name, tx.clone()) {
            Ok(connection) => {
                log_line(&mut log, &format!("Listening on [{index}] {name}"));
                connections.push(connection);
            }
            Err(error) => {
                log_line(
                    &mut log,
                    &format!("Could not listen on [{index}] {name}: {error}"),
                );
            }
        }
    }
    drop(tx);

    if connections.is_empty() {
        log_line(&mut log, "No MIDI input ports could be opened.");
        log_line(
            &mut log,
            &format!("=== USB PROBE STOP {} events=0 ===", unix_ms()),
        );
        return Ok(());
    }

    log_line(
        &mut log,
        "Touch Nano hardware now: twist knobs, press/hold footswitches, bank, FX, save, exit, capture.",
    );

    let started = Instant::now();
    let mut event_count = 0usize;
    while started.elapsed() < duration {
        match rx.recv_timeout(Duration::from_millis(250)) {
            Ok(event) => {
                event_count += 1;
                log_line(
                    &mut log,
                    &format!(
                        "{} port=\"{}\" stamp={} kind={} len={} bytes={}",
                        unix_ms(),
                        event.port_name,
                        event.stamp,
                        describe(&event.bytes),
                        event.bytes.len(),
                        hex(&event.bytes)
                    ),
                );
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    drop(connections);
    log_line(
        &mut log,
        &format!(
            "=== USB PROBE STOP {} events={} ===",
            unix_ms(),
            event_count
        ),
    );
    if event_count == 0 {
        log_line(
            &mut log,
            "RESULT no inbound CoreMIDI bytes were observed from any open input port.",
        );
    }

    Ok(())
}
