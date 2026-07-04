//! AppState: shared mutable device, BLE peripheral, NanoState, and settings container.
//!
//! @see docs/specs/120-backend-ipc/spec.md [FR-22]
//! @see docs/specs/120-backend-ipc/design.md [DES-IPC-STATE]

use std::sync::Arc;
use tokio::sync::Mutex;

use crate::domain::{
    CapabilityMatrix, Device, DeviceState, NanoCortexFootswitchState, NanoState, Settings,
};
use midir::MidiInputConnection;

#[cfg(feature = "ble")]
use crate::infrastructure::midi::ble::BleHandle;

/// Shared application state shared across all Tauri commands.
pub struct AppState {
    /// Currently connected device (None = disconnected).
    pub device: Mutex<Option<Device>>,
    /// Persisted settings.
    pub settings: Mutex<Settings>,
    /// Whether a BLE scan is in progress.
    pub ble_scanning: Mutex<bool>,
    /// Live USB MIDI input listener connection for device -> app updates.
    pub midi_input_connections: Mutex<Vec<MidiInputConnection<()>>>,
    /// Nano Cortex hardware footswitch quick-access model.
    pub footswitches: Mutex<NanoCortexFootswitchState>,
    /// Normalized decoded/provisional device state from BLE sync.
    pub nano_state: Mutex<NanoState>,
    /// Reverse-engineering capability matrix for decoded BLE fields.
    pub capability_matrix: Mutex<CapabilityMatrix>,
    /// Live BLE peripheral handle for sending MIDI over BLE.
    #[cfg(feature = "ble")]
    pub ble_peripheral: Mutex<Option<BleHandle>>,
}

impl AppState {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            device: Mutex::new(None),
            settings: Mutex::new(Settings::default()),
            ble_scanning: Mutex::new(false),
            midi_input_connections: Mutex::new(Vec::new()),
            footswitches: Mutex::new(NanoCortexFootswitchState::default()),
            nano_state: Mutex::new(NanoState::default()),
            capability_matrix: Mutex::new(CapabilityMatrix::default()),
            #[cfg(feature = "ble")]
            ble_peripheral: Mutex::new(None),
        })
    }

    /// Update the device connection state.
    pub async fn set_connected(&self, name: String, kind: crate::domain::PortKind) {
        let mut device = self.device.lock().await;
        *device = Some(Device::new(name, kind));
        if let Some(ref mut d) = *device {
            d.state = DeviceState::Connected;
        }
    }

    /// Mark the device as disconnected.
    pub async fn set_disconnected(&self) {
        let mut device = self.device.lock().await;
        if let Some(ref mut d) = *device {
            d.state = DeviceState::Disconnected;
        }
        self.midi_input_connections.lock().await.clear();
        #[cfg(feature = "ble")]
        {
            let _ = self.ble_peripheral.lock().await.take();
        }
    }

    /// Returns true if a device is currently connected.
    pub async fn is_connected(&self) -> bool {
        self.device
            .lock()
            .await
            .as_ref()
            .map(|d| d.state == DeviceState::Connected)
            .unwrap_or(false)
    }

    /// Get the current device name, if connected.
    pub async fn device_name(&self) -> Option<String> {
        self.device.lock().await.as_ref().map(|d| d.name.clone())
    }
}
