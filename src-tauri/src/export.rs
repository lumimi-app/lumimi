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

pub fn write_srt(segments: &[Segment], output_path: &str) -> anyhow::Result<()> {
    let mut out = String::new();
    for (i, seg) in segments.iter().enumerate() {
        writeln!(out, "{}", i + 1)?;
        writeln!(out, "{} --> {}", srt_time(seg.start), srt_time(seg.end))?;
        writeln!(out, "{}", seg.text.trim())?;
        writeln!(out)?;
    }
    std::fs::write(output_path, out)?;
    Ok(())
}

pub fn write_vtt(segments: &[Segment], output_path: &str) -> anyhow::Result<()> {
    let mut out = String::from("WEBVTT\n\n");
    for seg in segments {
        writeln!(out, "{} --> {}", vtt_time(seg.start), vtt_time(seg.end))?;
        writeln!(out, "{}", seg.text.trim())?;
        writeln!(out)?;
    }
    std::fs::write(output_path, out)?;
    Ok(())
}

pub fn write_txt(segments: &[Segment], output_path: &str) -> anyhow::Result<()> {
    let text = segments
        .iter()
        .map(|s| s.text.trim())
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(output_path, text)?;
    Ok(())
}
