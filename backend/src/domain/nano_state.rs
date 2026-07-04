//! NanoState, CapabilityMatrix, SyncMode, and slot domain types for provisional BLE state.
//!
//! @see docs/specs/110-backend-midi-ble/spec.md [FR-10]
//! @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-CAPABILITY]

use std::collections::BTreeMap;

/// Quality of BLE/device-state synchronization currently available.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SyncMode {
    /// Device state can be read and written with confirmed parsing.
    FullReadWriteSync,
    /// Commands are sent and notifications can reconcile some state.
    WriteNotificationSync,
    /// Commands can be sent, but UI state is optimistic/local.
    CommandOnly,
    /// No device is connected; UI renders preview/cached defaults.
    DisconnectedPreview,
}

/// Whether a particular state field is verified, inferred, unsupported, or still unknown.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CapabilityStatus {
    ConfirmedReadable,
    ConfirmedWritable,
    Inferred,
    Unsupported,
    Unverified,
}

/// Fixed Nano Cortex slot roles. These are role containers first; loaded effect/asset second.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[serde(rename_all = "kebab-case")]
pub enum NanoSlotRole {
    Gate,
    PreFx1,
    PreFx2,
    Capture,
    IrCab,
    PostFx1,
    PostFx2,
    PostFx3,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NanoSlotState {
    pub role: NanoSlotRole,
    pub loaded_name: Option<String>,
    /// Raw current-state FX model id bytes, rendered as uppercase hex without spaces.
    pub model_id: Option<String>,
    pub model_id_numeric: Option<u64>,
    pub bypassed: Option<bool>,
    pub active: Option<bool>,
    /// True when decoded from confirmed traces. False when optimistic/inferred.
    pub confirmed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NanoFootswitchAssignments {
    pub ia: u8,
    pub ib: u8,
    pub iia: u8,
    pub iib: u8,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NanoState {
    pub connection_status: String,
    pub sync_mode: SyncMode,
    pub active_preset_slot: Option<u8>,
    pub preset_name: Option<String>,
    pub bank: Option<String>,
    pub capture_slot: Option<u8>,
    pub capture_volume: Option<u8>,
    pub gate_on: Option<bool>,
    pub gate_reduction: Option<u8>,
    pub cab_ir_on: Option<bool>,
    pub capture_assignment: Option<String>,
    pub ir_assignment: Option<String>,
    pub slots: BTreeMap<NanoSlotRole, NanoSlotState>,
    pub expression_value: Option<u8>,
    pub expression_percent: Option<u8>,
    /// Amp panel knobs (raw 0-255) decoded from a confirmed state dump.
    pub amp_gain: Option<u8>,
    pub amp_level: Option<u8>,
    pub amp_bass: Option<u8>,
    pub amp_mid: Option<u8>,
    pub amp_treble: Option<u8>,
    pub footswitch_assignments: Option<NanoFootswitchAssignments>,
    pub stale: bool,
    pub provisional: bool,
}

impl Default for NanoState {
    fn default() -> Self {
        let mut slots = BTreeMap::new();
        for role in [
            NanoSlotRole::Gate,
            NanoSlotRole::PreFx1,
            NanoSlotRole::PreFx2,
            NanoSlotRole::Capture,
            NanoSlotRole::IrCab,
            NanoSlotRole::PostFx1,
            NanoSlotRole::PostFx2,
            NanoSlotRole::PostFx3,
        ] {
            slots.insert(
                role,
                NanoSlotState {
                    role,
                    loaded_name: None,
                    model_id: None,
                    model_id_numeric: None,
                    bypassed: None,
                    active: None,
                    confirmed: false,
                },
            );
        }

        Self {
            connection_status: "disconnected".into(),
            sync_mode: SyncMode::DisconnectedPreview,
            active_preset_slot: None,
            preset_name: None,
            bank: None,
            capture_slot: None,
            capture_volume: None,
            gate_on: None,
            gate_reduction: None,
            cab_ir_on: None,
            capture_assignment: None,
            ir_assignment: None,
            slots,
            expression_value: None,
            expression_percent: None,
            amp_gain: None,
            amp_level: None,
            amp_bass: None,
            amp_mid: None,
            amp_treble: None,
            footswitch_assignments: None,
            stale: false,
            provisional: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityMatrix {
    pub active_preset_slot: CapabilityStatus,
    pub preset_name: CapabilityStatus,
    pub bank: CapabilityStatus,
    pub capture_assignment: CapabilityStatus,
    pub ir_assignment: CapabilityStatus,
    pub pre_fx_slot_1: CapabilityStatus,
    pub pre_fx_slot_2: CapabilityStatus,
    pub post_fx_slot_1: CapabilityStatus,
    pub post_fx_slot_2: CapabilityStatus,
    pub post_fx_slot_3: CapabilityStatus,
    pub bypass_flags: CapabilityStatus,
    pub expression_values: CapabilityStatus,
    pub amp_knobs: CapabilityStatus,
    pub save: CapabilityStatus,
    pub notes: Vec<String>,
}

impl Default for CapabilityMatrix {
    fn default() -> Self {
        Self {
            active_preset_slot: CapabilityStatus::Inferred,
            preset_name: CapabilityStatus::Unverified,
            bank: CapabilityStatus::Inferred,
            capture_assignment: CapabilityStatus::Unverified,
            ir_assignment: CapabilityStatus::Unverified,
            pre_fx_slot_1: CapabilityStatus::Unverified,
            pre_fx_slot_2: CapabilityStatus::Unverified,
            post_fx_slot_1: CapabilityStatus::Unverified,
            post_fx_slot_2: CapabilityStatus::Unverified,
            post_fx_slot_3: CapabilityStatus::Unverified,
            bypass_flags: CapabilityStatus::Inferred,
            expression_values: CapabilityStatus::Unverified,
            amp_knobs: CapabilityStatus::Unverified,
            save: CapabilityStatus::Unverified,
            notes: vec![
                "Captured BLE fields remain provisional until verified from repeated labelled traces.".into(),
            ],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_state_is_disconnected_preview_with_all_eight_slots() {
        let state = NanoState::default();
        assert_eq!(state.sync_mode, SyncMode::DisconnectedPreview);
        assert!(state.provisional);
        assert!(!state.stale);
        assert_eq!(state.slots.len(), 8);
        assert!(state.slots.contains_key(&NanoSlotRole::Gate));
        assert!(state.slots.contains_key(&NanoSlotRole::PostFx3));
        // No fields are confirmed before any trace arrives.
        assert!(state.slots.values().all(|s| !s.confirmed));
    }

    #[test]
    fn default_capability_matrix_is_honest_about_unknowns() {
        let caps = CapabilityMatrix::default();
        assert_eq!(caps.preset_name, CapabilityStatus::Unverified);
        assert_eq!(caps.active_preset_slot, CapabilityStatus::Inferred);
        assert!(
            !caps.notes.is_empty(),
            "must carry a provisional-protocol disclaimer"
        );
    }

    #[test]
    fn sync_mode_serializes_as_kebab_case() {
        assert_eq!(
            serde_json::to_string(&SyncMode::WriteNotificationSync).unwrap(),
            "\"write-notification-sync\""
        );
        assert_eq!(
            serde_json::to_string(&SyncMode::DisconnectedPreview).unwrap(),
            "\"disconnected-preview\""
        );
    }
}
