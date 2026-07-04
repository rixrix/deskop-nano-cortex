//! AppError enum and AppResult type alias for IPC command error handling.
//!
//! @see docs/specs/120-backend-ipc/spec.md [FR-24]
//! @see docs/specs/120-backend-ipc/design.md [DES-IPC-ERROR]

use std::fmt;

/// Application-level error type.
#[derive(Debug)]
pub enum AppError {
    Midi(String),
    Ble(String),
    Serialization(String),
    NotFound(String),
    AlreadyConnected,
    NotConnected,
    Io(std::io::Error),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Midi(msg) => write!(f, "MIDI error: {msg}"),
            AppError::Ble(msg) => write!(f, "BLE error: {msg}"),
            AppError::Serialization(msg) => write!(f, "Serialization error: {msg}"),
            AppError::NotFound(msg) => write!(f, "Not found: {msg}"),
            AppError::AlreadyConnected => write!(f, "Already connected"),
            AppError::NotConnected => write!(f, "Not connected"),
            AppError::Io(e) => write!(f, "I/O error: {e}"),
        }
    }
}

impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        e.to_string()
    }
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
