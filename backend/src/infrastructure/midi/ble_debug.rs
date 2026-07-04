//! BLE packet logger, hex utilities, and characteristic snapshot helpers.
//!
//! @see docs/specs/110-backend-midi-ble/spec.md [FR-7]
//! @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-DEBUG]

use btleplug::api::{CharPropFlags, Characteristic};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum BlePacketDirection {
    Read,
    Write,
    Notification,
    Indication,
    Characteristic,
    Service,
    Event,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlePacketLogEntry {
    pub timestamp_ms: u128,
    pub direction: BlePacketDirection,
    pub device_name: Option<String>,
    pub service_uuid: Option<String>,
    pub characteristic_uuid: Option<String>,
    pub properties: Option<Vec<String>>,
    pub payload_hex: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacteristicSnapshot {
    pub service_uuid: String,
    pub characteristic_uuid: String,
    pub properties: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct BlePacketLogger {
    entries: Arc<Mutex<Vec<BlePacketLogEntry>>>,
}

impl BlePacketLogger {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_enabled() -> bool {
        std::env::var("NANO_BLE_DEBUG")
            .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
            .unwrap_or(false)
    }

    pub fn snapshot(&self) -> Vec<BlePacketLogEntry> {
        self.entries
            .lock()
            .map(|entries| entries.clone())
            .unwrap_or_default()
    }

    pub fn record(&self, entry: BlePacketLogEntry) {
        if let Ok(mut entries) = self.entries.lock() {
            entries.push(entry);
            const MAX_DEBUG_ENTRIES: usize = 2_000;
            if entries.len() > MAX_DEBUG_ENTRIES {
                let overflow = entries.len() - MAX_DEBUG_ENTRIES;
                entries.drain(0..overflow);
            }
        }
    }

    pub fn record_payload(
        &self,
        direction: BlePacketDirection,
        characteristic: &Characteristic,
        payload: &[u8],
        note: Option<String>,
    ) {
        self.record(BlePacketLogEntry {
            timestamp_ms: now_ms(),
            direction,
            device_name: None,
            service_uuid: Some(characteristic.service_uuid.to_string()),
            characteristic_uuid: Some(characteristic.uuid.to_string()),
            properties: Some(char_prop_names(characteristic.properties)),
            payload_hex: Some(hex(payload)),
            note,
        });
    }

    pub fn record_characteristic(&self, characteristic: &Characteristic) {
        self.record(BlePacketLogEntry {
            timestamp_ms: now_ms(),
            direction: BlePacketDirection::Characteristic,
            device_name: None,
            service_uuid: Some(characteristic.service_uuid.to_string()),
            characteristic_uuid: Some(characteristic.uuid.to_string()),
            properties: Some(char_prop_names(characteristic.properties)),
            payload_hex: None,
            note: None,
        });
    }
}

pub fn characteristic_snapshot(c: &Characteristic) -> CharacteristicSnapshot {
    CharacteristicSnapshot {
        service_uuid: c.service_uuid.to_string(),
        characteristic_uuid: c.uuid.to_string(),
        properties: char_prop_names(c.properties),
    }
}

pub fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default()
}

pub fn hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("{b:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn char_prop_names(props: CharPropFlags) -> Vec<String> {
    let mut out = Vec::new();
    if props.contains(CharPropFlags::BROADCAST) {
        out.push("broadcast".into());
    }
    if props.contains(CharPropFlags::READ) {
        out.push("read".into());
    }
    if props.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE) {
        out.push("write-without-response".into());
    }
    if props.contains(CharPropFlags::WRITE) {
        out.push("write".into());
    }
    if props.contains(CharPropFlags::NOTIFY) {
        out.push("notify".into());
    }
    if props.contains(CharPropFlags::INDICATE) {
        out.push("indicate".into());
    }
    if props.contains(CharPropFlags::AUTHENTICATED_SIGNED_WRITES) {
        out.push("authenticated-signed-writes".into());
    }
    if props.contains(CharPropFlags::EXTENDED_PROPERTIES) {
        out.push("extended-properties".into());
    }
    out
}
