//! Footswitch assignment and live-access domain model for the Nano Cortex hardware.
//!
//! @see docs/specs/130-backend-platform/spec.md [FR-9]
//! @see docs/specs/130-backend-platform/design.md [DES-PLAT-FOOTSWITCH]

/// Nano Cortex preset operation mode for the two physical footswitches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PresetOperationMode {
    FourPreset,
    TwoPreset,
}

/// Physical footswitch identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum FootswitchId {
    I,
    II,
}

/// A/B subslot on a footswitch preset pair.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum FootswitchSubslot {
    A,
    B,
}

/// Explicit quick-access preset slots reachable from the hardware footswitches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum QuickPresetSlot {
    IA,
    IB,
    IIA,
    IIB,
}

/// Press behavior is intentionally separate from rotary encoder behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FootswitchPressRole {
    PresetToggle,
    GlobalBypass,
}

/// Long-press behavior is separate from short press and rotary behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FootswitchLongPressAction {
    TapTempo,
    Tuner,
}

/// Rotary encoder behavior is separate from footswitch press behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RotaryEncoderRole {
    CaptureScroll,
    IrScroll,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct FootswitchState {
    pub role: FootswitchPressRole,
    /// Program Change index 0-63 assigned to subslot A.
    pub current_assigned_a: u8,
    /// Program Change index 0-63 assigned to subslot B.
    pub current_assigned_b: u8,
    pub active_subslot: FootswitchSubslot,
    pub long_press_action: FootswitchLongPressAction,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct FootswitchIIState {
    pub role: FootswitchPressRole,
    pub current_assigned_a: u8,
    pub current_assigned_b: u8,
    pub active_subslot: FootswitchSubslot,
    pub long_press_action: FootswitchLongPressAction,
    pub global_bypass_enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct NanoCortexFootswitchState {
    pub preset_operation_mode: PresetOperationMode,
    pub footswitch_i: FootswitchState,
    pub footswitch_ii: FootswitchIIState,
}

impl Default for NanoCortexFootswitchState {
    fn default() -> Self {
        Self {
            preset_operation_mode: PresetOperationMode::FourPreset,
            footswitch_i: FootswitchState {
                role: FootswitchPressRole::PresetToggle,
                current_assigned_a: 0,
                current_assigned_b: 1,
                active_subslot: FootswitchSubslot::A,
                long_press_action: FootswitchLongPressAction::TapTempo,
            },
            footswitch_ii: FootswitchIIState {
                role: FootswitchPressRole::PresetToggle,
                current_assigned_a: 2,
                current_assigned_b: 3,
                active_subslot: FootswitchSubslot::A,
                long_press_action: FootswitchLongPressAction::Tuner,
                global_bypass_enabled: false,
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type")]
pub enum FootswitchEvent {
    #[serde(rename = "footswitch-pressed")]
    FootswitchPressed { footswitch: FootswitchId },
    #[serde(rename = "operation-mode-changed")]
    OperationModeChanged { mode: PresetOperationMode },
    #[serde(rename = "preset-assigned")]
    PresetAssigned { slot: QuickPresetSlot, preset: u8 },
    #[serde(rename = "global-bypass-toggled")]
    GlobalBypassToggled { enabled: bool },
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct RotaryEncoderMapping {
    pub footswitch: FootswitchId,
    pub role: RotaryEncoderRole,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_models_four_preset_mode() {
        let s = NanoCortexFootswitchState::default();
        assert_eq!(s.preset_operation_mode, PresetOperationMode::FourPreset);
        // I -> A0/B1, II -> A2/B3 quick-access pairs.
        assert_eq!(s.footswitch_i.current_assigned_a, 0);
        assert_eq!(s.footswitch_i.current_assigned_b, 1);
        assert_eq!(s.footswitch_ii.current_assigned_a, 2);
        assert_eq!(s.footswitch_ii.current_assigned_b, 3);
        assert!(!s.footswitch_ii.global_bypass_enabled);
    }

    #[test]
    fn enums_serialize_as_kebab_case_for_the_ipc_contract() {
        use serde_json::to_string as j;
        assert_eq!(
            j(&PresetOperationMode::FourPreset).unwrap(),
            "\"four-preset\""
        );
        assert_eq!(
            j(&FootswitchPressRole::GlobalBypass).unwrap(),
            "\"global-bypass\""
        );
        assert_eq!(
            j(&FootswitchLongPressAction::TapTempo).unwrap(),
            "\"tap-tempo\""
        );
        assert_eq!(
            j(&RotaryEncoderRole::CaptureScroll).unwrap(),
            "\"capture-scroll\""
        );
    }

    #[test]
    fn footswitch_state_round_trips_through_json() {
        let original = NanoCortexFootswitchState::default();
        let json = serde_json::to_string(&original).unwrap();
        let restored: NanoCortexFootswitchState = serde_json::from_str(&json).unwrap();
        assert_eq!(original, restored);
    }
}
