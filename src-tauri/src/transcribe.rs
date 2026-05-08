use anyhow::{Context, Result};
use whisper_rs::{get_lang_str, FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

fn suppress_whisper_logging() {
    unsafe extern "C" fn silent(
        _level: whisper_rs_sys::ggml_log_level,
        _text: *const std::os::raw::c_char,
        _user_data: *mut std::os::raw::c_void,
    ) {
    }
    unsafe { whisper_rs_sys::whisper_log_set(Some(silent), std::ptr::null_mut()) };
}

#[derive(Debug, Clone)]
pub struct Token {
    pub text: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub tokens: Vec<Token>,
}

fn collect_segments(state: &whisper_rs::WhisperState, include_tokens: bool) -> Vec<Segment> {
    let n_segments = state.full_n_segments();
    let mut segments = Vec::new();

    for seg_idx in 0..n_segments {
        let Some(seg) = state.get_segment(seg_idx) else {
            continue;
        };

        let start = (seg.start_timestamp() as f64 / 100.0).max(0.0);
        let end = (seg.end_timestamp() as f64 / 100.0).max(0.0);

        // Skip zero-duration or inverted segments — they produce invalid ASS timestamps.
        if end <= start {
            continue;
        }

        let text = match seg.to_str_lossy() {
            Ok(s) => s.trim().replace('\n', " "),
            Err(_) => continue,
        };

        if text.is_empty() {
            continue;
        }

        let tokens = if include_tokens {
            let mut toks = Vec::new();
            for tok_idx in 0..seg.n_tokens() {
                let Some(tok) = seg.get_token(tok_idx) else { continue };
                let tok_text = match tok.to_str_lossy() {
                    Ok(s) => s.to_string(),
                    Err(_) => continue,
                };
                if tok_text.starts_with("[_") || tok_text.starts_with("<|") {
                    continue;
                }
                let data = tok.token_data();
                let t0 = data.t0.max(0) as f64 / 100.0;
                let t1 = data.t1.max(0) as f64 / 100.0;
                if !tok_text.trim().is_empty() {
                    toks.push(Token { text: tok_text, start: t0, end: t1 });
                }
            }
            toks
        } else {
            vec![]
        };

        segments.push(Segment { start, end, text, tokens });
    }

    segments
}

/// Returns `(segments, detected_language)`.
pub fn run(samples: &[f32], model_path: &str, initial_prompt: &str, language: &str) -> Result<(Vec<Segment>, String)> {
    suppress_whisper_logging();

    let ctx = WhisperContext::new_with_params(model_path, WhisperContextParameters::default())
        .context("Failed to load whisper model. Make sure the model file exists at the configured path.")?;

    let mut state = ctx.create_state().context("Failed to create whisper state")?;

    let n_threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).min(8) as i32;
    eprintln!("[DIAG] n_threads={}", n_threads);

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(n_threads);
    let lang_opt = if language == "auto" { None } else { Some(language) };
    params.set_language(lang_opt);
    params.set_token_timestamps(true);
    params.set_print_realtime(false);
    params.set_print_progress(false);
    if !initial_prompt.is_empty() {
        params.set_initial_prompt(initial_prompt);
    }

    let t0 = std::time::Instant::now();
    state.full(params, samples).context("Whisper transcription failed")?;
    eprintln!("[DIAG] whisper inference took {:.1}s", t0.elapsed().as_secs_f64());

    let detected_lang = get_lang_str(state.full_lang_id_from_state())
        .unwrap_or(language)
        .to_string();

    let segments = collect_segments(&state, true);
    Ok((segments, detected_lang))
}

/// Runs transcription then translation, each with its own model context to avoid
/// shared encoder-cache interference between the two passes.
/// Returns `(orig_segments, detected_language, translation_segments)`.
/// Translation is always English regardless of source language.
pub fn run_bilingual(samples: &[f32], model_path: &str, initial_prompt: &str, language: &str) -> Result<(Vec<Segment>, String, Vec<Segment>)> {
    suppress_whisper_logging();

    // Pass 1: transcribe — dedicated context
    let (orig_segments, detected_lang) = {
        let ctx = WhisperContext::new_with_params(model_path, WhisperContextParameters::default())
            .context("Failed to load whisper model.")?;
        let mut state = ctx.create_state().context("Failed to create whisper state")?;
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        let lang_opt = if language == "auto" { None } else { Some(language) };
        params.set_language(lang_opt);
        params.set_token_timestamps(true);
        params.set_print_realtime(false);
        params.set_print_progress(false);
        if !initial_prompt.is_empty() {
            params.set_initial_prompt(initial_prompt);
        }
        state.full(params, samples).context("Whisper transcription failed")?;
        let lang = get_lang_str(state.full_lang_id_from_state())
            .unwrap_or(language)
            .to_string();
        let segs = collect_segments(&state, true);
        (segs, lang)
    };

    // Pass 2: translate — separate context; use detected_lang so Whisper knows
    // the source language without re-detecting, reducing the risk of early exit.
    let trans_segments = {
        let ctx = WhisperContext::new_with_params(model_path, WhisperContextParameters::default())
            .context("Failed to load whisper model.")?;
        let mut state = ctx.create_state().context("Failed to create whisper state")?;
        // BeamSearch avoids the premature cutoff that Greedy had in translate mode.
        let mut params = FullParams::new(SamplingStrategy::BeamSearch { beam_size: 5, patience: 1.0 });
        params.set_language(Some(detected_lang.as_str()));
        params.set_translate(true);
        params.set_token_timestamps(true);
        params.set_print_realtime(false);
        params.set_print_progress(false);
        if !initial_prompt.is_empty() {
            params.set_initial_prompt(initial_prompt);
        }
        state.full(params, samples).context("Whisper translation failed")?;
        collect_segments(&state, true)
    };

    Ok((orig_segments, detected_lang, trans_segments))
}
