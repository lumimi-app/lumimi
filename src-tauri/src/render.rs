use anyhow::{Context, Result};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;

pub fn run(
    video_path: &str,
    ass_path: &str,
    output_path: &str,
    ffmpeg_path: &str,
    fonts_dir: Option<&str>,
    output_format: &str,
    cancel: Arc<AtomicBool>,
) -> Result<()> {
    let ass_p = Path::new(ass_path);
    let ass_dir = ass_p
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Cannot get parent dir of: {}", ass_path))?;
    let ass_filename = ass_p
        .file_name()
        .ok_or_else(|| anyhow::anyhow!("Cannot get filename from: {}", ass_path))?
        .to_string_lossy();

    // Copy fonts to a sibling dir of the ASS file and use a relative path.
    // FFmpeg's filter option parser doesn't reliably handle colons in Windows
    // drive letters (e.g. "C:") even when backslash-escaped, so we avoid
    // absolute paths entirely by working relative to current_dir (ass_dir).
    let vf = if let Some(dir) = fonts_dir {
        let fonts_subdir = ass_dir.join("lumi_fonts");
        let _ = std::fs::create_dir_all(&fonts_subdir);
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if entry.path().is_file() {
                    let _ = std::fs::copy(entry.path(), fonts_subdir.join(entry.file_name()));
                }
            }
        }
        format!("ass={}:fontsdir=lumi_fonts", ass_filename)
    } else {
        format!("ass={}", ass_filename)
    };

    let (audio_codec, extra_args): (&str, &[&str]) = if output_format == "webm" {
        (
            "libopus",
            &["-c:v", "libvpx-vp9", "-crf", "33", "-b:v", "0"],
        )
    } else {
        ("aac", &[])
    };

    let mut args = vec!["-y", "-i", video_path, "-vf", &vf];
    args.extend_from_slice(extra_args);
    args.extend_from_slice(&["-c:a", audio_codec, output_path]);

    let mut child = Command::new(ffmpeg_path)
        .current_dir(ass_dir)
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| {
            format!(
                "FFmpeg not found at '{}'. Put ffmpeg.exe in src-tauri/bin or add FFmpeg to PATH.",
                ffmpeg_path
            )
        })?;

    let stderr = child.stderr.take();
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
            let _ = stderr_reader.join();
            let _ = std::fs::remove_file(output_path);
            anyhow::bail!("Generation cancelled");
        }
        if let Some(status) = child.try_wait()? {
            break status;
        }
        std::thread::sleep(Duration::from_millis(100));
    };

    let stderr_bytes = stderr_reader.join().unwrap_or_default();

    if !status.success() {
        let stderr = String::from_utf8_lossy(&stderr_bytes);
        let relevant: Vec<&str> = stderr
            .lines()
            .filter(|l| {
                !l.starts_with("ffmpeg version")
                    && !l.starts_with("built with")
                    && !l.starts_with("configuration:")
                    && !l.starts_with("  lib")
                    && !l.trim().is_empty()
            })
            .collect();
        let msg = if relevant.is_empty() {
            stderr.lines().last().unwrap_or("unknown error").to_string()
        } else {
            relevant
                .iter()
                .rev()
                .take(5)
                .rev()
                .cloned()
                .collect::<Vec<_>>()
                .join("\n")
        };
        anyhow::bail!("FFmpeg render failed:\n{}", msg);
    }

    Ok(())
}
