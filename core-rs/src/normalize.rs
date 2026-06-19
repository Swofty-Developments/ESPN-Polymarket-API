//! Text normalization and order-independent team matching.
//!
//! These functions are part of the cross-language contract — see `docs/architecture.md`.

use unicode_normalization::UnicodeNormalization;

const STOPWORDS: &[&str] = &["and", "the", "of", "fc", "sc", "afc", "cf"];

/// NFD-normalize, strip combining marks, lowercase, and collapse any run of
/// non-`[a-z0-9]` characters into a single space.
pub fn normalize(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_space = true;
    for ch in s.nfd() {
        let cp = ch as u32;
        if (0x300..=0x36F).contains(&cp) {
            continue;
        }
        let lower = ch.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() {
            out.push(lower);
            prev_space = false;
        } else if ch.is_ascii() {
            if !prev_space {
                out.push(' ');
                prev_space = true;
            }
        } else {
            // Non-ASCII letters that survived decomposition (e.g. ß, ø) are treated as
            // separators after lowercasing fails — collapse to a space for determinism.
            if !prev_space {
                out.push(' ');
                prev_space = true;
            }
        }
    }
    if out.ends_with(' ') {
        out.pop();
    }
    out
}

/// Split into non-empty whitespace tokens of the normalized string.
pub fn tokens(s: &str) -> Vec<String> {
    normalize(s)
        .split(' ')
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect()
}

/// Tokens with stopwords removed; falls back to all tokens if removal empties the set.
pub fn content_tokens(s: &str) -> Vec<String> {
    let all = tokens(s);
    let filtered: Vec<String> = all
        .iter()
        .filter(|t| !STOPWORDS.contains(&t.as_str()))
        .cloned()
        .collect();
    if filtered.is_empty() {
        all
    } else {
        filtered
    }
}

fn is_subset(a: &[String], b: &[String]) -> bool {
    !a.is_empty() && a.iter().all(|t| b.contains(t))
}

/// True if `text` refers to the same entity as one of `names` (order-independent token subset).
pub fn team_matches(names: &[String], text: &str) -> bool {
    let p = content_tokens(text);
    if p.is_empty() {
        return false;
    }
    for n in names {
        let c = content_tokens(n);
        if c.is_empty() {
            continue;
        }
        if is_subset(&c, &p) || is_subset(&p, &c) {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diacritics_and_punct() {
        assert_eq!(normalize("Türkiye"), "turkiye");
        assert_eq!(normalize("Curaçao"), "curacao");
        assert_eq!(normalize("Côte d'Ivoire"), "cote d ivoire");
        assert_eq!(normalize("  San  Antonio  "), "san antonio");
    }

    #[test]
    fn word_order_swap() {
        let names = vec!["Congo DR".to_string()];
        assert!(team_matches(&names, "DR Congo"));
    }

    #[test]
    fn nickname_subset() {
        let names = vec!["New York Knicks".to_string()];
        assert!(team_matches(&names, "Knicks"));
        assert!(!team_matches(&names, "Brooklyn Nets"));
    }
}
