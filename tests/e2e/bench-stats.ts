// Purpose: the benchmark-harness stats + result contract (tambor-54j.4)
//   — the pure half of the harness shared by the bench spec (which
//   emits results) and the contract test (tests/bench-results.test.ts,
//   which pins the shape before the app suites 54j.6/.7 consume it).
// Responsibilities: percentile/computeStats over raw samples (linear
//   interpolation, sorted copy — never mutates the caller's array);
//   the BenchResult schema every emitted JSON must satisfy
//   (tambor-bench/1: pinned versions, commit, CPU throttle rate,
//   non-empty raw samples, stats consistent with those samples); the
//   validateBenchResult checker returning a list of violations (empty
//   list = valid).
// Rationale: the programme principle (chat-repo cold read §4.1) is
//   "publish raw JSON; pin versions; label every number" — this module
//   makes that a checkable contract instead of a convention. It is
//   pure (no fs, no process, no DOM) so it runs in the plain vitest
//   node environment and is trivially testable; the bench spec does
//   the impure IO around it.

// The stats block of an emitted result. Percentiles are linearly
// interpolated between adjacent order statistics (the numpy default).
export interface BenchStats {
  readonly n: number;
  readonly mean: number;
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly p90: number;
  readonly min: number;
  readonly max: number;
}

// The result schema: what one scenario run emits, raw samples intact.
export interface BenchResult {
  readonly schema: "tambor-bench/1";
  // T/D/U label scheme of the programme doc: a harness measurement is
  // T (tested — measured in a real browser against a real build).
  readonly grade: "T";
  readonly scenario: string;
  readonly app: string;
  readonly commit: string;
  readonly port: number;
  readonly throttle: { readonly cpuRate: number; readonly via: string };
  readonly runs: number;
  readonly opsPerRun: number;
  readonly unit: "ms";
  readonly versions: Readonly<Record<string, string>>;
  readonly samples: readonly number[];
  readonly stats: BenchStats;
}

// The p-th percentile (0–100) of an ascending-sorted sample list, by
// linear interpolation: idx = p/100 × (n−1) — the numpy-default rule,
// so an even-count median interpolates rather than picking a side.
export function percentile(
  sorted: readonly number[],
  p: number,
): number {
  const n = sorted.length;
  if (n === 0) throw new Error("percentile of empty samples");
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] as number;
  const frac = idx - lo;
  return (sorted[lo] as number) * (1 - frac) + (sorted[hi] as number) * frac;
}

// Median/p25/p75/p90 (plus mean/min/max) over raw samples. Throws on
// an empty list — an empty sample set is a harness bug, not a stat.
export function computeStats(samples: readonly number[]): BenchStats {
  if (samples.length === 0) throw new Error("stats of empty samples");
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    n: sorted.length,
    mean: sum / sorted.length,
    median: percentile(sorted, 50),
    p25: percentile(sorted, 25),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    min: sorted[0] as number,
    max: sorted[sorted.length - 1] as number,
  };
}

const SCHEMA = "tambor-bench/1";
const PINNED_VERSION_KEYS = [
  "playwright",
  "chrome",
  "esbuild",
  "typescript",
  "node",
] as const;

// Per-field checkers: each returns violation strings for its field.
// Split out of validateBenchResult so every function stays inside the
// pretender complexity floor (the contract is unchanged).

const isNonEmptyString = (v: unknown): boolean =>
  typeof v === "string" && v !== "";

// Commit ids: 7–40 hex chars (short or full sha).
function isCommitSha(v: unknown): boolean {
  return typeof v === "string" && /^[0-9a-f]{7,40}$/.test(v);
}

function checkScalars(r: { [k: string]: unknown }): readonly string[] {
  const errors: string[] = [];
  if (r["schema"] !== SCHEMA) errors.push(`schema: expected ${SCHEMA}`);
  if (r["grade"] !== "T") errors.push('grade: expected "T"');
  errors.push(...checkNameKeys(r));
  if (!isCommitSha(r["commit"])) errors.push("commit: 7–40 hex chars required");
  if (r["unit"] !== "ms") errors.push('unit: expected "ms"');
  return errors;
}

function checkNameKeys(r: { [k: string]: unknown }): readonly string[] {
  const errors: string[] = [];
  for (const key of ["scenario", "app"] as const) {
    if (!isNonEmptyString(r[key])) errors.push(`${key}: non-empty string required`);
  }
  return errors;
}

const isPositiveInt = (v: unknown): boolean =>
  typeof v === "number" && Number.isInteger(v) && v >= 1;

function checkPositiveInt(r: { [k: string]: unknown }, key: string): string[] {
  if (!isPositiveInt(r[key])) {
    return [`${key}: positive integer required`];
  }
  return [];
}

function checkThrottle(r: { [k: string]: unknown }): readonly string[] {
  const t = r["throttle"];
  if (typeof t !== "object" || t === null) {
    return ["throttle: object required"];
  }
  const errors: string[] = [];
  const { cpuRate, via } = t as { cpuRate?: unknown; via?: unknown };
  if (!isPositiveInt(cpuRate)) {
    errors.push("throttle.cpuRate: integer ≥ 1 required");
  }
  if (!isNonEmptyString(via)) {
    errors.push("throttle.via: non-empty string required");
  }
  return errors;
}

function checkVersions(r: { [k: string]: unknown }): readonly string[] {
  const v = r["versions"];
  if (typeof v !== "object" || v === null) {
    return ["versions: object required (pinned versions)"];
  }
  const versions = v as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of PINNED_VERSION_KEYS) {
    if (!isNonEmptyString(versions[key])) {
      errors.push(`versions.${key}: pinned non-empty version required`);
    }
  }
  return errors;
}

function checkSamples(r: { [k: string]: unknown }): readonly string[] {
  const samples = r["samples"];
  if (!Array.isArray(samples) || samples.length === 0) {
    return ["samples: non-empty array required (raw samples)"];
  }
  if (!samples.every(isFiniteNonNegative)) {
    return ["samples: finite non-negative numbers required"];
  }
  return [];
}

const isFiniteNonNegative = (v: unknown): boolean =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

const STAT_KEYS = ["mean", "median", "p25", "p75", "p90", "min", "max"] as const;

function checkStatsRange(
  s: Record<string, unknown>,
  errors: string[],
): void {
  if (!statValuesFinite(s)) {
    errors.push("stats: finite numbers required for all keys");
    return;
  }
  const min = s["min"] as number;
  const max = s["max"] as number;
  for (const k of STAT_KEYS) {
    const v = s[k] as number;
    if (v < min || v > max) errors.push(`stats.${k}: outside [min, max]`);
  }
}

function statValuesFinite(s: Record<string, unknown>): boolean {
  return STAT_KEYS.every((k) => {
    const v = s[k];
    return typeof v === "number" && Number.isFinite(v);
  });
}

function checkStats(
  r: { [k: string]: unknown },
  errors: string[],
): void {
  const stats = r["stats"];
  if (typeof stats !== "object" || stats === null) {
    errors.push("stats: object required");
    return;
  }
  const s = stats as Record<string, unknown>;
  const samples = r["samples"];
  if (Array.isArray(samples) && samples.length > 0) {
    checkStatsCount(s, samples.length, errors);
    checkStatsRange(s, errors);
  }
}

function checkStatsCount(
  s: Record<string, unknown>,
  count: number,
  errors: string[],
): void {
  if (s["n"] !== count) {
    errors.push("stats.n: must equal samples.length");
  }
}

// Every violation of the result contract, in reading order — an empty
// list means the result is well-formed. Deliberately strict: a
// malformed result silently poisons every later benchmark table.
export function validateBenchResult(value: unknown): readonly string[] {
  if (typeof value !== "object" || value === null) {
    return ["result: not an object"];
  }
  const r = value as { [k: string]: unknown };
  const errors: string[] = [];
  errors.push(...checkScalars(r));
  errors.push(...checkPositiveInt(r, "port"), ...checkPositiveInt(r, "runs"),
    ...checkPositiveInt(r, "opsPerRun"));
  errors.push(...checkThrottle(r), ...checkVersions(r), ...checkSamples(r));
  checkStats(r, errors);
  return errors;
}
