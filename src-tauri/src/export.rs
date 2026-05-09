use crate::transcribe::Segment;
use std::fmt::Write as FmtWrite;

fn srt_time(secs: f64) -> String {
    let total_ms = (secs * 1000.0).round() as u64;
    let ms = total_ms % 1000;
    let s = (total_ms / 1000) % 60;
    let m = (total_ms / 60000) % 60;
    let h = total_ms / 3600000;
    format!("{:02}:{:02}:{:02},{:03}", h, m, s, ms)
}

fn vtt_time(secs: f64) -> String {
    let total_ms = (secs * 1000.0).round() as u64;
    let ms = total_ms % 1000;
    let s = (total_ms / 1000) % 60;
    let m = (total_ms / 60000) % 60;
    let h = total_ms / 3600000;
    format!("{:02}:{:02}:{:02}.{:03}", h, m, s, ms)
}

fn overlap_seconds(a: &Segment, b: &Segment) -> f64 {
    a.end.min(b.end) - a.start.max(b.start)
}

fn matching_translation_text(
    index: usize,
    segment: &Segment,
    translations: Option<&[Segment]>,
) -> Option<String> {
    let translations = translations?;
    let text = translations
        .iter()
        .filter(|candidate| overlap_seconds(segment, candidate) > 0.0)
        .map(|candidate| candidate.text.trim())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    if !text.is_empty() {
        return Some(text);
    }

    translations
        .get(index)
        .map(|segment| segment.text.trim())
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

fn export_text(index: usize, segment: &Segment, translations: Option<&[Segment]>) -> String {
    let primary = segment.text.trim();
    match matching_translation_text(index, segment, translations) {
        Some(translation) => format!("{primary}\n{translation}"),
        None => primary.to_string(),
    }
}

pub fn write_srt_with_translation(
    segments: &[Segment],
    translations: Option<&[Segment]>,
    output_path: &str,
) -> anyhow::Result<()> {
    let mut out = String::new();
    for (i, seg) in segments.iter().enumerate() {
        writeln!(out, "{}", i + 1)?;
        writeln!(out, "{} --> {}", srt_time(seg.start), srt_time(seg.end))?;
        writeln!(out, "{}", export_text(i, seg, translations))?;
        writeln!(out)?;
    }
    std::fs::write(output_path, out)?;
    Ok(())
}

pub fn write_vtt_with_translation(
    segments: &[Segment],
    translations: Option<&[Segment]>,
    output_path: &str,
) -> anyhow::Result<()> {
    let mut out = String::from("WEBVTT\n\n");
    for (i, seg) in segments.iter().enumerate() {
        writeln!(out, "{} --> {}", vtt_time(seg.start), vtt_time(seg.end))?;
        writeln!(out, "{}", export_text(i, seg, translations))?;
        writeln!(out)?;
    }
    std::fs::write(output_path, out)?;
    Ok(())
}

pub fn write_txt_with_translation(
    segments: &[Segment],
    translations: Option<&[Segment]>,
    output_path: &str,
) -> anyhow::Result<()> {
    let text = segments
        .iter()
        .enumerate()
        .map(|(i, s)| export_text(i, s, translations))
        .collect::<Vec<_>>()
        .join("\n\n");
    std::fs::write(output_path, text)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn segment(start: f64, end: f64, text: &str) -> Segment {
        Segment {
            start,
            end,
            text: text.to_string(),
            tokens: vec![],
        }
    }

    #[test]
    fn export_text_includes_overlapping_translation() {
        let original = segment(1.0, 3.0, "こんにちは");
        let translations = vec![segment(1.5, 2.5, "Hello")];

        assert_eq!(
            export_text(0, &original, Some(&translations)),
            "こんにちは\nHello"
        );
    }

    #[test]
    fn export_text_falls_back_to_translation_index() {
        let original = segment(10.0, 11.0, "ありがとう");
        let translations = vec![segment(1.0, 2.0, "Thank you")];

        assert_eq!(
            export_text(0, &original, Some(&translations)),
            "ありがとう\nThank you"
        );
    }

    #[test]
    fn export_text_keeps_primary_when_translation_missing() {
        let original = segment(1.0, 3.0, "字幕");

        assert_eq!(export_text(0, &original, None), "字幕");
    }
}
