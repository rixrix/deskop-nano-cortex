//! NanoSyncEngine: owns all NanoState and CapabilityMatrix state transitions.
//!
//! @see docs/specs/110-backend-midi-ble/spec.md [FR-11]
//! @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-DOMAIN]

use crate::domain::{CapabilityMatrix, NanoState, SyncMode};
use crate::infrastructure::midi::ble_decoder::{NanoStateDecoder, NanoStatePatch};

/// Event-driven sync engine that owns normalized Nano Cortex state updates.
/// Raw BLE packets should not be bound directly to UI components.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NanoSyncSnapshot {
    pub state: NanoState,
    pub capabilities: CapabilityMatrix,
}

#[derive(Default)]
pub struct NanoSyncEngine {
    pub state: NanoState,
    pub capabilities: CapabilityMatrix,
}

impl NanoSyncEngine {
    pub fn mark_connected_command_only(&mut self) {
        self.state.connection_status = "connected".into();
        self.state.sync_mode = SyncMode::CommandOnly;
        self.state.stale = false;
    }

    pub fn mark_disconnected(&mut self) {
        self.state.connection_status = "disconnected".into();
        self.state.sync_mode = SyncMode::DisconnectedPreview;
        self.state.stale = true;
    }

    pub fn optimistic_preset_change(&mut self, preset: u8) {
        NanoStateDecoder::apply_patch(
            &mut self.state,
            NanoStatePatch {
                active_preset_slot: Some(preset.min(63)),
                expression_value: None,
            },
        );
        self.state.sync_mode = SyncMode::CommandOnly;
    }

    pub fn ingest_notification(&mut self, payload: &[u8]) {
        let decoded = NanoStateDecoder::decode_payload(payload);
        if let Some(patch) = decoded.state_patch {
            NanoStateDecoder::apply_patch(&mut self.state, patch);
        }
    }

    pub fn snapshot(&self) -> NanoSyncSnapshot {
        NanoSyncSnapshot {
            state: self.state.clone(),
            capabilities: self.capabilities.clone(),
        }
    }
}
