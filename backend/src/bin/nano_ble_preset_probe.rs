//! Diagnostic binary: BLE preset write probing with configurable send modes.
//!
//! @see docs/specs/110-backend-midi-ble/spec.md [FR-13]
//! @see docs/specs/110-backend-midi-ble/design.md [DES-TEST]

#[cfg(not(feature = "ble"))]
fn main() {
    eprintln!("nano_ble_preset_probe requires the `ble` feature.");
    std::process::exit(1);
}

#[cfg(feature = "ble")]
use btleplug::api::{CharPropFlags, Peripheral, WriteType};
#[cfg(feature = "ble")]
use desktop_nano_cortex_lib::infrastructure::midi::ble;
#[cfg(feature = "ble")]
use desktop_nano_cortex_lib::infrastructure::midi::ble_debug::hex;
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
#[derive(Debug, Clone, Copy)]
enum ProbeMode {
    Raw,
    Sequential,
    BleMidi,
    All,
}

#[cfg(feature = "ble")]
impl ProbeMode {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "raw" => Ok(Self::Raw),
            "sequential" | "seq" => Ok(Self::Sequential),
            "ble-midi" | "blemidi" | "framed" => Ok(Self::BleMidi),
            "all" => Ok(Self::All),
            _ => Err(format!("unknown mode: {value}")),
        }
    }
}

#[cfg(feature = "ble")]
#[derive(Debug)]
struct Args {
    sequence: Vec<u8>,
    channel: u8,
    mode: ProbeMode,
    all_writable: bool,
    char_filter: Option<String>,
    settle_ms: u64,
}

#[cfg(feature = "ble")]
fn print_usage() {
    println!(
        "Usage:
  cargo run --manifest-path backend/Cargo.toml --features ble --bin nano_ble_preset_probe -- [preset_0_63] [--sequence 0,1,0,1] [--mode all|raw|sequential|ble-midi] [--char c303] [--all-writable] [--channel 1] [--settle-ms 1800]

Examples:
  cargo run --manifest-path backend/Cargo.toml --features ble --bin nano_ble_preset_probe -- 0
  cargo run --manifest-path backend/Cargo.toml --features ble --bin nano_ble_preset_probe -- 7 --mode sequential
  cargo run --manifest-path backend/Cargo.toml --features ble --bin nano_ble_preset_probe -- --sequence 0,1,0,1 --mode sequential --char c303"
    );
}

#[cfg(feature = "ble")]
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

#[cfg(feature = "ble")]
fn parse_args() -> Result<Args, String> {
    let mut preset = None;
    let mut sequence = None;
    let mut channel = 1u8;
    let mut mode = ProbeMode::All;
    let mut all_writable = false;
    let mut char_filter = None;
    let mut settle_ms = 1800u64;

    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--help" | "-h" => {
                print_usage();
                std::process::exit(0);
            }
            "--mode" => {
                let value = args.next().ok_or("--mode requires a value")?;
                mode = ProbeMode::parse(&value)?;
            }
            "--sequence" => {
                let value = args
                    .next()
                    .ok_or("--sequence requires a comma-separated value")?;
                sequence = Some(parse_sequence(&value)?);
            }
            "--char" => {
                let value = args.next().ok_or("--char requires a UUID fragment")?;
                char_filter = Some(value.to_lowercase());
            }
            "--all-writable" => all_writable = true,
            "--channel" => {
                let value = args.next().ok_or("--channel requires a value")?;
                channel = value
                    .parse::<u8>()
                    .map_err(|_| format!("invalid channel: {value}"))?
                    .clamp(1, 16);
            }
            "--settle-ms" => {
                let value = args.next().ok_or("--settle-ms requires a value")?;
                settle_ms = value
                    .parse::<u64>()
                    .map_err(|_| format!("invalid settle ms: {value}"))?;
            }
            value if value.starts_with("--") => return Err(format!("unknown argument: {value}")),
            value => {
                let parsed = value
                    .parse::<u8>()
                    .map_err(|_| format!("invalid preset: {value}"))?;
                preset = Some(parsed.min(63));
            }
        }
    }

    Ok(Args {
        sequence: sequence.unwrap_or_else(|| vec![preset.unwrap_or(0)]),
        channel,
        mode,
        all_writable,
        char_filter,
        settle_ms,
    })
}

#[cfg(feature = "ble")]
fn repo_log_path() -> PathBuf {
    let backend_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    backend_dir
        .parent()
        .unwrap_or(&backend_dir)
        .join("logs")
        .join("ble-preset-probe.log")
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
fn program_change_bytes(preset: u8, channel: u8) -> [u8; 2] {
    [0xc0 | ((channel.clamp(1, 16) - 1) & 0x0f), preset.min(63)]
}

#[cfg(feature = "ble")]
fn ble_midi_program_change_bytes(preset: u8, channel: u8) -> [u8; 4] {
    let [status, program] = program_change_bytes(preset, channel);
    [0x80, 0x80, status, program]
}

#[cfg(feature = "ble")]
async fn write_payload(
    peripheral: &btleplug::platform::Peripheral,
    characteristic: &btleplug::api::Characteristic,
    payload: &[u8],
) -> Result<(), String> {
    time::timeout(
        Duration::from_secs(3),
        peripheral.write(
            characteristic,
            payload,
            write_type(characteristic.properties),
        ),
    )
    .await
    .map_err(|_| format!("BLE write timed out on {}", characteristic.uuid))?
    .map_err(|error| format!("BLE write failed: {error}"))
}

#[cfg(feature = "ble")]
async fn run_send(
    log: &mut std::fs::File,
    peripheral: &btleplug::platform::Peripheral,
    characteristic: &btleplug::api::Characteristic,
    label: &str,
    preset: u8,
    payloads: &[Vec<u8>],
    settle_ms: u64,
) -> Result<(), String> {
    log_line(
        log,
        &format!(
            "{} SEND preset={} {label} char={} props={:?} payloads={}",
            unix_ms(),
            preset,
            characteristic.uuid,
            characteristic.properties,
            payloads
                .iter()
                .map(|payload| format!("[{}]", hex(payload)))
                .collect::<Vec<_>>()
                .join(" ")
        ),
    );

    for payload in payloads {
        write_payload(peripheral, characteristic, payload).await?;
        tokio::time::sleep(Duration::from_millis(120)).await;
    }

    log_line(
        log,
        &format!("{} WAIT {settle_ms}ms after {label}", unix_ms()),
    );
    tokio::time::sleep(Duration::from_millis(settle_ms)).await;
    Ok(())
}

#[cfg(feature = "ble")]
fn is_writable(props: CharPropFlags) -> bool {
    props.contains(CharPropFlags::WRITE) || props.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE)
}

#[cfg(feature = "ble")]
fn preferred_writable(
    handle: &ble::BleHandle,
    writables: &[btleplug::api::Characteristic],
) -> Vec<btleplug::api::Characteristic> {
    let mut selected = Vec::new();
    for suffix in ["c303", "c302", "c304"] {
        for characteristic in writables {
            let lower = characteristic.uuid.to_string().to_lowercase();
            if lower.contains(suffix)
                && !selected
                    .iter()
                    .any(|existing: &btleplug::api::Characteristic| {
                        existing.uuid == characteristic.uuid
                    })
            {
                selected.push(characteristic.clone());
            }
        }
    }

    if !selected
        .iter()
        .any(|existing| existing.uuid == handle.characteristic.uuid)
    {
        selected.push(handle.characteristic.clone());
    }

    selected
}

async fn try_run_send(
    log: &mut std::fs::File,
    peripheral: &btleplug::platform::Peripheral,
    characteristic: &btleplug::api::Characteristic,
    label: &str,
    preset: u8,
    payloads: &[Vec<u8>],
    settle_ms: u64,
) {
    if let Err(error) = run_send(
        log,
        peripheral,
        characteristic,
        label,
        preset,
        payloads,
        settle_ms,
    )
    .await
    {
        log_line(
            log,
            &format!(
                "{} ERROR {label} char={}: {error}",
                unix_ms(),
                characteristic.uuid
            ),
        );
    }
}

#[cfg(feature = "ble")]
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = parse_args()?;
    let mut log = open_log()?;

    log_line(
        &mut log,
        &format!(
            "=== BLE PRESET PROBE START {} preset={} channel={} mode={:?} all_writable={} log={} ===",
            unix_ms(),
            args.sequence
                .iter()
                .map(|preset| preset.to_string())
                .collect::<Vec<_>>()
                .join(","),
            args.channel,
            args.mode,
            args.all_writable,
            repo_log_path().display()
        ),
    );

    let handle = match ble::find_and_connect().await {
        Ok(handle) => handle,
        Err(error) => {
            log_line(&mut log, &format!("CONNECT failed: {error}"));
            log_line(
                &mut log,
                &format!("=== BLE PRESET PROBE STOP {} failed ===", unix_ms()),
            );
            return Err(error.into());
        }
    };

    let peripheral = handle.peripheral.lock().await;
    let mut writables: Vec<_> = peripheral
        .characteristics()
        .into_iter()
        .filter(|characteristic| is_writable(characteristic.properties))
        .collect();
    writables.sort_by_key(|characteristic| characteristic.uuid.to_string());

    log_line(&mut log, "Writable characteristics:");
    for characteristic in &writables {
        log_line(
            &mut log,
            &format!(
                "  {} props={:?}",
                characteristic.uuid, characteristic.properties
            ),
        );
    }

    let mut targets = if args.all_writable {
        writables.clone()
    } else {
        preferred_writable(&handle, &writables)
    };
    if let Some(filter) = &args.char_filter {
        targets.retain(|characteristic| {
            characteristic
                .uuid
                .to_string()
                .to_lowercase()
                .contains(filter)
        });
    }

    log_line(&mut log, "Target characteristics:");
    for characteristic in &targets {
        log_line(
            &mut log,
            &format!(
                "  {} props={:?}",
                characteristic.uuid, characteristic.properties
            ),
        );
    }

    for characteristic in &targets {
        for preset in &args.sequence {
            let raw = program_change_bytes(*preset, args.channel).to_vec();
            let sequential = raw.iter().map(|byte| vec![*byte]).collect::<Vec<_>>();
            let ble_midi = ble_midi_program_change_bytes(*preset, args.channel).to_vec();

            match args.mode {
                ProbeMode::Raw => {
                    try_run_send(
                        &mut log,
                        &peripheral,
                        characteristic,
                        "raw",
                        *preset,
                        std::slice::from_ref(&raw),
                        args.settle_ms,
                    )
                    .await;
                }
                ProbeMode::Sequential => {
                    try_run_send(
                        &mut log,
                        &peripheral,
                        characteristic,
                        "sequential",
                        *preset,
                        &sequential,
                        args.settle_ms,
                    )
                    .await;
                }
                ProbeMode::BleMidi => {
                    try_run_send(
                        &mut log,
                        &peripheral,
                        characteristic,
                        "ble-midi",
                        *preset,
                        std::slice::from_ref(&ble_midi),
                        args.settle_ms,
                    )
                    .await;
                }
                ProbeMode::All => {
                    try_run_send(
                        &mut log,
                        &peripheral,
                        characteristic,
                        "raw",
                        *preset,
                        std::slice::from_ref(&raw),
                        args.settle_ms,
                    )
                    .await;
                    try_run_send(
                        &mut log,
                        &peripheral,
                        characteristic,
                        "sequential",
                        *preset,
                        &sequential,
                        args.settle_ms,
                    )
                    .await;
                    try_run_send(
                        &mut log,
                        &peripheral,
                        characteristic,
                        "ble-midi",
                        *preset,
                        std::slice::from_ref(&ble_midi),
                        args.settle_ms,
                    )
                    .await;
                }
            }
        }
    }

    let notifications = handle.packet_logger.snapshot();
    let notification_lines = notifications
        .iter()
        .filter(|entry| {
            matches!(
                entry.direction,
                desktop_nano_cortex_lib::infrastructure::midi::ble_debug::BlePacketDirection::Notification
                    | desktop_nano_cortex_lib::infrastructure::midi::ble_debug::BlePacketDirection::Indication
            )
        })
        .collect::<Vec<_>>();
    log_line(
        &mut log,
        &format!(
            "Captured {} BLE notification/indication packet(s)",
            notification_lines.len()
        ),
    );
    for entry in notification_lines.iter().rev().take(20).rev() {
        log_line(
            &mut log,
            &format!(
                "  notify char={} payload={}",
                entry.characteristic_uuid.as_deref().unwrap_or("-"),
                entry.payload_hex.as_deref().unwrap_or("-")
            ),
        );
    }

    drop(peripheral);
    match handle.disconnect().await {
        Ok(()) => log_line(&mut log, "Disconnected BLE peripheral"),
        Err(error) => log_line(&mut log, &format!("BLE disconnect warning: {error}")),
    }

    log_line(
        &mut log,
        &format!("=== BLE PRESET PROBE STOP {} ok ===", unix_ms()),
    );
    Ok(())
}
