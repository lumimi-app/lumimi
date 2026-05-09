mod audio;
mod dict;
mod export;
mod render;
mod settings;
mod subtitle;
mod tokenize;
mod transcribe;

use settings::Settings;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{Emitter, Manager};

struct AppState {
    cancel_generation: Arc<AtomicBool>,
}

#[tauri::command]
async fn generate_subtitles(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    video_path: String,
    settings: Settings,
    output_dir: Option<String>,
    output_filename: Option<String>,
) -> Result<String, String> {
    let cancel = Arc::clone(&state.cancel_generation);
    cancel.store(false, Ordering::Relaxed);
    tauri::async_runtime::spawn_blocking(move || {
        let result = run_pipeline(
            &app,
            &video_path,
            &settings,
            output_dir.as_deref(),
            output_filename.as_deref(),
            cancel,
        );
        if let Err(err) = &result {
            if err.to_string() != "Generation cancelled" {
                append_support_log(&app, "generate_subtitles", &err.to_string());
            }
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
fn cancel_generation(state: tauri::State<'_, AppState>) {
    state.cancel_generation.store(true, Ordering::Relaxed);
}

fn emit(app: &tauri::AppHandle, step: &str, progress: f64) {
    let _ = app.emit(
        "progress",
        serde_json::json!({ "step": step, "progress": progress }),
    );
}

fn support_log_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
        .join("lumimi-support.log")
}

fn sanitize_support_log_message(message: &str) -> String {
    let mut sanitized = message.replace("\r\n", "\n");

    for var_name in ["USERPROFILE", "HOME"] {
        if let Some(home) = std::env::var_os(var_name) {
            let home = PathBuf::from(home).to_string_lossy().to_string();
            if !home.is_empty() {
                sanitized = sanitized.replace(&home, "%USERPROFILE%");
                sanitized = sanitized.replace(&home.replace('\\', "/"), "%USERPROFILE%");
            }
        }
    }

    if let Ok(current_dir) = std::env::current_dir() {
        let current_dir = current_dir.to_string_lossy().to_string();
        if !current_dir.is_empty() {
            sanitized = sanitized.replace(&current_dir, "<app-dir>");
            sanitized = sanitized.replace(&current_dir.replace('\\', "/"), "<app-dir>");
        }
    }

    const MAX_LOG_MESSAGE_LEN: usize = 8_000;
    if sanitized.len() > MAX_LOG_MESSAGE_LEN {
        sanitized.truncate(MAX_LOG_MESSAGE_LEN);
        sanitized.push_str("\n... truncated ...");
    }

    sanitized
}

fn append_support_log(app: &tauri::AppHandle, kind: &str, message: &str) {
    let path = support_log_path(app);
    if let Some(parent) = path.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            return;
        }
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let sanitized = sanitize_support_log_message(message);

    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(file, "[{}] {}", timestamp, kind);
        let _ = writeln!(file, "{}", sanitized);
        let _ = writeln!(file);
    }
}

fn run_pipeline(
    app: &tauri::AppHandle,
    video_path: &str,
    settings: &Settings,
    output_dir: Option<&str>,
    output_filename: Option<&str>,
    cancel: Arc<AtomicBool>,
) -> anyhow::Result<String> {
    check_cancelled(&cancel)?;
    let vp = Path::new(video_path);
    let stem = vp
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let video_dir = vp.parent().unwrap_or(Path::new("."));

    let temp_dir = video_dir.join("temp");
    let out_dir = output_dir
        .map(PathBuf::from)
        .unwrap_or_else(|| video_dir.join("output"));
    std::fs::create_dir_all(&temp_dir)?;
    std::fs::create_dir_all(&out_dir)?;

    let ass_path = temp_dir.join(format!("{}.ass", stem));
    let default_name = format!("{}_subtitled", stem);
    let out_name = output_filename.unwrap_or(&default_name);
    let ext = match settings.output_format.as_str() {
        "mkv" => "mkv",
        "mov" => "mov",
        "webm" => "webm",
        _ => "mp4",
    };
    let output_path = out_dir.join(format!("{}.{}", out_name, ext));

    let model_path = resolve_resource_path(app, &settings.model_path);
    let ffmpeg_path = resolve_resource_path(app, "bin/ffmpeg.exe");
    let fonts_dir = resolve_resource_dir(app, "fonts");
    let video_info = detect_video_info(video_path, &ffmpeg_path).ok();

    eprintln!("[DIAG] model_path={}", model_path);
    eprintln!("[DIAG] ffmpeg_path={}", ffmpeg_path);

    emit(app, "audio", 0.10);
    let samples = audio::extract_samples(video_path, &ffmpeg_path, Arc::clone(&cancel))?;
    check_cancelled(&cancel)?;
    eprintln!(
        "[DIAG] samples.len()={} ({:.1}s audio)",
        samples.len(),
        samples.len() as f64 / 16000.0
    );

    emit(app, "transcribe", 0.30);
    let (raw_segments, detected_lang, translation_segments) = if settings.bilingual {
        let (orig, lang, trans) = transcribe::run_bilingual(
            &samples,
            &model_path,
            &settings.initial_prompt,
            &settings.language,
            Arc::clone(&cancel),
        )?;
        emit(app, "translate", 0.55);
        (orig, lang, Some(trans))
    } else {
        let (orig, lang) = transcribe::run(
            &samples,
            &model_path,
            &settings.initial_prompt,
            &settings.language,
            Arc::clone(&cancel),
        )?;
        (orig, lang, None)
    };
    check_cancelled(&cancel)?;

    // Apply user-defined dictionary substitutions before tokenization.
    let dict_entries = load_dict_entries(app);
    let raw_segments: Vec<_> = if dict_entries.is_empty() {
        raw_segments
    } else {
        raw_segments
            .into_iter()
            .map(|mut seg| {
                seg.text = dict::apply(&seg.text, &dict_entries);
                for tok in &mut seg.tokens {
                    tok.text = dict::apply(&tok.text, &dict_entries);
                }
                seg
            })
            .collect()
    };

    let require_video = settings.output_type == "video" || settings.output_type == "both";
    let require_subtitle = settings.output_type == "subtitle" || settings.output_type == "both";

    // Export subtitle files (SRT/VTT/TXT) from segment-level Whisper output.
    if require_subtitle {
        for fmt in &settings.subtitle_formats {
            check_cancelled(&cancel)?;
            let sub_path = out_dir.join(format!("{}.{}", out_name, fmt));
            match fmt.as_str() {
                "srt" => export::write_srt(&raw_segments, &sub_path.to_string_lossy())?,
                "vtt" => export::write_vtt(&raw_segments, &sub_path.to_string_lossy())?,
                "txt" => export::write_txt(&raw_segments, &sub_path.to_string_lossy())?,
                _ => {}
            }
        }
    }

    if !require_video {
        emit(app, "done", 1.00);
        return Ok(out_dir.to_string_lossy().to_string());
    }

    emit(app, "subtitle", 0.75);
    check_cancelled(&cancel)?;
    let use_lindera = detected_lang == "ja";
    let segments: Vec<_> = raw_segments
        .iter()
        .map(|seg| {
            let words = if use_lindera {
                tokenize::merge_segment(seg).unwrap_or_else(|_| {
                    vec![tokenize::Word {
                        text: seg.text.clone(),
                        start: seg.start,
                        end: seg.end,
                    }]
                })
            } else {
                // For non-Japanese, use Whisper's token timestamps directly.
                // Whisper tokens often have a leading space; strip it.
                let words: Vec<_> = seg
                    .tokens
                    .iter()
                    .filter(|t| !t.text.trim().is_empty())
                    .map(|t| tokenize::Word {
                        text: t.text.trim_start().to_string(),
                        start: t.start,
                        end: t.end,
                    })
                    .collect();
                if words.is_empty() {
                    vec![tokenize::Word {
                        text: seg.text.clone(),
                        start: seg.start,
                        end: seg.end,
                    }]
                } else {
                    words
                }
            };
            (seg.clone(), words)
        })
        .collect();

    let subtitle_settings = adjusted_subtitle_settings(settings, video_info.as_ref());
    subtitle::generate(
        &segments,
        &ass_path.to_string_lossy(),
        &subtitle_settings,
        translation_segments.as_deref(),
    )?;

    emit(app, "render", 0.90);
    check_cancelled(&cancel)?;
    render::run(
        video_path,
        &ass_path.to_string_lossy(),
        &output_path.to_string_lossy(),
        &ffmpeg_path,
        fonts_dir.as_deref(),
        &settings.output_format,
        Arc::clone(&cancel),
    )?;

    emit(app, "done", 1.00);
    Ok(output_path.to_string_lossy().to_string())
}

fn check_cancelled(cancel: &AtomicBool) -> anyhow::Result<()> {
    if cancel.load(Ordering::Relaxed) {
        anyhow::bail!("Generation cancelled");
    }
    Ok(())
}

#[derive(Debug)]
struct VideoInfo {
    width: u32,
    height: u32,
    rotation_degrees: i32,
}

impl VideoInfo {
    fn is_portrait(&self) -> bool {
        let rotated = self.rotation_degrees.rem_euclid(180) != 0;
        if rotated {
            self.width > self.height
        } else {
            self.height > self.width
        }
    }
}

fn adjusted_subtitle_settings(settings: &Settings, video_info: Option<&VideoInfo>) -> Settings {
    let mut adjusted = settings.clone();
    let stacking_mode = settings.stacking || settings.display_mode == "stacking";
    let manual_position = settings.position_mode == "manual";

    // The ASS filter operates on the decoded frame. For rotation-metadata videos FFmpeg
    // auto-rotates before the filter, so display dims = storage dims swapped. For native
    // portrait (no rotation tag) display dims = storage dims as-is. In both cases the
    // PlayRes orientation must match the video's display orientation, otherwise the
    // coordinate space is 90° off and vertical text appears tilted.
    if let Some(info) = video_info {
        let rotated_90 = info.rotation_degrees.rem_euclid(180) != 0;
        let (display_w, display_h) = if rotated_90 {
            (info.height, info.width)
        } else {
            (info.width, info.height)
        };
        let play_is_portrait = adjusted.play_res_y > adjusted.play_res_x;
        let video_is_portrait = display_h > display_w;
        if play_is_portrait != video_is_portrait {
            std::mem::swap(&mut adjusted.play_res_x, &mut adjusted.play_res_y);
        }
    }

    if !manual_position
        && video_info.is_some_and(VideoInfo::is_portrait)
        && !settings.vertical
        && !stacking_mode
    {
        let portrait_safe_margin = adjusted.play_res_y / 3 + adjusted.play_res_y / 48;
        adjusted.margin_v = adjusted.margin_v.max(portrait_safe_margin);
    }
    if !manual_position && video_info.is_some_and(VideoInfo::is_portrait) && settings.vertical {
        adjusted.margin_v = adjusted.play_res_y / 2;
    }
    adjusted
}

fn detect_video_info(video_path: &str, ffmpeg_path: &str) -> anyhow::Result<VideoInfo> {
    let output = std::process::Command::new(ffmpeg_path)
        .args(["-hide_banner", "-i", video_path])
        .output()?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    parse_ffmpeg_video_info(&stderr)
        .ok_or_else(|| anyhow::anyhow!("Could not read video dimensions from FFmpeg output"))
}

fn parse_ffmpeg_video_info(output: &str) -> Option<VideoInfo> {
    let mut dimensions = None;
    let mut rotation_degrees = 0;

    for line in output.lines() {
        if dimensions.is_none() && line.contains("Video:") {
            dimensions = parse_video_dimensions(line);
        }
        if let Some(rotation) = parse_rotation_degrees(line) {
            rotation_degrees = rotation;
        }
    }

    dimensions.map(|(width, height)| VideoInfo {
        width,
        height,
        rotation_degrees,
    })
}

fn parse_video_dimensions(line: &str) -> Option<(u32, u32)> {
    line.split(|c: char| !(c.is_ascii_alphanumeric() || c == 'x'))
        .filter_map(|token| token.split_once('x'))
        .find_map(|(w, h)| {
            let width = w.parse::<u32>().ok()?;
            let height = h.parse::<u32>().ok()?;
            if width >= 16 && height >= 16 {
                Some((width, height))
            } else {
                None
            }
        })
}

fn parse_rotation_degrees(line: &str) -> Option<i32> {
    let rotation = line.split("rotation of ").nth(1)?;
    let degrees = rotation.split_whitespace().next()?;
    degrees
        .trim_end_matches("degrees")
        .parse::<f64>()
        .ok()
        .map(|v| v.round() as i32)
}

fn resolve_resource_dir(app: &tauri::AppHandle, dir_name: &str) -> Option<String> {
    let mut bases: Vec<PathBuf> = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        bases.push(resource_dir);
    }
    if let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
    {
        bases.push(exe_dir);
    }
    if let Ok(current_dir) = std::env::current_dir() {
        bases.push(current_dir);
    }
    #[cfg(debug_assertions)]
    bases.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")));

    bases
        .iter()
        .map(|base| base.join(dir_name))
        .find(|path| path.is_dir())
        .map(|p| p.to_string_lossy().to_string())
}

fn resolve_resource_path(app: &tauri::AppHandle, configured_path: &str) -> String {
    let configured = Path::new(configured_path);
    if configured.is_absolute() {
        return configured_path.to_string();
    }

    let mut bases: Vec<PathBuf> = Vec::new();
    if let Ok(d) = app.path().app_data_dir() {
        bases.push(d);
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        bases.push(resource_dir);
    }
    if let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
    {
        bases.push(exe_dir);
    }
    if let Ok(current_dir) = std::env::current_dir() {
        bases.push(current_dir);
    }
    #[cfg(debug_assertions)]
    bases.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")));

    bases
        .iter()
        .map(|base| base.join(configured))
        .find(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from(configured_path))
        .to_string_lossy()
        .to_string()
}

#[derive(serde::Serialize)]
struct ModelInfo {
    path: String,
    label: String,
    available: bool,
    url: String,
}

const KNOWN_MODELS: &[(&str, &str, &str)] = &[
    (
        "ggml-medium.bin",
        "標準（高速）",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
    ),
    (
        "ggml-large-v3-turbo.bin",
        "高精度（低速）",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
    ),
];

#[tauri::command]
fn list_models(app: tauri::AppHandle) -> Vec<ModelInfo> {
    let mut bases: Vec<PathBuf> = Vec::new();
    if let Ok(d) = app.path().app_data_dir() {
        bases.push(d);
    }
    if let Ok(d) = app.path().resource_dir() {
        bases.push(d);
    }
    if let Some(d) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
    {
        bases.push(d);
    }
    if let Ok(d) = std::env::current_dir() {
        bases.push(d);
    }
    #[cfg(debug_assertions)]
    bases.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")));

    KNOWN_MODELS
        .iter()
        .map(|(fname, label, url)| {
            let available = bases
                .iter()
                .any(|base| base.join("models").join(fname).exists());
            ModelInfo {
                path: format!("models/{}", fname),
                label: label.to_string(),
                available,
                url: url.to_string(),
            }
        })
        .collect()
}

#[tauri::command]
async fn download_model(
    app: tauri::AppHandle,
    url: String,
    filename: String,
) -> Result<(), String> {
    use futures_util::StreamExt;

    // Save to AppData (user-writable, no admin needed) or fall back to dev dir
    let models_dir = app
        .path()
        .app_data_dir()
        .map(|d| d.join("models"))
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("models"));
    std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;
    let dest = models_dir.join(&filename);

    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let total = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();

    let tmp = dest.with_extension("tmp");
    let mut file = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        std::io::Write::write_all(&mut file, &chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        let progress = if total > 0 {
            downloaded as f64 / total as f64
        } else {
            0.0
        };
        let _ = app.emit(
            "download_progress",
            serde_json::json!({ "progress": progress, "downloaded": downloaded, "total": total }),
        );
    }

    std::fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_fonts(app: tauri::AppHandle) -> Vec<String> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    // Also load bundled fonts so they appear in the list
    if let Some(fonts_dir) = resolve_resource_dir(&app, "fonts") {
        db.load_fonts_dir(fonts_dir);
    }
    let mut families: std::collections::BTreeSet<String> = Default::default();
    for face in db.faces() {
        if let Some((name, _)) = face.families.first() {
            families.insert(name.clone());
        }
    }
    families.into_iter().collect()
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    let folder = if p.is_file() {
        p.parent().unwrap_or(&p).to_path_buf()
    } else {
        p
    };
    std::process::Command::new("explorer")
        .arg(folder)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn dict_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
        .join("dict.json")
}

fn default_dict() -> Vec<dict::DictEntry> {
    vec![dict::DictEntry {
        from: "るみみ".to_string(),
        to: "Lumimi".to_string(),
    }]
}

fn load_dict_entries(app: &tauri::AppHandle) -> Vec<dict::DictEntry> {
    let path = dict_path(app);
    if !path.exists() {
        return default_dict();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(default_dict)
}

#[tauri::command]
fn load_dict(app: tauri::AppHandle) -> Vec<dict::DictEntry> {
    load_dict_entries(&app)
}

#[tauri::command]
fn save_dict(app: tauri::AppHandle, entries: Vec<dict::DictEntry>) -> Result<(), String> {
    let path = dict_path(&app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

fn to_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3f) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 0x3f) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 0x3f) as usize] as char
        } else {
            '='
        });
    }
    out
}

#[tauri::command]
async fn extract_thumbnail(app: tauri::AppHandle, video_path: String) -> Result<String, String> {
    let ffmpeg_path = resolve_resource_path(&app, "bin/ffmpeg.exe");
    let out_path = std::env::temp_dir().join("lumimi_thumb.jpg");
    let out_str = out_path.to_string_lossy().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new(&ffmpeg_path)
            .args([
                "-ss",
                "1",
                "-i",
                &video_path,
                "-vframes",
                "1",
                "-vf",
                "scale=640:-2",
                "-q:v",
                "5",
                "-y",
                &out_str,
            ])
            .stderr(std::process::Stdio::null())
            .output()
            .map_err(|e| e.to_string())?;
        let bytes = std::fs::read(&out_path).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&out_path);
        Ok(format!("data:image/jpeg;base64,{}", to_base64(&bytes)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            cancel_generation: Arc::new(AtomicBool::new(false)),
        })
        .setup(|app| {
            let app_handle = app.handle().clone();
            std::panic::set_hook(Box::new(move |panic_info| {
                append_support_log(&app_handle, "panic", &panic_info.to_string());
            }));
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            generate_subtitles,
            cancel_generation,
            open_folder,
            list_fonts,
            list_models,
            download_model,
            load_dict,
            save_dict,
            extract_thumbnail
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_landscape_video_info() {
        let output = "Stream #0:0: Video: h264, yuv420p, 1920x1080, 30 fps";
        let info = parse_ffmpeg_video_info(output).unwrap();
        assert_eq!(info.width, 1920);
        assert_eq!(info.height, 1080);
        assert!(!info.is_portrait());
    }

    #[test]
    fn treats_rotated_landscape_storage_as_portrait() {
        let output = "\
Stream #0:0: Video: h264, yuv420p, 1920x1080, 30 fps
    displaymatrix: rotation of -90.00 degrees";
        let info = parse_ffmpeg_video_info(output).unwrap();
        assert!(info.is_portrait());
    }

    #[test]
    fn raises_margin_for_portrait_horizontal_subtitles() {
        let settings = Settings::default();
        let info = VideoInfo {
            width: 1080,
            height: 1920,
            rotation_degrees: 0,
        };
        let adjusted = adjusted_subtitle_settings(&settings, Some(&info));
        // play_res is swapped to portrait (1080x1920), so margin uses the swapped play_res_y=1920.
        assert_eq!(adjusted.play_res_x, 1080);
        assert_eq!(adjusted.play_res_y, 1920);
        assert_eq!(
            adjusted.margin_v,
            adjusted.play_res_y / 3 + adjusted.play_res_y / 48
        );
    }

    #[test]
    fn centers_vertical_subtitles_for_portrait_video() {
        let mut settings = Settings::default();
        settings.vertical = true;
        let info = VideoInfo {
            width: 1080,
            height: 1920,
            rotation_degrees: 0,
        };
        let adjusted = adjusted_subtitle_settings(&settings, Some(&info));
        // play_res is swapped to portrait (1080x1920), so center = swapped play_res_y/2 = 960.
        assert_eq!(adjusted.play_res_y, 1920);
        assert_eq!(adjusted.margin_v, adjusted.play_res_y / 2);
    }

    #[test]
    fn keeps_manual_position_for_portrait_video() {
        let mut settings = Settings::default();
        settings.position_mode = "manual".to_string();
        settings.margin_v = 30;
        let info = VideoInfo {
            width: 1080,
            height: 1920,
            rotation_degrees: 0,
        };
        let adjusted = adjusted_subtitle_settings(&settings, Some(&info));
        assert_eq!(adjusted.margin_v, 30);
    }

    #[test]
    fn support_log_sanitizes_current_directory() {
        let current_dir = std::env::current_dir().unwrap().to_string_lossy().to_string();
        let message = format!("failed near {}\r\nsecond line", current_dir);
        let sanitized = sanitize_support_log_message(&message);

        assert!(!sanitized.contains(&current_dir));
        assert!(sanitized.contains("<app-dir>") || sanitized.contains("%USERPROFILE%"));
        assert!(!sanitized.contains("\r\n"));
    }
}
