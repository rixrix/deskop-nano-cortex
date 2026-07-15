//! Provisional decoder for the captured full current-state DUMP reply (`c305`). This is
//! a DIFFERENT field namespace from the knob-twist event decoder — see [DES-BLE-PROTOCOL]. Pure
//! byte parsing; no BLE dependency, so it compiles and is tested regardless of the `ble` feature.
//!
//! Attribution: the DUMP field map / command frames parsed here are derived from the MIT-licensed
//! `nano-cortex-web-editor` (https://github.com/choldy/nano-cortex-web-editor), reimplemented in
//! Rust and verified against this project's own captures. See THIRD-PARTY-NOTICES.md.
//!
//! @see docs/specs/110-backend-midi-ble/spec.md [FR-18] [FR-19]
//! @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]

const EXPECTED_PRESET_SLOTS: usize = 64;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FxModelId {
    /// Raw protobuf value bytes, rendered as uppercase hex without spaces.
    pub raw_hex: String,
    pub numeric: Option<u64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FootswitchAssignments {
    pub ia: u8,
    pub ib: u8,
    pub iia: u8,
    pub iib: u8,
}

/// Parsed current-state dump: amp knobs (raw 0-255), fixed block state, names, firmware, FX bypass.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StateDump {
    pub gain: Option<u8>,
    pub level: Option<u8>,
    pub bass: Option<u8>,
    pub mid: Option<u8>,
    pub treble: Option<u8>,
    pub capture_slot: Option<u8>,
    pub capture_volume: Option<u8>,
    pub gate_on: Option<bool>,
    pub gate_reduction: Option<u8>,
    pub cab_ir_on: Option<bool>,
    pub firmware: Option<String>,
    pub capture_name: Option<String>,
    pub ir_name: Option<String>,
    /// `[pre1,pre2,post1,post2,post3]`, 0 = on / non-zero = bypassed.
    pub bypass: Option<Vec<u8>>,
    /// `[pre1,pre2,post1,post2,post3]` model ids from current-state fields 48-52.
    pub fx_model_ids: Vec<Option<FxModelId>>,
    pub footswitch_assignments: Option<FootswitchAssignments>,
}

enum ProtoValue {
    Varint(u64),
    Bytes(Vec<u8>),
    Fixed32(u32),
}

/// Decode a `c305` dump-reply payload. Returns `None` if the packet is not a dump (too small, or
/// second byte != `0xC1`). The dump arrives as a single notification whose 2nd byte is `0xC1`;
/// strip the 2-byte packet header and parse the protobuf body.
pub fn decode_state_dump(payload: &[u8]) -> Option<StateDump> {
    if payload.len() < 40 || payload.get(1) != Some(&0xC1) {
        return None;
    }
    decode_state_dump_body(&payload[2..])
}

/// Decode the latest state dump from a notification payload sequence. The device has emitted the
/// dump in two observed forms: a single `C1` notification and a segmented `FE` stream. Prefer the
/// newest complete stream over older single packets so callers do not accidentally reuse stale
/// state when the latest reply is segmented.
pub fn decode_latest_state_dump_payloads(payloads: &[Vec<u8>]) -> Option<StateDump> {
    for start in (0..payloads.len()).rev() {
        if !is_state_stream_start(&payloads[start]) {
            continue;
        }

        let mut body = Vec::new();
        for payload in &payloads[start..] {
            if !is_state_stream_packet(payload) {
                break;
            }
            body.extend_from_slice(&payload[2..]);
        }
        if let Some(dump) = decode_state_dump_body(&body) {
            return Some(dump);
        }
    }

    payloads
        .iter()
        .rev()
        .find_map(|payload| decode_state_dump(payload))
}

fn decode_state_dump_body(body: &[u8]) -> Option<StateDump> {
    let fields = parse_proto_fields(body);

    let varint_u8 = |f: u64| -> Option<u8> {
        fields
            .iter()
            .find(|(n, _)| *n == f)
            .and_then(|(_, v)| match v {
                ProtoValue::Varint(x) => Some((*x).min(255) as u8),
                ProtoValue::Bytes(_) => None,
                ProtoValue::Fixed32(_) => None,
            })
    };
    let bytes_of = |f: u64| -> Option<&[u8]> {
        fields
            .iter()
            .find(|(n, _)| *n == f)
            .and_then(|(_, v)| match v {
                ProtoValue::Bytes(b) => Some(b.as_slice()),
                ProtoValue::Varint(_) => None,
                ProtoValue::Fixed32(_) => None,
            })
    };
    let bool_flag = |f: u64| -> Option<bool> {
        fields.iter().find(|(n, _)| *n == f).map(|(_, v)| match v {
            ProtoValue::Varint(x) => *x != 0,
            ProtoValue::Bytes(b) => !b.is_empty(),
            ProtoValue::Fixed32(x) => *x != 0,
        })
    };
    let fixed32_f32 = |f: u64| -> Option<f32> {
        fields
            .iter()
            .find(|(n, _)| *n == f)
            .and_then(|(_, v)| match v {
                ProtoValue::Fixed32(x) => Some(f32::from_le_bytes(x.to_le_bytes())),
                _ => None,
            })
    };
    let model_id = |f: u64| -> Option<FxModelId> {
        fields
            .iter()
            .find(|(n, _)| *n == f)
            .and_then(|(_, v)| match v {
                ProtoValue::Varint(x) => {
                    let raw = encode_varint(*x);
                    Some(FxModelId {
                        raw_hex: hex_compact(&raw),
                        numeric: Some(*x),
                    })
                }
                ProtoValue::Bytes(b) => Some(FxModelId {
                    raw_hex: hex_compact(b),
                    numeric: decode_varint(b),
                }),
                ProtoValue::Fixed32(_) => None,
            })
    };
    // capture/IR submessage carries the name at sub-field 2: `{1:enabled, 2:name, ...}`.
    let sub_name = |f: u64| -> Option<String> {
        let raw = bytes_of(f)?;
        parse_proto_fields(raw)
            .into_iter()
            .find_map(|(n, v)| match v {
                ProtoValue::Bytes(b) if n == 2 => ascii(&b),
                _ => None,
            })
    };

    let dump = StateDump {
        gain: varint_u8(3),
        level: varint_u8(4),
        bass: varint_u8(5),
        mid: varint_u8(6),
        treble: varint_u8(7),
        capture_slot: varint_u8(11),
        capture_volume: varint_u8(44),
        // Field 54 is an inverted gate-bypass flag in the current-state namespace. When the
        // field is absent in an otherwise-valid dump, hardware traces show the gate as enabled.
        gate_on: Some(varint_u8(54).map(|value| value == 0).unwrap_or(true)),
        // Field 53 is a fixed32 normalized value. For Gate reduction, traces show it as
        // `(percent + 108) / 255.0`, matching the live write frame's offset varint.
        gate_reduction: fixed32_f32(53).and_then(gate_reduction_from_dump_value),
        cab_ir_on: Some(bool_flag(12).unwrap_or(false)),
        firmware: bytes_of(24).and_then(ascii),
        capture_name: sub_name(32),
        ir_name: sub_name(33),
        bypass: bytes_of(31).map(|b| b.iter().copied().take(5).collect()),
        fx_model_ids: [48, 49, 50, 51, 52].into_iter().map(model_id).collect(),
        footswitch_assignments: match (varint_u8(14), varint_u8(15), varint_u8(38), varint_u8(39)) {
            (Some(ia), Some(ib), Some(iia), Some(iib)) => {
                Some(FootswitchAssignments { ia, ib, iia, iib })
            }
            _ => None,
        },
    };

    if dump.gain.is_none()
        && dump.level.is_none()
        && dump.bass.is_none()
        && dump.mid.is_none()
        && dump.treble.is_none()
        && dump.capture_name.is_none()
        && dump.ir_name.is_none()
    {
        return None;
    }

    Some(dump)
}

fn is_state_stream_start(bytes: &[u8]) -> bool {
    bytes.len() > 2 && matches!(bytes[0], 0xFE | 0xFD | 0xCE | 0xD0)
}

fn is_state_stream_packet(bytes: &[u8]) -> bool {
    bytes.len() > 2 && (is_state_stream_start(bytes) || bytes[1] & 0x80 != 0)
}

fn ascii(bytes: &[u8]) -> Option<String> {
    if !bytes.is_empty() && bytes.iter().all(|c| (0x20..0x7f).contains(c)) {
        Some(String::from_utf8_lossy(bytes).to_string())
    } else {
        None
    }
}

fn hex_compact(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join("")
}

fn encode_varint(mut value: u64) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            break;
        }
    }
    out
}

fn decode_varint(bytes: &[u8]) -> Option<u64> {
    let (value, next) = read_varint(bytes, 0)?;
    if next == bytes.len() {
        Some(value)
    } else {
        None
    }
}

/// Minimal protobuf reader — returns every field in order (repeated fields kept; callers that
/// want a single value use `.find`, which returns the first).
fn parse_proto_fields(bytes: &[u8]) -> Vec<(u64, ProtoValue)> {
    let mut out: Vec<(u64, ProtoValue)> = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let (tag, next) = match read_varint(bytes, i) {
            Some(v) => v,
            None => break,
        };
        i = next;
        let field = tag >> 3;
        let wire = tag & 0x7;
        match wire {
            0 => {
                let (value, next) = match read_varint(bytes, i) {
                    Some(v) => v,
                    None => break,
                };
                i = next;
                out.push((field, ProtoValue::Varint(value)));
            }
            2 => {
                let (len, start) = match read_varint(bytes, i) {
                    Some(v) => v,
                    None => break,
                };
                let end = start + len as usize;
                if end > bytes.len() {
                    break;
                }
                out.push((field, ProtoValue::Bytes(bytes[start..end].to_vec())));
                i = end;
            }
            5 => {
                if i + 4 > bytes.len() {
                    break;
                }
                out.push((
                    field,
                    ProtoValue::Fixed32(u32::from_le_bytes([
                        bytes[i],
                        bytes[i + 1],
                        bytes[i + 2],
                        bytes[i + 3],
                    ])),
                ));
                i += 4;
            }
            1 => i += 8,
            _ => break,
        }
    }
    out
}

fn gate_reduction_from_dump_value(value: f32) -> Option<u8> {
    if !value.is_finite() {
        return None;
    }
    let raw = (value * 255.0).round() as i16;
    let percent = raw - 108;
    if (0..=100).contains(&percent) {
        Some(percent as u8)
    } else {
        None
    }
}

/// Parsed device metadata: preset/capture/IR name lists from the FE-stream metadata dump.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataDump {
    /// Preset names in slot order (up to 64).
    pub preset_names: Vec<String>,
    pub capture_names: Vec<String>,
    pub ir_names: Vec<String>,
    pub packet_count: usize,
    pub payload_bytes: usize,
    pub expected_preset_slots: usize,
    pub preset_slots: usize,
    pub usable_preset_names: usize,
    pub complete: bool,
}

/// Parsed FX parameter refresh reply from `c305`.
///
/// The refresh response is a compact protobuf-style frame whose byte 4 is field `0x22`, byte 5 is
/// the float payload length, and the values are little-endian `f32`s. These values stay read-only
/// until a manual hardware session proves the matching write path.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FxParamRefresh {
    pub values: Vec<f32>,
}

pub fn decode_fx_param_refresh(payload: &[u8]) -> Option<FxParamRefresh> {
    if payload.len() < 10
        || payload.get(1) != Some(&0xC0)
        || payload.get(2) != Some(&0x08)
        || payload.get(3) != Some(&0x06)
        || payload.get(4) != Some(&0x22)
    {
        return None;
    }

    let byte_len = *payload.get(5)? as usize;
    if byte_len == 0 || !byte_len.is_multiple_of(4) {
        return None;
    }

    let start = 6usize;
    let end = start.checked_add(byte_len)?;
    if end > payload.len() {
        return None;
    }

    let values = payload[start..end]
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();

    Some(FxParamRefresh { values })
}

/// Parsed Cab/IR parameter refresh reply. These values are read-only until the matching write UI
/// is deliberately graduated.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CabIrParamRefresh {
    pub level_db: Option<f32>,
    pub high_pass_hz: Option<f32>,
    pub low_pass_hz: Option<f32>,
    pub mic: Option<String>,
    pub position: Option<u8>,
}

pub fn decode_cab_ir_param_refresh(payload: &[u8]) -> Option<CabIrParamRefresh> {
    if payload.len() <= 20
        || payload.get(1) != Some(&0xc0)
        || payload.get(2) != Some(&0x08)
        || payload.get(3) != Some(&0x06)
    {
        return None;
    }

    let (mic, position) = parse_cab_ir_name_parts(&printable_ascii(payload));
    let blob = extract_cab_ir_param_blob(payload);
    if blob.is_none() && (mic.is_none() || position.is_none()) {
        return None;
    }
    let (level_norm, high_pass_norm, low_pass_norm) = blob
        .as_deref()
        .map(parse_cab_ir_param_blob)
        .unwrap_or((None, None, None));

    Some(CabIrParamRefresh {
        level_db: level_norm.map(cab_ir_level_normalized_to_db),
        high_pass_hz: high_pass_norm.map(|value| normalized_to_range(value, 20.0, 800.0).round()),
        low_pass_hz: low_pass_norm
            .map(|value| normalized_to_range(value, 1_000.0, 20_000.0).round()),
        mic,
        position,
    })
}

fn printable_ascii(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| {
            if (0x20..=0x7e).contains(byte) {
                *byte as char
            } else {
                '.'
            }
        })
        .collect()
}

fn parse_cab_ir_name_parts(text: &str) -> (Option<String>, Option<u8>) {
    let parts: Vec<&str> = text
        .split('/')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect();
    if parts.len() < 3 {
        return (None, None);
    }

    let mic = parts[parts.len() - 2].trim_matches('.').trim();
    let position = parts[parts.len() - 1]
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect::<String>()
        .parse::<u8>()
        .ok()
        .map(|zero_based| zero_based.saturating_add(1));

    (
        if mic.is_empty() {
            None
        } else {
            Some(mic.to_string())
        },
        position,
    )
}

fn extract_cab_ir_param_blob(payload: &[u8]) -> Option<Vec<u8>> {
    payload
        .windows(2)
        .position(|window| window[0] == 0x42 && (0x05..=0x20).contains(&window[1]))
        .and_then(|index| {
            let len = usize::from(payload[index + 1]);
            let start = index + 2;
            let end = start + len;
            (end <= payload.len()).then(|| payload[start..end].to_vec())
        })
}

fn parse_cab_ir_param_blob(blob: &[u8]) -> (Option<f32>, Option<f32>, Option<f32>) {
    let mut level_norm = None;
    let mut high_pass_norm = None;
    let mut low_pass_norm = None;
    let mut i = 0usize;

    while i + 4 < blob.len() {
        let tag = blob[i];
        i += 1;
        if matches!(tag, 0x0d | 0x15 | 0x1d) && i + 4 <= blob.len() {
            let value = f32::from_le_bytes([blob[i], blob[i + 1], blob[i + 2], blob[i + 3]]);
            match tag {
                0x0d => level_norm = Some(value),
                0x15 => high_pass_norm = Some(value),
                0x1d => low_pass_norm = Some(value),
                _ => {}
            }
            i += 4;
        } else {
            break;
        }
    }

    (level_norm, high_pass_norm, low_pass_norm)
}

fn cab_ir_level_normalized_to_db(normalized: f32) -> f32 {
    let n = normalized.clamp(0.0, 1.0);
    const ZERO_DB_NORMALIZED: f32 = 0.662_122_2;

    if n <= ZERO_DB_NORMALIZED {
        (n / ZERO_DB_NORMALIZED) * 96.0 - 96.0
    } else {
        ((n - ZERO_DB_NORMALIZED) / (1.0 - ZERO_DB_NORMALIZED)) * 12.0
    }
}

fn normalized_to_range(normalized: f32, min: f32, max: f32) -> f32 {
    min + normalized.clamp(0.0, 1.0) * (max - min)
}

/// Decode the reassembled metadata message (concatenation of each FE-packet's bytes past the
/// 2-byte header). Fields: 18 = presets[] `{1:name, 7:captureName}`; 17 = captures[] `{2:name}`;
/// 19 = IRs[] `{1:shortName}`. Slot order is preserved; blank/internal identifier-like names decode
/// as blank strings so callers can keep index alignment and fall back to default labels.
pub fn decode_metadata(reassembled: &[u8]) -> MetadataDump {
    let names = |list_field: u64, name_sub: u64| -> Vec<String> {
        scan_length_delimited_fields(reassembled, list_field)
            .into_iter()
            .map(|rec| metadata_name_from_record(&rec, name_sub))
            .collect()
    };
    let preset_names = names(18, 1);
    let usable_preset_names = preset_names
        .iter()
        .filter(|name| !name.trim().is_empty())
        .count();
    MetadataDump {
        preset_slots: preset_names.len().min(EXPECTED_PRESET_SLOTS),
        usable_preset_names,
        complete: preset_names.len() >= EXPECTED_PRESET_SLOTS,
        expected_preset_slots: EXPECTED_PRESET_SLOTS,
        payload_bytes: reassembled.len(),
        packet_count: 0,
        preset_names,
        capture_names: names(17, 2),
        ir_names: names(19, 1),
    }
}

fn metadata_name_from_record(record: &[u8], name_sub: u64) -> String {
    parse_proto_fields(record)
        .into_iter()
        .find_map(|(f, sv)| match sv {
            ProtoValue::Bytes(b) if f == name_sub => Some(sanitize_metadata_name(&b)),
            _ => None,
        })
        .unwrap_or_default()
}

fn sanitize_metadata_name(bytes: &[u8]) -> String {
    let Some(name) = ascii(bytes) else {
        return String::new();
    };
    let trimmed = name.trim();
    if trimmed.is_empty() || is_internal_identifier(trimmed) {
        String::new()
    } else {
        trimmed.to_string()
    }
}

fn is_internal_identifier(value: &str) -> bool {
    let compact: Vec<u8> = value.bytes().filter(|byte| *byte != b'-').collect();
    compact.len() >= 12 && compact.iter().all(u8::is_ascii_hexdigit)
}

fn scan_length_delimited_fields(bytes: &[u8], target_field: u64) -> Vec<Vec<u8>> {
    for start in 0..bytes.len() {
        let records = scan_length_delimited_fields_from(bytes, start, target_field);
        if !records.is_empty() {
            return records;
        }
    }
    Vec::new()
}

fn scan_length_delimited_fields_from(
    bytes: &[u8],
    mut index: usize,
    target_field: u64,
) -> Vec<Vec<u8>> {
    let mut records = Vec::new();
    while index < bytes.len() {
        let Some((tag, after_tag)) = read_varint(bytes, index) else {
            break;
        };
        index = after_tag;
        let field = tag >> 3;
        let wire = tag & 0x7;
        match wire {
            0 => {
                let Some((_, next)) = read_varint(bytes, index) else {
                    break;
                };
                index = next;
            }
            1 => {
                let Some(next) = index.checked_add(8) else {
                    break;
                };
                if next > bytes.len() {
                    break;
                }
                index = next;
            }
            2 => {
                let Some((len, data_start)) = read_varint(bytes, index) else {
                    break;
                };
                let Some(end) = data_start.checked_add(len as usize) else {
                    break;
                };
                if end > bytes.len() {
                    break;
                }
                if field == target_field {
                    records.push(bytes[data_start..end].to_vec());
                }
                index = end;
            }
            5 => {
                let Some(next) = index.checked_add(4) else {
                    break;
                };
                if next > bytes.len() {
                    break;
                }
                index = next;
            }
            _ => break,
        }
    }
    records
}

fn read_varint(bytes: &[u8], start: usize) -> Option<(u64, usize)> {
    let mut value: u64 = 0;
    let mut shift = 0;
    let mut i = start;
    while i < bytes.len() {
        let b = bytes[i];
        value |= ((b & 0x7f) as u64) << shift;
        i += 1;
        if b & 0x80 == 0 {
            return Some((value, i));
        }
        shift += 7;
        if shift > 63 {
            return None;
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_hex(s: &str) -> Vec<u8> {
        s.split_whitespace()
            .map(|t| u8::from_str_radix(t, 16).unwrap())
            .collect()
    }

    // Real reply captured from a Nano Cortex (firmware 2.2.1).
    const DUMP: &str = "E6 C1 08 01 18 7F 20 90 01 28 81 01 30 7F 38 71 40 7A 48 02 50 03 58 02 68 07 70 03 78 07 C2 01 05 32 2E 32 2E 31 CA 01 08 30 35 63 33 36 36 32 31 D0 01 19 D8 01 0A E0 01 01 F0 01 01 FA 01 05 01 01 00 00 00 82 02 55 08 01 12 0F 4E 6F 4D 61 74 63 68 20 43 68 69 65 66 20 31 1A 40 64 34 38 62 34 33 31 36 64 62 63 63 37 36 34 62 34 62 34 62 33 66 36 33 34 64 38 38 37 38 61 62 36 36 63 39 36 36 38 38 33 64 34 38 30 66 39 32 36 34 38 38 32 35 66 39 63 61 33 61 30 30 33 30 8A 02 31 08 01 12 0F 31 31 30 20 55 53 20 50 52 4E 20 43 31 30 52 1A 1C 31 31 30 20 55 53 20 50 52 4E 20 43 31 30 52 2F 52 69 62 62 6F 6E 20 31 36 30 2F 32 92 02 9C 01 0A 40 64 34 38 62 34 33 31 36 64 62 63 63 37 36 34 62 34 62 34 62 33 66 36 33 34 64 38 38 37 38 61 62 36 36 63 39 36 36 38 38 33 64 34 38 30 66 39 32 36 34 38 38 32 35 66 39 63 61 33 61 30 30 33 30 12 0F 4E 6F 4D 61 74 63 68 20 43 68 69 65 66 20 31 22 16 0A 09 4E 65 75 72 61 6C 44 53 50 12 09 4E 65 75 72 61 6C 44 53 50 32 08 61 6D 70 5F 68 65 61 64 3A 09 4D 61 74 63 68 6C 65 73 73 3A 09 43 68 69 65 66 74 61 69 6E 40 06 52 06 67 75 69 74 61 72 58 01 62 01 31 68 00 9A 02 31 0A 0F 31 31 30 20 55 53 20 50 52 4E 20 43 31 30 52 12 00 1A 1C 31 31 30 20 55 53 20 50 52 4E 20 43 31 30 52 2F 52 69 62 62 6F 6E 20 31 36 30 2F 32 A8 02 01 B0 02 0A B8 02 10 C0 02 01 C8 02 01 D0 02 90 01 E0 02 7F F5 02 00 00 DC 43 80 03 D1 8C 01 88 03 1B 90 03 F3 36 98 03 FA 2E A0 03 CB 3E AD 03 CD CC CC 3D C5 03 00 00 F0 42 F8 03 01 02 00 00 00";

    #[test]
    fn decodes_amp_knobs_names_firmware_and_bypass_from_real_dump() {
        let dump = decode_state_dump(&parse_hex(DUMP)).expect("should decode");
        assert_eq!(dump.gain, Some(127));
        assert_eq!(dump.level, Some(144));
        assert_eq!(dump.bass, Some(129));
        assert_eq!(dump.mid, Some(127));
        assert_eq!(dump.treble, Some(113));
        assert_eq!(dump.capture_slot, Some(2));
        assert_eq!(dump.capture_volume, Some(127));
        assert_eq!(dump.gate_on, Some(true));
        assert_eq!(dump.gate_reduction, None);
        assert_eq!(dump.cab_ir_on, Some(false));
        assert_eq!(dump.firmware.as_deref(), Some("2.2.1"));
        assert_eq!(dump.capture_name.as_deref(), Some("NoMatch Chief 1"));
        assert_eq!(dump.ir_name.as_deref(), Some("110 US PRN C10R"));
        assert_eq!(dump.bypass, Some(vec![1, 1, 0, 0, 0]));
        let raw_ids: Vec<_> = dump
            .fx_model_ids
            .iter()
            .map(|id| id.as_ref().map(|id| id.raw_hex.as_str()))
            .collect();
        assert_eq!(
            raw_ids,
            vec![
                Some("D18C01"),
                Some("1B"),
                Some("F336"),
                Some("FA2E"),
                Some("CB3E")
            ]
        );
        assert_eq!(
            dump.footswitch_assignments,
            Some(FootswitchAssignments {
                ia: 3,
                ib: 7,
                iia: 10,
                iib: 16,
            })
        );
    }

    #[test]
    fn decodes_gate_reduction_from_confirmed_fixed32_dump_field() {
        let payload = DUMP.replace("AD 03 CD CC CC 3D", "AD 03 B8 B7 37 3F");
        let dump = decode_state_dump(&parse_hex(&payload)).expect("should decode");

        assert_eq!(dump.gate_reduction, Some(75));
    }

    #[test]
    fn rejects_non_dump_packets() {
        // Short knob-event packet (2nd byte 0xC0, not 0xC1).
        assert!(decode_state_dump(&parse_hex("0B C0 08 01 18 02 20 80 01 40 00 00 00")).is_none());
        assert!(decode_state_dump(&[]).is_none());
    }

    #[test]
    fn decodes_latest_segmented_state_dump_instead_of_stale_single_packet() {
        let stale = parse_hex("28 C1 08 01 18 0A 20 0B 28 0C 30 0D 38 0E 82 02 0B 08 01 12 07 53 74 61 6C 65 20 31 8A 02 0D 08 01 12 09 53 74 61 6C 65 20 49 52");
        let current_body = parse_hex("08 01 18 76 20 74 28 7F 30 7F 38 72 82 02 0D 08 01 12 09 43 75 72 72 65 6E 74 20 31 8A 02 0E 08 01 12 0A 43 75 72 72 65 6E 74 20 49 52");
        let mut start = vec![0xFE, 0x41];
        start.extend_from_slice(&current_body[..24]);
        let mut continuation = vec![0x17, 0x80];
        continuation.extend_from_slice(&current_body[24..]);

        let dump = decode_latest_state_dump_payloads(&[stale, start, continuation])
            .expect("should decode latest segmented dump");
        assert_eq!(dump.gain, Some(118));
        assert_eq!(dump.level, Some(116));
        assert_eq!(dump.bass, Some(127));
        assert_eq!(dump.mid, Some(127));
        assert_eq!(dump.treble, Some(114));
        assert_eq!(dump.capture_name.as_deref(), Some("Current 1"));
        assert_eq!(dump.ir_name.as_deref(), Some("Current IR"));
    }

    #[test]
    fn decode_metadata_extracts_repeated_preset_and_capture_names() {
        // Synthetic reassembled metadata: 2 presets (field 18, {1:name}) + 1 capture
        // (field 17, {2:name}). Verifies repeated-field handling + sub-name extraction.
        let bytes = parse_hex(concat!(
            "92 01 09 0A 07 43 6C 65 61 6E 20 31 ", // preset "Clean 1"
            "92 01 08 0A 06 45 64 67 65 20 32 ",    // preset "Edge 2"
            "8A 01 07 12 05 43 61 70 20 41"         // capture "Cap A"
        ));
        let md = decode_metadata(&bytes);
        assert_eq!(
            md.preset_names,
            vec!["Clean 1".to_string(), "Edge 2".to_string()]
        );
        assert_eq!(md.capture_names, vec!["Cap A".to_string()]);
        assert!(md.ir_names.is_empty());
        assert_eq!(md.preset_slots, 2);
        assert_eq!(md.expected_preset_slots, 64);
        assert_eq!(md.usable_preset_names, 2);
        assert!(!md.complete);
        assert_eq!(md.payload_bytes, bytes.len());
    }

    #[test]
    fn decode_metadata_marks_full_preset_name_list_complete() {
        let mut bytes = Vec::new();
        for slot in 0..64 {
            let name = format!("Preset {}", slot + 1);
            let mut record = vec![0x0A, name.len() as u8];
            record.extend_from_slice(name.as_bytes());
            bytes.extend_from_slice(&[0x92, 0x01, record.len() as u8]);
            bytes.extend_from_slice(&record);
        }

        let md = decode_metadata(&bytes);
        assert_eq!(md.preset_slots, 64);
        assert_eq!(md.usable_preset_names, 64);
        assert!(md.complete);
        assert_eq!(md.payload_bytes, bytes.len());
    }

    #[test]
    fn decode_metadata_scans_past_partial_prefix_bytes() {
        let bytes = parse_hex(concat!(
            "08 01 12 FF FF ",                      // leading partial/non-metadata bytes
            "92 01 09 0A 07 43 6C 65 61 6E 20 31 ", // preset "Clean 1"
            "8A 01 07 12 05 43 61 70 20 41 ",       // capture "Cap A"
            "9A 01 07 0A 05 49 52 20 30 31"         // IR "IR 01"
        ));
        let md = decode_metadata(&bytes);
        assert_eq!(md.preset_names, vec!["Clean 1".to_string()]);
        assert_eq!(md.capture_names, vec!["Cap A".to_string()]);
        assert_eq!(md.ir_names, vec!["IR 01".to_string()]);
    }

    #[test]
    fn decode_metadata_preserves_blank_preset_slots() {
        let bytes = parse_hex(concat!(
            "92 01 09 0A 07 43 6C 65 61 6E 20 31 ", // preset slot 0 "Clean 1"
            "92 01 08 0A 00 22 04 0A 00 12 00 ",    // blank preset slot 1
            "92 01 08 0A 06 45 64 67 65 20 32"      // preset slot 2 "Edge 2"
        ));
        let md = decode_metadata(&bytes);
        assert_eq!(
            md.preset_names,
            vec!["Clean 1".to_string(), String::new(), "Edge 2".to_string()]
        );
    }

    #[test]
    fn decode_metadata_blanks_internal_identifier_names_without_shifting_slots() {
        let bytes = parse_hex(concat!(
            "92 01 09 0A 07 43 6C 65 61 6E 20 31 ", // preset slot 0 "Clean 1"
            "92 01 11 0A 0F 43 62 38 62 61 30 31 36 35 30 32 65 38 39 32 ",
            "92 01 08 0A 06 45 64 67 65 20 32" // preset slot 2 "Edge 2"
        ));
        let md = decode_metadata(&bytes);
        assert_eq!(
            md.preset_names,
            vec!["Clean 1".to_string(), String::new(), "Edge 2".to_string()]
        );
    }

    #[test]
    fn decode_metadata_does_not_scan_nested_records_as_presets() {
        let bytes = parse_hex(concat!(
            "8A 01 14 92 01 11 0A 0F 43 62 38 62 61 30 31 36 35 30 32 65 38 39 32 ",
            "92 01 09 0A 07 43 6C 65 61 6E 20 31"
        ));
        let md = decode_metadata(&bytes);
        assert_eq!(md.preset_names, vec!["Clean 1".to_string()]);
    }

    #[test]
    fn decode_fx_param_refresh_reads_little_endian_float_values() {
        let refresh =
            decode_fx_param_refresh(&parse_hex("0E C0 08 06 22 08 00 00 00 3F 00 00 80 3F"))
                .expect("should decode");

        assert_eq!(refresh.values, vec![0.5, 1.0]);
    }

    #[test]
    fn decode_fx_param_refresh_rejects_wrong_or_truncated_packets() {
        assert!(
            decode_fx_param_refresh(&parse_hex("0E C0 08 06 23 08 00 00 00 3F 00 00 80 3F",))
                .is_none()
        );
        assert!(
            decode_fx_param_refresh(&parse_hex("0E C0 08 06 22 07 00 00 00 3F 00 00 80",))
                .is_none()
        );
        assert!(decode_fx_param_refresh(&parse_hex("0E C0 08 06 22 08 00 00 00 3F",)).is_none());
    }

    #[test]
    fn decode_cab_ir_param_refresh_reads_fixed_block_values() {
        let mut payload = vec![0x8e, 0xc0, 0x08, 0x06, b'C', b'a', b'b', b'/'];
        payload.extend(b"Ribbon 160/2");
        payload.extend([0x42, 0x0f, 0x0d]);
        payload.extend(0.662_122_2_f32.to_le_bytes());
        payload.push(0x15);
        payload.extend(0.5f32.to_le_bytes());
        payload.push(0x1d);
        payload.extend(0.25f32.to_le_bytes());

        let refresh = decode_cab_ir_param_refresh(&payload).expect("should decode");
        assert!(refresh.level_db.expect("level") > -0.01);
        assert!(refresh.level_db.expect("level") < 0.01);
        assert_eq!(refresh.high_pass_hz, Some(410.0));
        assert_eq!(refresh.low_pass_hz, Some(5750.0));
        assert_eq!(refresh.mic.as_deref(), Some("Ribbon 160"));
        assert_eq!(refresh.position, Some(3));
    }

    #[test]
    fn decode_cab_ir_param_refresh_accepts_observed_slot_reply_shape() {
        let mut payload = vec![
            0x93, 0xc0, 0x08, 0x06, 0x18, 0x01, 0x2a, 0x3a, 0x08, 0x04, 0x12, 0x13,
        ];
        payload.extend(b"212 US TWN C12Q 00s");
        payload.extend([0x18, 0x02, 0x22, 0x0a]);
        payload.extend(b"Dynamic 57");
        payload.extend([0x2a, 0x20]);
        payload.extend(b"212 US TWN C12Q 00s/Dynamic 57/2");
        payload.extend([0x3a, 0x0a]);
        payload.extend(b"Dynamic 57");
        payload.extend([0x3a, 0x0a]);
        payload.extend(b"Ribbon 160");
        payload.extend([0x2a, 0x13]);
        payload.extend(b"212 US TWN C12Q 00s");
        payload.extend([0x42, 0x0a, 0x0d]);
        payload.extend(0.662_494_9_f32.to_le_bytes());
        payload.push(0x1d);
        payload.extend(1.0_f32.to_le_bytes());

        let refresh = decode_cab_ir_param_refresh(&payload).expect("should decode observed reply");
        assert!(refresh.level_db.expect("level") > 0.0);
        assert!(refresh.level_db.expect("level") < 0.1);
        assert_eq!(refresh.high_pass_hz, None);
        assert_eq!(refresh.low_pass_hz, Some(20_000.0));
        assert_eq!(refresh.mic.as_deref(), Some("Dynamic 57"));
        assert_eq!(refresh.position, Some(3));
    }

    #[test]
    fn decode_cab_ir_param_refresh_rejects_other_packets() {
        assert!(decode_cab_ir_param_refresh(&parse_hex(
            "0E C0 08 06 22 08 00 00 00 3F 00 00 80 3F"
        ))
        .is_none());
    }
}
