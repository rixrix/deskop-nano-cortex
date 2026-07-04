//! Diagnostic binary: send a configurable PC preset sequence to the Nano Cortex USB output.
//!
//! @see docs/specs/100-backend-midi-usb/spec.md [FR-13]
//! @see docs/specs/100-backend-midi-usb/design.md [DES-USB-TEST]

use midir::MidiOutput;
use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[derive(Debug)]
struct Args {
    sequence: Vec<u8>,
    channel: u8,
    delay_ms: u64,
}

fn print_usage() {
    println!(
        "Usage:
  cargo run --manifest-path backend/Cargo.toml --bin nano_usb_preset_probe -- [--sequence 0,1,0,1] [--channel 1] [--delay-ms 900]

Examples:
  cargo run --manifest-path backend/Cargo.toml --bin nano_usb_preset_probe -- --sequence 0,1,0,1,0,1
  cargo run --manifest-path backend/Cargo.toml --bin nano_usb_preset_probe -- --sequence 0,2,0,2"
    );
}

fn parse_sequence(value: &str) -> Result<Vec<u8>, String> {
    let sequence = value
        .split(',')
        .map(|part| {
            part.trim()
                .parse::<u8>()
                .map(|preset| preset.min(63))
                .map_err(|_| format!("invalid preset in sequence: {part}"))
        })
        .collect::<Result<Vec<_>, _>>()?;

    if sequence.is_empty() {
        Err("sequence cannot be empty".into())
    } else {
        Ok(sequence)
    }
}

fn parse_args() -> Result<Args, String> {
    let mut sequence = vec![0, 1, 0, 1, 0, 1];
    let mut channel = 1u8;
    let mut delay_ms = 900u64;

    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--help" | "-h" => {
                print_usage();
                std::process::exit(0);
            }
            "--sequence" => {
                let value = args
                    .next()
                    .ok_or("--sequence requires a comma-separated value")?;
                sequence = parse_sequence(&value)?;
            }
            "--channel" => {
                let value = args.next().ok_or("--channel requires a value")?;
                channel = value
                    .parse::<u8>()
                    .map_err(|_| format!("invalid channel: {value}"))?
                    .clamp(1, 16);
            }
            "--delay-ms" => {
                let value = args.next().ok_or("--delay-ms requires a value")?;
                delay_ms = value
                    .parse::<u64>()
                    .map_err(|_| format!("invalid delay ms: {value}"))?;
            }
            value if value.starts_with("--") => return Err(format!("unknown argument: {value}")),
            value => sequence = parse_sequence(value)?,
        }
    }

    Ok(Args {
        sequence,
        channel,
        delay_ms,
    })
}

fn repo_log_path() -> PathBuf {
    let backend_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    backend_dir
        .parent()
        .unwrap_or(&backend_dir)
        .join("logs")
        .join("usb-preset-probe.log")
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn log_line(log: &mut std::fs::File, line: &str) {
    println!("{line}");
    let _ = writeln!(log, "{line}");
    let _ = log.flush();
}

fn preset_label(preset: u8) -> String {
    let bank = (b'A' + (preset / 8).min(7)) as char;
    let slot = (preset % 8) + 1;
    format!("{bank}{slot}")
}

fn program_change_bytes(preset: u8, channel: u8) -> [u8; 2] {
    [0xc0 | ((channel.clamp(1, 16) - 1) & 0x0f), preset.min(63)]
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = parse_args()?;
    let path = repo_log_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut log = OpenOptions::new().create(true).append(true).open(&path)?;

    log_line(
        &mut log,
        &format!(
            "=== USB PRESET PROBE START {} sequence={} channel={} delay={}ms log={} ===",
            unix_ms(),
            args.sequence
                .iter()
                .map(|preset| format!("{}({preset})", preset_label(*preset)))
                .collect::<Vec<_>>()
                .join(","),
            args.channel,
            args.delay_ms,
            path.display()
        ),
    );

    let midi_out = MidiOutput::new("Nano USB Preset Probe")?;
    let ports = midi_out.ports();
    let port = ports
        .iter()
        .find(|port| {
            midi_out.port_name(port).is_ok_and(|name| {
                let lower = name.to_lowercase();
                lower.contains("nano") || lower.contains("cortex")
            })
        })
        .ok_or("No Nano Cortex MIDI output port found")?;
    let port_name = midi_out.port_name(port)?;
    log_line(&mut log, &format!("Using USB MIDI output: {port_name}"));

    let mut connection = midi_out.connect(port, "nano-usb-preset-probe")?;
    for preset in args.sequence {
        let bytes = program_change_bytes(preset, args.channel);
        log_line(
            &mut log,
            &format!(
                "{} SEND {} preset={} bytes={:02X} {:02X}",
                unix_ms(),
                preset_label(preset),
                preset,
                bytes[0],
                bytes[1]
            ),
        );
        connection.send(&bytes)?;
        std::thread::sleep(Duration::from_millis(args.delay_ms));
    }

    log_line(
        &mut log,
        &format!("=== USB PRESET PROBE STOP {} ===", unix_ms()),
    );
    Ok(())
}
