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
            result = result.replace(&entry.from, &entry.to);
        }
    }
    result
}
