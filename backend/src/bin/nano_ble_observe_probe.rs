//! Diagnostic binary: BLE connect, observe notifications, and log payloads to file.
//!
//! @see docs/specs/110-backend-midi-ble/spec.md [FR-13]
//! @see docs/specs/110-backend-midi-ble/design.md [DES-TEST]

#[cfg(not(feature = "ble"))]
fn main() {
    eprintln!("nano_ble_observe_probe requires the `ble` feature.");
    std::process::exit(1);
}

#[cfg(feature = "ble")]
use desktop_nano_cortex_lib::infrastructure::midi::ble;
#[cfg(feature = "ble")]
use desktop_nano_cortex_lib::infrastructure::midi::ble_debug::BlePacketDirection;
#[cfg(feature = "ble")]
use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[cfg(feature = "ble")]
fn repo_log_path() -> PathBuf {
    let backend_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    backend_dir
        .parent()
        .unwrap_or(&backend_dir)
        .join("logs")
        .join("ble-observe-probe.log")
}

#[cfg(feature = "ble")]
fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(feature = "ble")]
fn log_line(log: &mut std::fs::File, line: &str) {
    println!("{line}");
    let _ = writeln!(log, "{line}");
    let _ = log.flush();
}

#[cfg(feature = "ble")]
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let duration_secs = env::args()
        .nth(1)
        .and_then(|arg| arg.parse::<u64>().ok())
        .unwrap_or(45);

    let path = repo_log_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut log = OpenOptions::new().create(true).append(true).open(&path)?;

    log_line(
        &mut log,
        &format!(
            "=== BLE OBSERVE START {} duration={}s log={} ===",
            unix_ms(),
            duration_secs,
            path.display()
        ),
    );

    let handle = match ble::find_and_connect().await {
        Ok(handle) => handle,
        Err(error) => {
            log_line(&mut log, &format!("CONNECT failed: {error}"));
            log_line(
                &mut log,
                &format!("=== BLE OBSERVE STOP {} failed ===", unix_ms()),
            );
            return Err(error.into());
        }
    };

    log_line(
        &mut log,
        "Connected. Perform actions now: BANK, FX, FS I twist/press, FS II twist/press.",
    );

    for remaining in (1..=duration_secs).rev() {
        if matches!(remaining, 45 | 35 | 25 | 15 | 5) {
            log_line(
                &mut log,
                &format!("{} observing... {remaining}s left", unix_ms()),
            );
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }

    let snapshot = handle.packet_logger.snapshot();
    let notifications = snapshot
        .iter()
        .filter(|entry| {
            matches!(
                entry.direction,
                BlePacketDirection::Notification | BlePacketDirection::Indication
            )
        })
        .collect::<Vec<_>>();

    log_line(
        &mut log,
        &format!(
            "Captured {} BLE notification/indication packet(s)",
            notifications.len()
        ),
    );
    for entry in notifications {
        log_line(
            &mut log,
            &format!(
                "{} notify char={} payload={}",
                entry.timestamp_ms,
                entry.characteristic_uuid.as_deref().unwrap_or("-"),
                entry.payload_hex.as_deref().unwrap_or("-")
            ),
        );
    }

    match handle.disconnect().await {
        Ok(()) => log_line(&mut log, "Disconnected BLE peripheral"),
        Err(error) => log_line(&mut log, &format!("BLE disconnect warning: {error}")),
    }
    log_line(
        &mut log,
        &format!("=== BLE OBSERVE STOP {} ok ===", unix_ms()),
    );
    Ok(())
}
