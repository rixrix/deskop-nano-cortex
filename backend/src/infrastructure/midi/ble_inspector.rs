//! GATT characteristic inspection and BleInspectionReport generation.
//!
//! @see docs/specs/110-backend-midi-ble/spec.md [FR-8]
//! @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-DEBUG]

use btleplug::api::{CharPropFlags, Characteristic};

use crate::infrastructure::midi::ble_debug::{characteristic_snapshot, CharacteristicSnapshot};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BleInspectionReport {
    pub service_uuids: Vec<String>,
    pub characteristics: Vec<CharacteristicSnapshot>,
    pub readable_characteristics: Vec<String>,
    pub writable_characteristics: Vec<String>,
    pub notifying_characteristics: Vec<String>,
}

/// Inspect discovered GATT services/characteristics without assuming a public Nano
/// Cortex schema. This report is suitable for trace comparison and capability work.
pub fn inspect_characteristics(
    service_uuids: Vec<String>,
    characteristics: &[Characteristic],
) -> BleInspectionReport {
    BleInspectionReport {
        service_uuids,
        characteristics: characteristics
            .iter()
            .map(characteristic_snapshot)
            .collect(),
        readable_characteristics: characteristics
            .iter()
            .filter(|c| c.properties.contains(CharPropFlags::READ))
            .map(|c| c.uuid.to_string())
            .collect(),
        writable_characteristics: characteristics
            .iter()
            .filter(|c| {
                c.properties.contains(CharPropFlags::WRITE)
                    || c.properties.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE)
            })
            .map(|c| c.uuid.to_string())
            .collect(),
        notifying_characteristics: characteristics
            .iter()
            .filter(|c| {
                c.properties.contains(CharPropFlags::NOTIFY)
                    || c.properties.contains(CharPropFlags::INDICATE)
            })
            .map(|c| c.uuid.to_string())
            .collect(),
    }
}
