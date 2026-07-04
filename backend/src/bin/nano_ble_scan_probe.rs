//! Diagnostic binary: BLE scan for a Nano Cortex and log discovered peripherals.
//!
//! @see docs/specs/110-backend-midi-ble/spec.md [FR-13]
//! @see docs/specs/110-backend-midi-ble/design.md [DES-TEST]

#[cfg(not(feature = "ble"))]
fn main() {
    eprintln!("nano_ble_scan_probe requires the `ble` feature.");
    std::process::exit(1);
}

#[cfg(feature = "ble")]
use desktop_nano_cortex_lib::infrastructure::midi::ble;
#[cfg(feature = "ble")]
use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

#[cfg(feature = "ble")]
fn repo_log_path() -> PathBuf {
    let backend_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    backend_dir
        .parent()
        .unwrap_or(&backend_dir)
        .join("logs")
        .join("ble-scan-probe.log")
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
    let timeout_secs = env::args()
        .nth(1)
        .and_then(|arg| arg.parse::<u64>().ok())
        .unwrap_or(12);

    let path = repo_log_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut log = OpenOptions::new().create(true).append(true).open(&path)?;

    log_line(
        &mut log,
        &format!(
            "=== BLE SCAN PROBE START {} timeout={}s log={} ===",
            unix_ms(),
            timeout_secs,
            path.display()
        ),
    );

    let adapter = ble::get_adapter().await?;
    let devices = ble::scan_all(&adapter, timeout_secs).await?;
    if devices.is_empty() {
        log_line(&mut log, "No BLE devices discovered.");
    } else {
        for (index, device) in devices.iter().enumerate() {
            log_line(
                &mut log,
                &format!(
                    "[{index}] name=\"{}\" is_nano={} services={}",
                    device.name,
                    device.is_nano,
                    device.uuids.join(", ")
                ),
            );
        }
    }

    log_line(
        &mut log,
        &format!(
            "=== BLE SCAN PROBE STOP {} count={} ===",
            unix_ms(),
            devices.len()
        ),
    );
    Ok(())
}
