//! Domain value objects (no I/O). Cross-zone barrel: types are owned by the zone
//! that documents their behavior (see the routing index).
//!
//! @see docs/specs/001-overview/spec.md [FR-3]
//! @see docs/specs/001-overview/design.md [DES-FILES]
pub mod device;
pub mod footswitch;
pub mod midi_message;
pub mod nano_state;
pub mod port;
pub mod settings;

pub use device::{Device, DeviceState};
pub use footswitch::{
    FootswitchEvent, FootswitchIIState, FootswitchId, FootswitchLongPressAction,
    FootswitchPressRole, FootswitchState, FootswitchSubslot, NanoCortexFootswitchState,
    PresetOperationMode, QuickPresetSlot, RotaryEncoderMapping, RotaryEncoderRole,
};
pub use midi_message::MidiMessage;
pub use nano_state::{
    CapabilityMatrix, CapabilityStatus, NanoFootswitchAssignments, NanoSlotRole, NanoSlotState,
    NanoState, SyncMode,
};
pub use port::{MidiPort, PortDirection, PortKind};
pub use settings::Settings;

/// Events that the backend can emit to the frontend.
#[derive(Debug, Clone, serde::Serialize)]
pub enum DeviceEvent {
    Connected { name: String, ports: Vec<MidiPort> },
    Disconnected,
    Error { message: String },
}
