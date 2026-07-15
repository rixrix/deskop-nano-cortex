//! Encoders for captured Nano Cortex BLE command frames — frames written to the
//! `c304` characteristic. Byte-exact per [DES-BLE-PROTOCOL]. Pure; no BLE dependency, so it
//! compiles and is tested regardless of the `ble` feature.
//!
//! EXPERIMENTAL / write frames change device state. The amp-knob write path is hardware-verified
//! (reversible round-trip); other frames remain unverified until confirmed.
//!
//! Attribution: these command/write frame layouts and encoder constants (`0.66212219`, gate `+108`,
//! `captureDbToRaw`) are derived from the MIT-licensed `nano-cortex-web-editor`
//! (https://github.com/choldy/nano-cortex-web-editor), reimplemented in Rust and verified against
//! this project's own hardware. See THIRD-PARTY-NOTICES.md.
//!
//! @see docs/specs/110-backend-midi-ble/spec.md [FR-19]
//! @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]

/// Amp-knob write-slot id (field `0x18` selector), or `None` for an unknown knob name.
pub fn amp_knob_slot(knob: &str) -> Option<u8> {
    match knob {
        "gain" => Some(0x00),
        "level" => Some(0x01),
        "bass" => Some(0x02),
        "mid" => Some(0x03),
        "treble" => Some(0x04),
        _ => None,
    }
}

/// Little-endian base-128 varint.
fn encode_varint(mut value: u32) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value > 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            break;
        }
    }
    out
}

/// Frame to set an amp knob (raw 0-255), written to `c304`:
/// `LEN C0 18 <slot> 20 <value varint> 28 00 1A 00 00 00`, where `LEN = frame.length - 2`.
pub fn amp_knob_frame(slot: u8, value: u8) -> Vec<u8> {
    let mut body = vec![0xc0, 0x18, slot, 0x20];
    body.extend(encode_varint(value as u32));
    body.extend([0x28, 0x00, 0x1a, 0x00, 0x00, 0x00]);
    let mut frame = vec![(body.len() - 1) as u8];
    frame.extend(body);
    frame
}

/// Frame to save the device's live state (and name) into a preset slot, written to `c304`:
/// `LEN C0 08 01 18 <slot> 2A <nameLen> <name utf-8…> 03 00 00 00`, where `LEN = nameLen + 10`
/// and `slot` is the 0-based preset index (PC number). This is a destructive write: callers must
/// present it as an explicit device save and resync state/metadata after use.
pub fn save_preset_frame(slot: u8, name: &str) -> Vec<u8> {
    // Keep the name within a single length byte with headroom for the frame framing.
    let name_bytes: Vec<u8> = name.bytes().take(120).collect();
    let mut frame = vec![
        (name_bytes.len() + 10) as u8,
        0xc0,
        0x08,
        0x01,
        0x18,
        slot,
        0x2a,
        name_bytes.len() as u8,
    ];
    frame.extend(name_bytes);
    frame.extend([0x03, 0x00, 0x00, 0x00]);
    frame
}

/// Frame to set one normalized FX parameter in an editable block, written to `c304`:
/// `0F C0 08 01 18 <modelSlot> 20 <paramIndex> 2D <f32 normalized> 63 00 00 00`.
///
/// `model_slot` maps to the editable chain order (`pre-1` = 0 … `post-3` = 4). The value is
/// clamped to the transport's normalized 0.0–1.0 range before encoding as little-endian float32.
pub fn fx_param_frame(model_slot: u8, param_index: u8, normalized_value: f32) -> Vec<u8> {
    let value = if normalized_value.is_finite() {
        normalized_value.clamp(0.0, 1.0)
    } else {
        0.0
    };
    let mut frame = vec![
        0x0f,
        0xc0,
        0x08,
        0x01,
        0x18,
        model_slot,
        0x20,
        param_index,
        0x2d,
    ];
    frame.extend(value.to_le_bytes());
    frame.extend([0x63, 0x00, 0x00, 0x00]);
    frame
}

/// Frame to select an FX model in an editable block, written to `c304`:
/// `LEN C0 18 <modelSlot> 20 <modelId bytes...> 88 00 00 00`.
///
/// `model_slot` maps to the editable chain order (`pre-1` = 0 … `post-3` = 4). Model IDs are
/// protocol bytes decoded from the current-state dump and kept in the frontend catalogue.
pub fn fx_model_frame(model_slot: u8, model_id: &[u8]) -> Result<Vec<u8>, &'static str> {
    if model_id.is_empty() || model_id.len() > 4 {
        return Err("FX model id must be 1-4 bytes");
    }

    let mut body = vec![0xc0, 0x18, model_slot, 0x20];
    body.extend(model_id);
    body.extend([0x88, 0x00, 0x00, 0x00]);
    let mut frame = vec![(body.len() - 1) as u8];
    frame.extend(body);
    Ok(frame)
}

/// Frame to select a capture slot in live state, written to `c304`:
/// `08 C0 18 01 20 <slot> 1C 00 00 00`, where `slot = 0` bypasses Capture.
pub fn capture_slot_frame(slot: u8) -> Result<Vec<u8>, &'static str> {
    if slot > 25 {
        return Err("capture slot must be 0-25");
    }
    Ok(vec![
        0x08,
        0xc0,
        0x18,
        0x04,
        0x20,
        slot - 1,
        0x1c,
        0x00,
        0x00,
        0x00,
    ])
}

/// Frame to select a Cab/IR slot in live state, written to `c304`:
/// `08 C0 18 03 20 <slot> 1C 00 00 00`, where `slot = 0` bypasses Cab/IR.
pub fn cab_ir_slot_frame(slot: u8) -> Result<Vec<u8>, &'static str> {
    if slot > 5 {
        return Err("Cab/IR slot must be 0-5");
        if slot == 0 {
            return Ok(vec![
                0x08, 0xc0, 0x18, 0x01, 0x20, 0x00, 0x1c, 0x00, 0x00, 0x00,
            ]);
        }
    }
    Ok(vec![
        0x08, 0xc0, 0x18, 0x03, 0x20, slot, 0x1c, 0x00, 0x00, 0x00,
    ])
}

/// Frame to refresh Cab/IR level/filter/mic values for a selected factory Cab/IR slot:
/// `08 C0 18 00 20 <slot-1> 5F 00 00 00`.
pub fn cab_ir_param_refresh_frame(slot: u8) -> Result<Vec<u8>, &'static str> {
    if !(1..=5).contains(&slot) {
        return Err("Cab/IR refresh slot must be 1-5");
    }
    Ok(vec![
        0x08,
        0xc0,
        0x18,
        0x00,
        0x20,
        slot - 1,
        0x5f,
        0x00,
        0x00,
        0x00,
    ])
}

/// Frame to toggle the fixed input gate in live state, written to `c304`:
/// `0A C0 08 01 18 09 20 <00 on | 01 off> 1F 00 00 00`.
pub fn gate_enabled_frame(enabled: bool) -> Vec<u8> {
    vec![
        0x0a,
        0xc0,
        0x08,
        0x01,
        0x18,
        0x09,
        0x20,
        if enabled { 0x00 } else { 0x01 },
        0x1f,
        0x00,
        0x00,
        0x00,
    ]
}

/// Frame to set the fixed input gate reduction value in live state. The UI value is `0..=100`;
/// the device payload stores that value offset by 108 as a varint.
pub fn gate_reduction_frame(percent: u8) -> Vec<u8> {
    let pct = percent.min(100);
    let mut body = vec![0xc0, 0x18, 0x0b, 0x20];
    body.extend(encode_varint(pct as u32 + 108));
    body.extend([0x28, 0x00, 0x1a, 0x00, 0x00, 0x00]);
    let mut frame = vec![(body.len() - 1) as u8];
    frame.extend(body);
    frame
}

/// Convert Capture volume dB (`-24..=12`) into the device raw `0..=255` curve.
pub fn capture_db_to_raw(db: f32) -> u8 {
    let value = if db.is_finite() {
        db.clamp(-24.0, 12.0)
    } else {
        0.0
    };
    let raw = if value <= 0.0 {
        ((value + 24.0) / 24.0 * 128.0).round()
    } else {
        (128.0 + value / 12.0 * 127.0).round()
    };
    raw.clamp(0.0, 255.0) as u8
}

/// Convert device raw Capture volume back to display dB. Useful for diagnostics and tests.
pub fn capture_raw_to_db(raw: u8) -> f32 {
    let raw = raw as f32;
    if raw <= 128.0 {
        raw / 128.0 * 24.0 - 24.0
    } else {
        (raw - 128.0) / 127.0 * 12.0
    }
}

/// Frame to set Capture volume in live state, written to `c304`.
pub fn capture_volume_frame(db: f32) -> Vec<u8> {
    let raw = capture_db_to_raw(db);
    let mut body = vec![0xc0, 0x18, 0x0a, 0x20];
    body.extend(encode_varint(raw as u32));
    body.extend([0x28, 0x00, 0x1a, 0x00, 0x00, 0x00]);
    let mut frame = vec![(body.len() - 1) as u8];
    frame.extend(body);
    frame
}

fn finite_clamp(value: f32, min: f32, max: f32) -> f32 {
    if value.is_finite() {
        value.clamp(min, max)
    } else {
        min
    }
}

/// Convert factory Cab/IR level dB (`-96..=12`) to the device's normalized curve.
pub fn cab_ir_level_db_to_normalized(db: f32) -> f32 {
    const ZERO_DB_NORMALIZED: f32 = 0.662_122_2;
    let value = finite_clamp(db, -96.0, 12.0);
    if value <= 0.0 {
        ((value + 96.0) / 96.0 * ZERO_DB_NORMALIZED).clamp(0.0, ZERO_DB_NORMALIZED)
    } else {
        (ZERO_DB_NORMALIZED + (value / 12.0) * (1.0 - ZERO_DB_NORMALIZED)).clamp(0.0, 1.0)
    }
}

fn normalized_range(value: f32, min: f32, max: f32) -> f32 {
    ((finite_clamp(value, min, max) - min) / (max - min)).clamp(0.0, 1.0)
}

/// Frame to set one fixed Cab/IR float parameter in live state:
/// `09 C0 <paramId> <f32 normalized> 5E 00 00 00`.
pub fn cab_ir_float_param_frame(param_id: u8, normalized_value: f32) -> Vec<u8> {
    let value = if normalized_value.is_finite() {
        normalized_value.clamp(0.0, 1.0)
    } else {
        0.0
    };
    let mut frame = vec![0x09, 0xc0, param_id];
    frame.extend(value.to_le_bytes());
    frame.extend([0x5e, 0x00, 0x00, 0x00]);
    frame
}

pub fn cab_ir_level_frame(db: f32) -> Vec<u8> {
    cab_ir_float_param_frame(0x2d, cab_ir_level_db_to_normalized(db))
}

pub fn cab_ir_high_pass_frame(hz: f32) -> Vec<u8> {
    cab_ir_float_param_frame(0x35, normalized_range(hz, 20.0, 800.0))
}

pub fn cab_ir_low_pass_frame(hz: f32) -> Vec<u8> {
    cab_ir_float_param_frame(0x3d, normalized_range(hz, 1000.0, 20_000.0))
}

/// Frame to set factory Cab/IR microphone and position in live state.
pub fn cab_ir_mic_position_frame(
    cab_name: &str,
    mic_name: &str,
    position: u8,
) -> Result<Vec<u8>, &'static str> {
    let cab_name = cab_name.trim();
    let mic_name = mic_name.trim();
    if cab_name.is_empty() {
        return Err("Cab/IR name cannot be empty");
    }
    if mic_name.is_empty() {
        return Err("Cab/IR mic name cannot be empty");
    }

    let cab_bytes = cab_name.as_bytes();
    let mic_bytes = mic_name.as_bytes();
    let inner_len = 8usize
        .checked_add(cab_bytes.len())
        .and_then(|value| value.checked_add(mic_bytes.len()))
        .ok_or("Cab/IR mic-position frame is too long")?;
    if inner_len > u8::MAX as usize
        || cab_bytes.len() > u8::MAX as usize
        || mic_bytes.len() > u8::MAX as usize
    {
        return Err("Cab/IR mic-position frame is too long");
    }

    let pos_zero = position.clamp(1, 6) - 1;
    let mut body = vec![
        0xc0,
        0x1a,
        inner_len as u8,
        0x08,
        0x00,
        0x12,
        cab_bytes.len() as u8,
    ];
    body.extend(cab_bytes);
    body.extend([0x18, pos_zero, 0x22, mic_bytes.len() as u8]);
    body.extend(mic_bytes);
    body.extend([0x5e, 0x00, 0x00, 0x00]);

    let mut frame = vec![(body.len() - 1) as u8];
    frame.extend(body);
    Ok(frame)
}

/// Candidate frame to write the four footswitch quick-access preset assignments in live state.
/// The shape mirrors the observed assignment readback packet:
/// `LEN C0 08 01 20 <selected> 28 <I-A> 30 <I-B> 38 <II-A> 40 <II-B> 1D 00 00 00`.
pub fn footswitch_assignments_frame(
    selected_preset: u8,
    ia: u8,
    ib: u8,
    iia: u8,
    iib: u8,
) -> Result<Vec<u8>, &'static str> {
    if [selected_preset, ia, ib, iia, iib]
        .iter()
        .any(|value| *value > 63)
    {
        return Err("footswitch assignment presets must be 0-63");
    }

    let mut body = vec![0xc0, 0x08, 0x01, 0x20];
    body.extend(encode_varint(selected_preset as u32));
    body.push(0x28);
    body.extend(encode_varint(ia as u32));
    body.push(0x30);
    body.extend(encode_varint(ib as u32));
    body.push(0x38);
    body.extend(encode_varint(iia as u32));
    body.push(0x40);
    body.extend(encode_varint(iib as u32));
    body.extend([0x1d, 0x00, 0x00, 0x00]);

    let mut frame = vec![(body.len() - 1) as u8];
    frame.extend(body);
    Ok(frame)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn amp_knob_slot_maps_the_five_knobs() {
        assert_eq!(amp_knob_slot("gain"), Some(0));
        assert_eq!(amp_knob_slot("level"), Some(1));
        assert_eq!(amp_knob_slot("bass"), Some(2));
        assert_eq!(amp_knob_slot("mid"), Some(3));
        assert_eq!(amp_knob_slot("treble"), Some(4));
        assert_eq!(amp_knob_slot("bogus"), None);
    }

    #[test]
    fn gain_frame_single_byte_value() {
        // 0A C0 18 00 20 7F 28 00 1A 00 00 00 (len = frame.length - 2 = 10)
        assert_eq!(
            amp_knob_frame(0, 127),
            vec![0x0a, 0xc0, 0x18, 0x00, 0x20, 0x7f, 0x28, 0x00, 0x1a, 0x00, 0x00, 0x00]
        );
    }

    #[test]
    fn gain_frame_two_byte_value_matches_confirmed_template() {
        // 0B C0 18 00 20 C8 01 28 00 1A 00 00 00 — matches the hardware-verified 150-write shape.
        assert_eq!(
            amp_knob_frame(0, 200),
            vec![0x0b, 0xc0, 0x18, 0x00, 0x20, 0xc8, 0x01, 0x28, 0x00, 0x1a, 0x00, 0x00, 0x00]
        );
    }

    #[test]
    fn save_frame_encodes_slot_name_and_length() {
        // Slot 5, name "Amp" (3 bytes): LEN = 3 + 10 = 0x0D.
        assert_eq!(
            save_preset_frame(5, "Amp"),
            vec![
                0x0d, 0xc0, 0x08, 0x01, 0x18, 0x05, 0x2a, 0x03, b'A', b'm', b'p', 0x03, 0x00, 0x00,
                0x00
            ]
        );
    }

    #[test]
    fn save_frame_handles_empty_name() {
        assert_eq!(
            save_preset_frame(0, ""),
            vec![0x0a, 0xc0, 0x08, 0x01, 0x18, 0x00, 0x2a, 0x00, 0x03, 0x00, 0x00, 0x00]
        );
    }

    #[test]
    fn fx_param_frame_encodes_little_endian_float() {
        assert_eq!(
            fx_param_frame(2, 3, 0.5),
            vec![
                0x0f, 0xc0, 0x08, 0x01, 0x18, 0x02, 0x20, 0x03, 0x2d, 0x00, 0x00, 0x00, 0x3f, 0x63,
                0x00, 0x00, 0x00
            ]
        );
    }

    #[test]
    fn fx_param_frame_clamps_non_normalized_values() {
        assert_eq!(&fx_param_frame(0, 0, 2.0)[9..13], &1.0f32.to_le_bytes());
        assert_eq!(&fx_param_frame(0, 0, -1.0)[9..13], &0.0f32.to_le_bytes());
        assert_eq!(
            &fx_param_frame(0, 0, f32::NAN)[9..13],
            &0.0f32.to_le_bytes()
        );
    }

    #[test]
    fn fx_model_frame_encodes_single_byte_model_id() {
        assert_eq!(
            fx_model_frame(1, &[0x1b]).unwrap(),
            vec![0x08, 0xc0, 0x18, 0x01, 0x20, 0x1b, 0x88, 0x00, 0x00, 0x00]
        );
    }

    #[test]
    fn fx_model_frame_encodes_three_byte_model_id() {
        assert_eq!(
            fx_model_frame(0, &[0xd1, 0x8c, 0x01]).unwrap(),
            vec![0x0a, 0xc0, 0x18, 0x00, 0x20, 0xd1, 0x8c, 0x01, 0x88, 0x00, 0x00, 0x00]
        );
    }

    #[test]
    fn fx_model_frame_rejects_empty_model_id() {
        assert_eq!(fx_model_frame(0, &[]), Err("FX model id must be 1-4 bytes"));
    }

    #[test]
    fn capture_slot_frame_encodes_live_selector() {
        assert_eq!(
            capture_slot_frame(3).unwrap(),
            vec![0x08, 0xc0, 0x18, 0x04, 0x20, 0x02, 0x1c, 0x00, 0x00, 0x00]
        );
        assert_eq!(
            capture_slot_frame(16).unwrap(),
            vec![0x08, 0xc0, 0x18, 0x04, 0x20, 0x0f, 0x1c, 0x00, 0x00, 0x00]
        );
        assert_eq!(
            capture_slot_frame(25).unwrap(),
            vec![0x08, 0xc0, 0x18, 0x04, 0x20, 0x18, 0x1c, 0x00, 0x00, 0x00]
        );
        // Bypass keeps the `18 01` selector with slot 0.
        assert_eq!(
            capture_slot_frame(0).unwrap(),
            vec![0x08, 0xc0, 0x18, 0x01, 0x20, 0x00, 0x1c, 0x00, 0x00, 0x00]
        );
        assert_eq!(capture_slot_frame(26), Err("capture slot must be 0-25"));
    }

    #[test]
    fn cab_ir_slot_frame_encodes_live_selector() {
        assert_eq!(
            // Capture change: `18 04` selector with a zero-based index (full 1-25 range).
            cab_ir_slot_frame(5).unwrap(),
            vec![0x08, 0xc0, 0x18, 0x03, 0x20, 0x05, 0x1c, 0x00, 0x00, 0x00]
        );
        assert_eq!(cab_ir_slot_frame(6), Err("Cab/IR slot must be 0-5"));
    }

    #[test]
    fn cab_ir_param_refresh_frame_encodes_slot_minus_one() {
        assert_eq!(
            cab_ir_param_refresh_frame(3).unwrap(),
            vec![0x08, 0xc0, 0x18, 0x00, 0x20, 0x02, 0x5f, 0x00, 0x00, 0x00]
        );
        assert_eq!(
            cab_ir_param_refresh_frame(0),
            Err("Cab/IR refresh slot must be 1-5")
        );
        assert_eq!(
            cab_ir_param_refresh_frame(6),
            Err("Cab/IR refresh slot must be 1-5")
        );
    }

    #[test]
    fn gate_enabled_frame_encodes_on_and_off() {
        assert_eq!(
            gate_enabled_frame(true),
            vec![0x0a, 0xc0, 0x08, 0x01, 0x18, 0x09, 0x20, 0x00, 0x1f, 0x00, 0x00, 0x00]
        );
        assert_eq!(
            gate_enabled_frame(false),
            vec![0x0a, 0xc0, 0x08, 0x01, 0x18, 0x09, 0x20, 0x01, 0x1f, 0x00, 0x00, 0x00]
        );
    }

    #[test]
    fn gate_reduction_frame_offsets_and_varints_percent() {
        assert_eq!(
            gate_reduction_frame(20),
            vec![0x0b, 0xc0, 0x18, 0x0b, 0x20, 0x80, 0x01, 0x28, 0x00, 0x1a, 0x00, 0x00, 0x00]
        );
    }

    #[test]
    fn capture_volume_frame_uses_piecewise_db_curve() {
        assert_eq!(capture_db_to_raw(-24.0), 0);
        assert_eq!(capture_db_to_raw(0.0), 128);
        assert_eq!(capture_db_to_raw(12.0), 255);
        assert_eq!(
            capture_volume_frame(12.0),
            vec![0x0b, 0xc0, 0x18, 0x0a, 0x20, 0xff, 0x01, 0x28, 0x00, 0x1a, 0x00, 0x00, 0x00]
        );
        assert!((capture_raw_to_db(128) - 0.0).abs() < f32::EPSILON);
    }

    #[test]
    fn cab_ir_fixed_float_frames_encode_params() {
        assert_eq!(
            cab_ir_level_frame(-96.0),
            vec![0x09, 0xc0, 0x2d, 0x00, 0x00, 0x00, 0x00, 0x5e, 0x00, 0x00, 0x00]
        );
        assert_eq!(
            cab_ir_high_pass_frame(410.0),
            vec![0x09, 0xc0, 0x35, 0x00, 0x00, 0x00, 0x3f, 0x5e, 0x00, 0x00, 0x00]
        );
        assert_eq!(
            cab_ir_low_pass_frame(10_500.0),
            vec![0x09, 0xc0, 0x3d, 0x00, 0x00, 0x00, 0x3f, 0x5e, 0x00, 0x00, 0x00]
        );
    }

    #[test]
    fn cab_ir_mic_position_frame_embeds_names_and_zero_based_position() {
        let frame = cab_ir_mic_position_frame("110 US PRN C10R", "Dynamic 57", 3).unwrap();
        assert_eq!(frame[0], (frame.len() - 2) as u8);
        assert_eq!(&frame[1..7], &[0xc0, 0x1a, 33, 0x08, 0x00, 0x12]);
        assert!(frame
            .windows("110 US PRN C10R".len())
            .any(|window| window == b"110 US PRN C10R"));
        assert!(frame
            .windows("Dynamic 57".len())
            .any(|window| window == b"Dynamic 57"));
        assert_eq!(frame[23], 0x18);
        assert_eq!(frame[24], 0x02);
    }

    #[test]
    fn footswitch_assignments_frame_matches_observed_readback_shape() {
        assert_eq!(
            footswitch_assignments_frame(7, 3, 7, 10, 16).unwrap(),
            vec![
                0x10, 0xc0, 0x08, 0x01, 0x20, 0x07, 0x28, 0x03, 0x30, 0x07, 0x38, 0x0a, 0x40, 0x10,
                0x1d, 0x00, 0x00, 0x00
            ]
        );
        assert_eq!(
            footswitch_assignments_frame(64, 0, 1, 2, 3),
            Err("footswitch assignment presets must be 0-63")
        );
    }
}
