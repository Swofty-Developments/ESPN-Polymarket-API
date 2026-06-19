//! Calendar math for deriving Polymarket slug dates (US-Eastern, no timezone library).
//!
//! See `docs/architecture.md`. Uses Howard Hinnant's `days_from_civil` / `civil_from_days`.

/// Days since 1970-01-01 for a proleptic Gregorian (y, m, d). `m` in 1..=12.
pub fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = y - if m <= 2 { 1 } else { 0 };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400; // [0, 399]
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    era * 146097 + doe - 719468
}

/// Inverse of [`days_from_civil`]: returns (y, m, d).
pub fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = mp + if mp < 10 { 3 } else { -9 }; // [1, 12]
    (y + if m <= 2 { 1 } else { 0 }, m, d)
}

fn fmt_date(y: i64, m: i64, d: i64) -> String {
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// Parse an RFC3339 UTC timestamp into (y, mo, d, h, mi). Tolerates `Z` or `+00:00`,
/// missing seconds, and fractional seconds. Returns `None` if the leading date/time
/// cannot be read.
pub fn parse_utc(ts: &str) -> Option<(i64, i64, i64, i64, i64)> {
    let bytes = ts.as_bytes();
    let num = |start: usize, len: usize| -> Option<i64> {
        let slice = ts.get(start..start + len)?;
        slice.parse::<i64>().ok()
    };
    if bytes.len() < 16 || bytes.get(4) != Some(&b'-') || bytes.get(7) != Some(&b'-') {
        return None;
    }
    let y = num(0, 4)?;
    let mo = num(5, 2)?;
    let d = num(8, 2)?;
    // position 10 is 'T' (or space)
    let h = num(11, 2)?;
    let mi = num(14, 2)?;
    Some((y, mo, d, h, mi))
}

/// Candidate Polymarket slug dates (YYYY-MM-DD) for a kickoff, ordered most-likely first:
/// US-Eastern estimate (UTC-5), the UTC date, Eastern-1, UTC+1. De-duplicated.
pub fn candidate_dates(kickoff_utc: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut push = |s: String| {
        if !out.contains(&s) {
            out.push(s);
        }
    };
    if let Some((y, mo, d, h, mi)) = parse_utc(kickoff_utc) {
        let days = days_from_civil(y, mo, d);
        let minutes = days * 1440 + h * 60 + mi;
        let et_days = (minutes - 300).div_euclid(1440);
        let (ey, em, ed) = civil_from_days(et_days);
        push(fmt_date(ey, em, ed)); // Eastern estimate
        push(fmt_date(y, mo, d)); // UTC date
        let (em1y, em1m, em1d) = civil_from_days(et_days - 1);
        push(fmt_date(em1y, em1m, em1d)); // Eastern - 1
        let (up1y, up1m, up1d) = civil_from_days(days + 1);
        push(fmt_date(up1y, up1m, up1d)); // UTC + 1
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        for &(y, m, d) in &[(2026, 6, 20), (2026, 1, 1), (1999, 12, 31), (2024, 2, 29)] {
            let z = days_from_civil(y, m, d);
            assert_eq!(civil_from_days(z), (y, m, d));
        }
    }

    #[test]
    fn eastern_rollover() {
        // 00:30Z on the 20th is the previous evening (19th) in US Eastern.
        let c = candidate_dates("2026-06-20T00:30Z");
        assert_eq!(c[0], "2026-06-19");
        assert!(c.contains(&"2026-06-20".to_string()));
    }

    #[test]
    fn daytime_same_day() {
        let c = candidate_dates("2026-06-15T16:00Z");
        assert_eq!(c[0], "2026-06-15");
    }
}
