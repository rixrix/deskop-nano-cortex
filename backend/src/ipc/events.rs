//! Tauri event emitters for MIDI lifecycle, messages, errors, and protocol log.
//!
//! @see docs/specs/120-backend-ipc/spec.md [FR-16]
//! @see docs/specs/120-backend-ipc/design.md [DES-IPC-EVENTS]

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::SystemTime;
use tauri::{Emitter, Runtime};

use crate::domain::MidiMessage;

/// Event names emitted from the Rust backend to the frontend.
pub const EVENT_MIDI_MESSAGE: &str = "midi://message";
pub const EVENT_CONNECTED: &str = "midi://connected";
pub const EVENT_DISCONNECTED: &str = "midi://disconnected";
pub const EVENT_ERROR: &str = "midi://error";
pub const EVENT_PORTS_CHANGED: &str = "midi://ports-changed";
pub const EVENT_LOG: &str = "midi://log";

/// Emit an inbound MIDI message event to the frontend.
pub fn emit_midi_message<R: Runtime>(app: &impl Emitter<R>, msg: &MidiMessage) {
    let _ = app.emit(EVENT_MIDI_MESSAGE, msg);
}

/// Emit a device connection event.
pub fn emit_connected<R: Runtime>(app: &impl Emitter<R>, device_name: &str) {
    let _ = app.emit(EVENT_CONNECTED, serde_json::json!({ "name": device_name }));
}

/// Emit a device disconnection event.
pub fn emit_disconnected<R: Runtime>(app: &impl Emitter<R>) {
    let _ = app.emit(EVENT_DISCONNECTED, serde_json::Value::Null);
}

/// Emit an error event.
pub fn emit_error<R: Runtime>(app: &impl Emitter<R>, message: &str) {
    let _ = app.emit(EVENT_ERROR, serde_json::json!({ "message": message }));
}

/// Emit a port list change event (hotplug).
pub fn emit_ports_changed<R: Runtime>(app: &impl Emitter<R>, ports: &[crate::domain::MidiPort]) {
    let _ = app.emit(EVENT_PORTS_CHANGED, serde_json::json!({ "ports": ports }));
}

/// Emit a log message to the frontend log viewer.
pub fn emit_log<R: Runtime>(app: &impl Emitter<R>, level: &str, message: &str) {
    let ts = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    println!("[midi-log] {level}: {message}");
    append_protocol_log(ts, level, message);
    let _ = app.emit(
        EVENT_LOG,
        serde_json::json!({
            "ts": ts,
            "level": level,
            "message": message,
        }),
    );
}

fn append_protocol_log(ts: u128, level: &str, message: &str) {
    let path = protocol_log_path();
    if let Some(parent) = path.parent() {
        if let Err(err) = fs::create_dir_all(parent) {
            eprintln!("[midi-log] warn: could not create log directory: {err}");
            return;
        }
    }

    match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(mut file) => {
            if let Err(err) = writeln!(file, "{ts} {level} {message}") {
                eprintln!("[midi-log] warn: could not write protocol log: {err}");
            }
        }
        Err(err) => eprintln!("[midi-log] warn: could not open protocol log: {err}"),
    }
}

fn protocol_log_path() -> PathBuf {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if cwd.file_name().and_then(|name| name.to_str()) == Some("backend") {
        cwd.parent()
            .map(|root| root.join("logs").join("protocol-lab.log"))
            .unwrap_or_else(|| cwd.join("logs").join("protocol-lab.log"))
    } else {
        cwd.join("logs").join("protocol-lab.log")
    }
}
