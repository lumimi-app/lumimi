use anyhow::{Context, Result};
use std::process::{Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;

/// Extract audio from video as raw f32le PCM at 16kHz mono.
/// Returns Vec<f32> samples ready for whisper.
pub fn extract_samples(
    video_path: &str,
    ffmpeg_path: &str,
    cancel: Arc<AtomicBool>,
) -> Result<Vec<f32>> {
    let mut child = Command::new(ffmpeg_path)
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
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| {
            format!(
                "FFmpeg not found at '{}'. Put ffmpeg.exe in src-tauri/bin or add FFmpeg to PATH.",
                ffmpeg_path
            )
        })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut stdout) = stdout {
            let _ = std::io::Read::read_to_end(&mut stdout, &mut buf);
        }
        buf
    });
    let stderr_reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut stderr) = stderr {
            let _ = std::io::Read::read_to_end(&mut stderr, &mut buf);
        }
        buf
    });

    let status = loop {
        if cancel.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            anyhow::bail!("Generation cancelled");
        }
        if let Some(status) = child.try_wait()? {
            break status;
        }
        std::thread::sleep(Duration::from_millis(100));
    };

    let stdout = stdout_reader.join().unwrap_or_default();
    let stderr = stderr_reader.join().unwrap_or_default();

    if !status.success() {
        let stderr = String::from_utf8_lossy(&stderr);
        anyhow::bail!("FFmpeg audio extraction failed:\n{}", stderr);
    }

    let samples: Vec<f32> = stdout
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect();

    Ok(samples)
}
