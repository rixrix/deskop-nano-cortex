//! MIDI infrastructure module: USB transport sub-modules and BLE sub-modules (feature-gated).
//!
//! @see docs/specs/100-backend-midi-usb/spec.md [FR-1]
//! @see docs/specs/100-backend-midi-usb/design.md [DES-USB-ARCH]

pub mod ble_encoder;
pub mod ble_schema;
pub mod connection;
pub mod listener;
pub mod port_manager;
pub mod port_watchdog;

#[cfg(feature = "ble")]
pub mod ble;
#[cfg(feature = "ble")]
pub mod ble_debug;
#[cfg(feature = "ble")]
pub mod ble_decoder;
#[cfg(feature = "ble")]
pub mod ble_inspector;
#[cfg(feature = "ble")]
pub mod ble_sync;
