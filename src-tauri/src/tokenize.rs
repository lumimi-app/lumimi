use anyhow::Result;
use lindera::{
    dictionary::load_dictionary, mode::Mode, segmenter::Segmenter, tokenizer::Tokenizer,
};

use crate::transcribe::{Segment, Token};

const MERGE_SUFFIXES: &[&str] = &[
    // Particles
    "が",
    "を",
    "に",
    "へ",
    "と",
    "で",
    "の",
    "は",
    "も",
    "か",
    "や",
    "から",
    "まで",
    "より",
    "ね",
    "よ",
    "な",
    "わ",
    // Auxiliary verb endings
    "て",
    "い",
    "る",
    "た",
    "だ",
    "です",
    "ます",
    "ません",
    "ました",
    "でした",
    "ない",
    "でき",
    // Contracted ている／ていた forms (Lindera may emit these as single morphemes)
    "てる",
    "てた",
    "てて",
    "でる",
    "でた",
    // Passive / potential auxiliary (れる・られる and conjugated forms)
    "れ",
    "れる",
    "れた",
    "られ",
    "られる",
    "られた",
    // Polite request
    "ください",
    "下さい",
];

/// Returns true if every character in `s` is punctuation or a symbol.
/// Used to attach stray punctuation to the preceding word.
fn is_symbol_only(s: &str) -> bool {
    !s.is_empty()
        && s.chars().all(|c| {
            matches!(c,
                // ASCII punctuation
                '\u{0021}'..='\u{002F}'
                | '\u{003A}'..='\u{0040}'
                | '\u{005B}'..='\u{0060}'
                | '\u{007B}'..='\u{007E}'
                // CJK Symbols and Punctuation (、。…〜 etc.)
                | '\u{3000}'..='\u{303F}'
                // Halfwidth and Fullwidth Forms (！？ etc.)
                | '\u{FF00}'..='\u{FFEF}'
            )
        })
}

#[derive(Debug, Clone)]
pub struct Word {
    pub text: String,
    pub start: f64,
    pub end: f64,
}

/// Build character-level timeline from whisper tokens.
/// Each character gets an even share of its token's time span.
fn build_char_times(tokens: &[Token]) -> Vec<(char, f64, f64)> {
    let mut result = Vec::new();
    for tok in tokens {
        let chars: Vec<char> = tok.text.chars().collect();
        let n = chars.len();
        if n == 0 {
            continue;
        }
        let dt = (tok.end - tok.start) / n as f64;
        for (i, c) in chars.iter().enumerate() {
            let t0 = tok.start + i as f64 * dt;
            let t1 = tok.start + (i + 1) as f64 * dt;
            result.push((*c, t0, t1));
        }
    }
    result
}

fn post_merge(words: Vec<Word>) -> Vec<Word> {
    if words.is_empty() {
        return words;
    }
    let mut result = vec![words[0].clone()];
    for w in words.into_iter().skip(1) {
        if MERGE_SUFFIXES.contains(&w.text.as_str()) || is_symbol_only(&w.text) {
            let last = result.last_mut().unwrap();
            last.text.push_str(&w.text);
            last.end = w.end;
        } else {
            result.push(w);
        }
    }
    result
}

fn make_tokenizer() -> Result<Tokenizer> {
    let dictionary = load_dictionary("embedded://ipadic")
        .map_err(|e| anyhow::anyhow!("Failed to load IPADIC dictionary: {}", e))?;
    let segmenter = Segmenter::new(Mode::Normal, dictionary, None);
    Ok(Tokenizer::new(segmenter))
}

pub fn merge_segment(seg: &Segment) -> Result<Vec<Word>> {
    if seg.tokens.is_empty() {
        return Ok(vec![Word {
            text: seg.text.clone(),
            start: seg.start,
            end: seg.end,
        }]);
    }

    let char_times = build_char_times(&seg.tokens);
    let tokenizer = make_tokenizer()?;
    let mut morphemes = tokenizer
        .tokenize(&seg.text)
        .map_err(|e| anyhow::anyhow!("Tokenization failed: {}", e))?;

    let mut words = Vec::new();
    let mut char_idx = 0usize;

    for morpheme in morphemes.iter_mut() {
        let text = morpheme.surface.as_ref().to_string();
        let n = text.chars().count();
        if n == 0 {
            continue;
        }

        let start = char_times.get(char_idx).map(|c| c.1).unwrap_or(seg.start);
        let end = char_times
            .get((char_idx + n).saturating_sub(1))
            .map(|c| c.2)
            .unwrap_or(seg.end);

        words.push(Word { text, start, end });
        char_idx += n;
    }

    if words.is_empty() {
        return Ok(vec![Word {
            text: seg.text.clone(),
            start: seg.start,
            end: seg.end,
        }]);
    }

    Ok(post_merge(words))
}
