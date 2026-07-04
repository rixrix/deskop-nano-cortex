//! Diagnostic binary: write an arbitrary command frame to the `c304` write characteristic and
//! log every `c305`/`c306` reply captured afterwards. Used to verify the captured
//! command/field protocol against real hardware before wiring it into the app.
//!
//! @see docs/specs/110-backend-midi-ble/spec.md [FR-13]
//! @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]

#[cfg(not(feature = "ble"))]
fn main() {
    eprintln!("nano_ble_command_probe requires the `ble` feature.");
    std::process::exit(1);
}

#[cfg(feature = "ble")]
use btleplug::api::{CharPropFlags, Peripheral, WriteType};
#[cfg(feature = "ble")]
use desktop_nano_cortex_lib::infrastructure::midi::ble;
#[cfg(feature = "ble")]
use desktop_nano_cortex_lib::infrastructure::midi::ble_debug::{hex, BlePacketDirection};
#[cfg(feature = "ble")]
use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
#[cfg(feature = "ble")]
use tokio::time;

#[cfg(feature = "ble")]
struct Args {
    frame: Vec<u8>,
    char_filter: String,
    observe_ms: u64,
    label: String,
}

#[cfg(feature = "ble")]
fn print_usage() {
    println!(
        "Usage:
  cargo run --manifest-path backend/Cargo.toml --features ble --bin nano_ble_command_probe -- --frame \"0C C0 08 03 18 01 20 01 28 01 01 00 00 00\" [--char c304] [--observe-ms 3000] [--label current-state-dump]

Notes:
  * --frame is the raw command bytes written to the write characteristic (hex, space/comma separated).
  * The app must be DISCONNECTED first — BLE allows only one central at a time.
  * Start with the READ-ONLY current-state dump above; it changes nothing on the device.

Examples:
  # read-only: request current preset state
  ... --frame \"0C C0 08 03 18 01 20 01 28 01 01 00 00 00\" --label current-state-dump
  # read-only: request metadata (preset/capture/IR name lists)
  ... --frame \"06 C0 08 03 01 00 00 00\" --label metadata-dump"
    );
}

#[cfg(feature = "ble")]
fn parse_hex_frame(value: &str) -> Result<Vec<u8>, String> {
    value
        .split([' ', ',', '\t'])
        .filter(|token| !token.is_empty())
        .map(|token| {
            let token = token.trim_start_matches("0x").trim_start_matches("0X");
            u8::from_str_radix(token, 16).map_err(|_| format!("invalid hex byte: {token}"))
        })
        .collect()
}

#[cfg(feature = "ble")]
fn parse_args() -> Result<Args, String> {
    let mut frame: Option<Vec<u8>> = None;
    let mut char_filter = String::from("c304");
    let mut observe_ms = 3000_u64;
    let mut label = String::from("command");

    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--help" | "-h" => {
                print_usage();
                std::process::exit(0);
            }
            "--frame" => {
                let value = args.next().ok_or("--frame requires a hex string")?;
                frame = Some(parse_hex_frame(&value)?);
            }
            "--char" => {
                char_filter = args
                    .next()
                    .ok_or("--char requires a UUID fragment")?
                    .to_lowercase();
            }
            "--observe-ms" => {
                let value = args.next().ok_or("--observe-ms requires a value")?;
                observe_ms = value
                    .parse::<u64>()
                    .map_err(|_| format!("invalid --observe-ms: {value}"))?;
            }
            "--label" => {
                label = args.next().ok_or("--label requires a value")?;
            }
            other => return Err(format!("unknown argument: {other}")),
        }
    }

    let frame = frame.ok_or("--frame is required (see --help)")?;
    if frame.is_empty() {
        return Err("--frame produced no bytes".into());
    }
    Ok(Args {
        frame,
        char_filter,
        observe_ms,
        label,
    })
}

#[cfg(feature = "ble")]
fn repo_log_path() -> PathBuf {
    let backend_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    backend_dir
        .parent()
        .unwrap_or(&backend_dir)
        .join("logs")
        .join("ble-command-probe.log")
}

#[cfg(feature = "ble")]
fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(feature = "ble")]
fn open_log() -> Result<std::fs::File, Box<dyn std::error::Error>> {
    let path = repo_log_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(OpenOptions::new().create(true).append(true).open(path)?)
}

#[cfg(feature = "ble")]
fn log_line(log: &mut std::fs::File, line: &str) {
    println!("{line}");
    let _ = writeln!(log, "{line}");
    let _ = log.flush();
}

#[cfg(feature = "ble")]
fn write_type(props: CharPropFlags) -> WriteType {
    if props.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE) {
        WriteType::WithoutResponse
    } else {
        WriteType::WithResponse
    }
}

#[cfg(feature = "ble")]
fn is_writable(props: CharPropFlags) -> bool {
    props.contains(CharPropFlags::WRITE) || props.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE)
}

#[cfg(feature = "ble")]
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = parse_args()?;
    let mut log = open_log()?;

    log_line(
        &mut log,
        &format!(
            "=== BLE COMMAND PROBE START {} label={} char~={} observe={}ms frame=[{}] log={} ===",
            unix_ms(),
            args.label,
            args.char_filter,
            args.observe_ms,
            hex(&args.frame),
            repo_log_path().display()
        ),
    );

    let handle = match ble::find_and_connect().await {
        Ok(handle) => handle,
        Err(error) => {
            log_line(&mut log, &format!("CONNECT failed: {error}"));
            log_line(
                &mut log,
                &format!("=== BLE COMMAND PROBE STOP {} failed ===", unix_ms()),
            );
            return Err(error.into());
        }
    };

    let peripheral = handle.peripheral.lock().await;

    // Pick the write characteristic: writable AND uuid contains --char (default c304).
    let target = peripheral
        .characteristics()
        .into_iter()
        .filter(|c| is_writable(c.properties))
        .find(|c| {
            c.uuid
                .to_string()
                .to_lowercase()
                .contains(&args.char_filter)
        });

    let target = match target {
        Some(c) => c,
        None => {
            log_line(
                &mut log,
                &format!(
                    "No writable characteristic matching '{}' found. Writable characteristics:",
                    args.char_filter
                ),
            );
            for c in peripheral
                .characteristics()
                .into_iter()
                .filter(|c| is_writable(c.properties))
            {
                log_line(&mut log, &format!("  {} props={:?}", c.uuid, c.properties));
            }
            drop(peripheral);
            let _ = handle.disconnect().await;
            log_line(
                &mut log,
                &format!("=== BLE COMMAND PROBE STOP {} no-target ===", unix_ms()),
            );
            return Err("target write characteristic not found".into());
        }
    };

    log_line(
        &mut log,
        &format!("Writing to {} props={:?}", target.uuid, target.properties),
    );

    let write_at = unix_ms();
    match time::timeout(
        Duration::from_secs(3),
        peripheral.write(&target, &args.frame, write_type(target.properties)),
    )
    .await
    {
        Ok(Ok(())) => log_line(&mut log, &format!("WRITE ok [{}]", hex(&args.frame))),
        Ok(Err(error)) => log_line(&mut log, &format!("WRITE failed: {error}")),
        Err(_) => log_line(&mut log, "WRITE timed out (3s)"),
    }

    // Observe replies. find_and_connect already subscribed to notify/indicate chars and captures
    // every notification into the packet logger.
    time::sleep(Duration::from_millis(args.observe_ms)).await;

    let replies: Vec<_> = handle
        .packet_logger
        .snapshot()
        .into_iter()
        .filter(|entry| {
            matches!(
                entry.direction,
                BlePacketDirection::Notification | BlePacketDirection::Indication
            ) && entry.timestamp_ms >= write_at
        })
        .collect();

    log_line(
        &mut log,
        &format!("Captured {} reply packet(s) after write:", replies.len()),
    );
    for entry in &replies {
        log_line(
            &mut log,
            &format!(
                "  +{}ms {:?} char={} payload=[{}]",
                entry.timestamp_ms.saturating_sub(write_at),
                entry.direction,
                entry.characteristic_uuid.as_deref().unwrap_or("-"),
                entry.payload_hex.as_deref().unwrap_or("-"),
            ),
        );
    }
    if replies.is_empty() {
        log_line(
            &mut log,
            "RESULT no replies — device did not answer this frame on c305/c306 (wrong char? wrong bytes? or write silently ignored).",
        );
    }

    drop(peripheral);
    match handle.disconnect().await {
        Ok(()) => log_line(&mut log, "Disconnected BLE peripheral"),
        Err(error) => log_line(&mut log, &format!("BLE disconnect warning: {error}")),
    }

    log_line(
        &mut log,
        &format!("=== BLE COMMAND PROBE STOP {} ok ===", unix_ms()),
    );
    Ok(())
}
