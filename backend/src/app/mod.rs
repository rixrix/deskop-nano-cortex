//! App sub-crate: AppState, AppError, and BuildConfig re-exports.
//!
//! @see docs/specs/120-backend-ipc/spec.md [FR-22]
//! @see docs/specs/120-backend-ipc/design.md [DES-IPC-STATE]

pub mod config;
pub mod error;
pub mod state;

pub use config::BuildConfig;
pub use error::AppError;
pub use state::AppState;
