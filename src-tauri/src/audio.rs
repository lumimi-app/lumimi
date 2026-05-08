use anyhow::{Context, Result};
use std::process::Command;

/// Extract audio from video as raw f32le PCM at 16kHz mono.
/// Returns Vec<f32> samples ready for whisper.
pub fn extract_samples(video_path: &str, ffmpeg_path: &str) -> Result<Vec<f32>> {
    let output = Command::new(ffmpeg_path)
        .args([
            "-y",
            "-i",
            video_path,
            "-ar",
            "16000",
            "-ac",
            "1",
            "-f",
            "f32le",
            "-acodec",
            "pcm_f32le",
            "pipe:1",
        ])
        .output()
        .with_context(|| format!("FFmpeg not found at '{}'. Put ffmpeg.exe in src-tauri/bin or add FFmpeg to PATH.", ffmpeg_path))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("FFmpeg audio extraction failed:\n{}", stderr);
    }

    let samples: Vec<f32> = output
        .stdout
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect();

    Ok(samples)
}
