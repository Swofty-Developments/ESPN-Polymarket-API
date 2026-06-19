/**
 * Calendar math for deriving Polymarket slug dates (US-Eastern, no timezone library).
 *
 * See `docs/architecture.md` and the Rust reference (`core-rs/src/datecalc.rs`).
 * Uses Howard Hinnant's `days_from_civil` / `civil_from_days` (exact integer math).
 */

/**
 * Truncating integer division (toward zero), matching Rust's `/` on i64.
 * The Hinnant algorithm pre-adjusts operands so this is exact.
 */
function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** Days since 1970-01-01 for a proleptic Gregorian (y, m, d). `m` in 1..=12. */
export function daysFromCivil(yIn: number, m: number, d: number): number {
  const y = yIn - (m <= 2 ? 1 : 0);
  const era = idiv(y >= 0 ? y : y - 399, 400);
  const yoe = y - era * 400; // [0, 399]
  const doy = idiv(153 * (m + (m > 2 ? -3 : 9)) + 2, 5) + d - 1; // [0, 365]
  const doe = yoe * 365 + idiv(yoe, 4) - idiv(yoe, 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

/** Inverse of {@link daysFromCivil}: returns `[y, m, d]`. */
export function civilFromDays(zIn: number): [number, number, number] {
  const z = zIn + 719468;
  const era = idiv(z >= 0 ? z : z - 146096, 146097);
  const doe = z - era * 146097; // [0, 146096]
  const yoe = idiv(doe - idiv(doe, 1460) + idiv(doe, 36524) - idiv(doe, 146096), 365); // [0, 399]
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + idiv(yoe, 4) - idiv(yoe, 100)); // [0, 365]
  const mp = idiv(5 * doy + 2, 153); // [0, 11]
  const d = doy - idiv(153 * mp + 2, 5) + 1; // [1, 31]
  const m = mp + (mp < 10 ? 3 : -9); // [1, 12]
  return [y + (m <= 2 ? 1 : 0), m, d];
}

function pad(n: number, width: number): string {
  const s = String(Math.abs(n));
  const padded = s.length >= width ? s : "0".repeat(width - s.length) + s;
  return n < 0 ? "-" + padded : padded;
}

function fmtDate(y: number, m: number, d: number): string {
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/**
 * Parse an RFC3339 UTC timestamp into `[y, mo, d, h, mi]`. Tolerates `Z` or
 * `+00:00`, missing seconds, and fractional seconds. Returns `null` if the
 * leading date/time cannot be read.
 */
export function parseUtc(ts: string): [number, number, number, number, number] | null {
  if (ts.length < 16 || ts[4] !== "-" || ts[7] !== "-") {
    return null;
  }
  const num = (start: number, len: number): number | null => {
    const slice = ts.slice(start, start + len);
    if (slice.length !== len || !/^[0-9]+$/.test(slice)) return null;
    return parseInt(slice, 10);
  };
  const y = num(0, 4);
  const mo = num(5, 2);
  const d = num(8, 2);
  // position 10 is 'T' (or space)
  const h = num(11, 2);
  const mi = num(14, 2);
  if (y === null || mo === null || d === null || h === null || mi === null) {
    return null;
  }
  return [y, mo, d, h, mi];
}

/** Floored division matching Rust's `i64::div_euclid` for the divisors used here (positive). */
function divEuclid(a: number, b: number): number {
  return Math.floor(a / b);
}

/**
 * Candidate Polymarket slug dates (YYYY-MM-DD) for a kickoff, ordered
 * most-likely first: US-Eastern estimate (UTC-5), the UTC date, Eastern-1,
 * UTC+1. De-duplicated, preserving order.
 */
export function candidateDates(kickoffUtc: string): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  const parsed = parseUtc(kickoffUtc);
  if (parsed) {
    const [y, mo, d, h, mi] = parsed;
    const days = daysFromCivil(y, mo, d);
    const minutes = days * 1440 + h * 60 + mi;
    const etDays = divEuclid(minutes - 300, 1440);
    const [ey, em, ed] = civilFromDays(etDays);
    push(fmtDate(ey, em, ed)); // Eastern estimate
    push(fmtDate(y, mo, d)); // UTC date
    const [em1y, em1m, em1d] = civilFromDays(etDays - 1);
    push(fmtDate(em1y, em1m, em1d)); // Eastern - 1
    const [up1y, up1m, up1d] = civilFromDays(days + 1);
    push(fmtDate(up1y, up1m, up1d)); // UTC + 1
  }
  return out;
}
