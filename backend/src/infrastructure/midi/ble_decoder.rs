//! Conservative provisional decoder for captured Nano Cortex BLE notification payloads.
//!
//! @see docs/specs/110-backend-midi-ble/spec.md [FR-9]
//! @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-DECODER]

use crate::domain::{NanoState, SyncMode};

/// Result of attempting to decode a captured/provisional Nano Cortex BLE payload.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodeResult {
    pub recognized: bool,
    pub provisional: bool,
    pub notes: Vec<String>,
    pub state_patch: Option<NanoStatePatch>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NanoStatePatch {
    pub active_preset_slot: Option<u8>,
    pub expression_value: Option<u8>,
}

/// State decoder boundary. Raw BLE packets must pass through here before they can
/// affect normalized app/device state.
///
/// Parsers added here should be backed by repeatable packet traces and kept
/// provisional until verified.
pub struct NanoStateDecoder;

impl NanoStateDecoder {
    pub fn decode_payload(payload: &[u8]) -> DecodeResult {
        // Conservative parser: only recognize obvious MIDI Program Change bytes if
        // they appear directly. BLE-MIDI timestamp framing or unmapped payloads are
        // intentionally not guessed here.
        if payload.len() == 2 && (payload[0] & 0xF0) == 0xC0 && payload[1] < 64 {
            return DecodeResult {
                recognized: true,
                provisional: true,
                notes: vec!["Observed direct MIDI Program Change shape; treat as provisional until confirmed in BLE traces.".into()],
                state_patch: Some(NanoStatePatch { active_preset_slot: Some(payload[1]), expression_value: None }),
            };
        }

        DecodeResult {
            recognized: false,
            provisional: true,
            notes: vec![
                "Unmapped Nano Cortex BLE payload; retained in debug log for trace comparison."
                    .into(),
            ],
            state_patch: None,
        }
    }

    pub fn apply_patch(state: &mut NanoState, patch: NanoStatePatch) {
        if let Some(preset) = patch.active_preset_slot {
            state.active_preset_slot = Some(preset);
            state.bank = Some(bank_for_preset(preset));
            state.sync_mode = SyncMode::WriteNotificationSync;
            state.provisional = true;
            state.stale = false;
        }
        if let Some(value) = patch.expression_value {
            state.expression_value = Some(value);
            state.expression_percent = Some(((value as u16 * 100) / 127) as u8);
            state.provisional = true;
            state.stale = false;
        }
    }
}

fn bank_for_preset(preset: u8) -> String {
    let bank = (b'A' + (preset / 8).min(7)) as char;
    bank.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{NanoState, SyncMode};

    #[test]
    fn recognizes_direct_program_change_shape() {
        for preset in [0, 31, 63] {
            let result = NanoStateDecoder::decode_payload(&[0xC0, preset]);
            assert!(result.recognized, "preset {preset} should decode");
            assert!(
                result.provisional,
                "decoded BLE state must stay provisional"
            );
            let patch = result.state_patch.expect("PC shape yields a patch");
            assert_eq!(patch.active_preset_slot, Some(preset));
            assert_eq!(patch.expression_value, None);
        }
    }

    #[test]
    fn rejects_out_of_range_and_unknown_payloads() {
        // preset >= 64 is outside the documented PC 0-63 range.
        assert!(!NanoStateDecoder::decode_payload(&[0xC0, 64]).recognized);
        assert!(!NanoStateDecoder::decode_payload(&[]).recognized);
        assert!(!NanoStateDecoder::decode_payload(&[0xC0]).recognized);
        assert!(!NanoStateDecoder::decode_payload(&[0x80, 0x80, 0xC0, 0x00]).recognized);
        // Not a 2-byte PC frame — unmapped payload, kept for trace comparison only.
        assert!(!NanoStateDecoder::decode_payload(&[0x90, 0x40, 0x7F]).recognized);
        assert!(NanoStateDecoder::decode_payload(&[0x90, 0x40, 0x7F]).provisional);
    }

    #[test]
    fn apply_patch_updates_preset_bank_and_sync_mode() {
        let mut state = NanoState::default();
        NanoStateDecoder::apply_patch(
            &mut state,
            NanoStatePatch {
                active_preset_slot: Some(9),
                expression_value: None,
            },
        );
        assert_eq!(state.active_preset_slot, Some(9));
        assert_eq!(state.bank.as_deref(), Some("B")); // preset 9 -> bank B
        assert_eq!(state.sync_mode, SyncMode::WriteNotificationSync);
        assert!(state.provisional);
        assert!(!state.stale);
    }

    #[test]
    fn apply_patch_computes_expression_percent() {
        let mut state = NanoState::default();
        NanoStateDecoder::apply_patch(
            &mut state,
            NanoStatePatch {
                active_preset_slot: None,
                expression_value: Some(127),
            },
        );
        assert_eq!(state.expression_value, Some(127));
        assert_eq!(state.expression_percent, Some(100));
    }

    #[test]
    fn bank_for_preset_maps_groups_of_eight_and_clamps() {
        assert_eq!(bank_for_preset(0), "A");
        assert_eq!(bank_for_preset(7), "A");
        assert_eq!(bank_for_preset(8), "B");
        assert_eq!(bank_for_preset(63), "H");
        assert_eq!(bank_for_preset(255), "H"); // clamped to bank H
    }
}
