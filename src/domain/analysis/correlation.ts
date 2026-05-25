/**
 * Correlation utilities for cross-series analysis.
 *
 * Pearson r measures linear association on the same time grid. Series
 * coming from different sources (stock K-bars vs FRED monthly) usually
 * differ in length and date stamps, so the entry point requires aligned
 * arrays — alignment is the caller's job (see alignByDate).
 */

/**
 * Pearson correlation coefficient for two equal-length numeric arrays.
 * Returns NaN when input is too short (< 2) or stdev is zero.
 */
export function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length) {
    throw new Error(`pearson: length mismatch — xs=${xs.length} ys=${ys.length}`)
  }
  const n = xs.length
  if (n < 2) return NaN

  let sx = 0, sy = 0
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i] }
  const mx = sx / n
  const my = sy / n

  let num = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    num += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  const denom = Math.sqrt(dx2 * dy2)
  return denom === 0 ? NaN : num / denom
}

/**
 * Align two date-keyed series on their common dates, preserving order
 * by date ASC. Returns parallel arrays ready to feed into pearson().
 *
 * Use this when you fetch one series from taiwanGetHistory (daily K)
 * and another from economyFredSeries (monthly CPI) — they live on
 * different grids; this picks only dates that exist in both.
 */
export interface DatePoint {
  date: string  // YYYY-MM-DD or any sortable ISO prefix
  value: number
}

export function alignByDate(a: DatePoint[], b: DatePoint[]): { dates: string[]; xs: number[]; ys: number[] } {
  const map = new Map<string, number>()
  for (const p of a) map.set(p.date, p.value)
  const dates: string[] = []
  const xs: number[] = []
  const ys: number[] = []
  for (const p of b) {
    const x = map.get(p.date)
    if (x === undefined) continue
    if (!Number.isFinite(x) || !Number.isFinite(p.value)) continue
    dates.push(p.date)
    xs.push(x)
    ys.push(p.value)
  }
  // Sort by date so downstream rolling/ordered calcs make sense
  const order = dates
    .map((d, i) => ({ d, i }))
    .sort((m, n) => m.d.localeCompare(n.d))
  return {
    dates: order.map((o) => o.d),
    xs: order.map((o) => xs[o.i]),
    ys: order.map((o) => ys[o.i]),
  }
}

/**
 * Convenience: returns r along with sample size and a qualitative label
 * to help non-quant readers interpret the magnitude.
 */
export interface CorrelationResult {
  r: number
  n: number
  label: 'strong-positive' | 'moderate-positive' | 'weak' | 'moderate-negative' | 'strong-negative' | 'insufficient'
}

export function describeCorrelation(r: number, n: number): CorrelationResult {
  if (!Number.isFinite(r) || n < 10) {
    return { r, n, label: 'insufficient' }
  }
  const a = Math.abs(r)
  if (a >= 0.7) return { r, n, label: r > 0 ? 'strong-positive' : 'strong-negative' }
  if (a >= 0.4) return { r, n, label: r > 0 ? 'moderate-positive' : 'moderate-negative' }
  return { r, n, label: 'weak' }
}
