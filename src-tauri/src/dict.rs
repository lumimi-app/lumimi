use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictEntry {
    pub from: String,
    pub to: String,
}

/// Apply all substitution rules in order. Empty `from` entries are skipped.
pub fn apply(text: &str, dict: &[DictEntry]) -> String {
    let mut result = text.to_string();
    for entry in dict {
        if !entry.from.is_empty() {
            result = apply_entry(&result, entry);
        }
    }
    result
}

fn apply_entry(text: &str, entry: &DictEntry) -> String {
    apply_entry_kana_insensitive(text, entry)
}

fn apply_entry_kana_insensitive(text: &str, entry: &DictEntry) -> String {
    let (normalized_text, text_ranges) = normalize_for_lookup(text);
    let (normalized_from, _) = normalize_for_lookup(&entry.from);
    if normalized_from.is_empty() {
        return text.to_string();
    }

    let mut result = String::with_capacity(text.len());
    let mut source_pos = 0;
    let mut search_pos = 0;

    while let Some(relative_start) = normalized_text[search_pos..].find(&normalized_from) {
        let match_start = search_pos + relative_start;
        let match_end = match_start + normalized_from.len();
        let Some(source_start) = source_byte_at_normalized_pos(&text_ranges, match_start) else {
            break;
        };
        let Some(source_end) = source_byte_at_normalized_pos(&text_ranges, match_end) else {
            break;
        };

        result.push_str(&text[source_pos..source_start]);
        result.push_str(&entry.to);
        source_pos = source_end;
        search_pos = match_end;
    }

    if source_pos == 0 {
        return text.to_string();
    }

    result.push_str(&text[source_pos..]);
    result
}

fn source_byte_at_normalized_pos(
    ranges: &[(usize, usize, usize, usize)],
    pos: usize,
) -> Option<usize> {
    if pos == 0 {
        return Some(0);
    }

    for &(norm_start, norm_end, source_start, source_end) in ranges {
        if pos == norm_start {
            return Some(source_start);
        }
        if pos == norm_end {
            return Some(source_end);
        }
    }
    None
}

fn normalize_for_lookup(text: &str) -> (String, Vec<(usize, usize, usize, usize)>) {
    let mut normalized = String::with_capacity(text.len());
    let mut ranges = Vec::new();

    for (source_start, ch) in text.char_indices() {
        let source_end = source_start + ch.len_utf8();
        let mapped = normalize_char_for_lookup(ch);
        let norm_start = normalized.len();
        normalized.push(mapped);
        let norm_end = normalized.len();
        ranges.push((norm_start, norm_end, source_start, source_end));
    }

    (normalized, ranges)
}

fn normalize_char_for_lookup(ch: char) -> char {
    match ch {
        '\u{3041}'..='\u{3096}' => char::from_u32(ch as u32 + 0x60).unwrap_or(ch),
        _ => ch.to_ascii_lowercase(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(from: &str, to: &str) -> DictEntry {
        DictEntry {
            from: from.to_string(),
            to: to.to_string(),
        }
    }

    #[test]
    fn applies_exact_substitution() {
        assert_eq!(
            apply("るみみです", &[entry("るみみ", "Lumimi")]),
            "Lumimiです"
        );
    }

    #[test]
    fn applies_hiragana_entry_to_katakana_subtitle_text() {
        assert_eq!(
            apply("これはマブカットです", &[entry("まぶかっと", "マブガッド")]),
            "これはマブガッドです"
        );
    }

    #[test]
    fn applies_katakana_entry_to_hiragana_subtitle_text() {
        assert_eq!(
            apply("これはまぶかっとです", &[entry("マブカット", "マブガッド")]),
            "これはマブガッドです"
        );
    }
}
