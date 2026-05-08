/**
 * TWSE / TPEX public API client.
 *
 * Two endpoints used:
 *   - mis.twse.com.tw  intraday quote (5s refresh during market hours,
 *                      latest close after close), covers both TSE + OTC
 *   - www.twse.com.tw  STOCK_DAY  monthly OHLCV history (post-close only)
 *
 * No API key required. Symbols are 4-digit Taiwan codes ("2330", "0050").
 */

export interface TwseQuote {
  symbol: string
  name: string | null
  exchange: 'TSE' | 'OTC'
  /** Last traded price (z = "成交"). null when no trade yet today. */
  last: number | null
  /** Best bid / ask from MIS payload. */
  bid: number | null
  ask: number | null
  open: number | null
  high: number | null
  low: number | null
  /** Yesterday's close — anchor for change calc. */
  prevClose: number | null
  /** Cumulative volume (lots, 1 lot = 1000 shares). */
  volume: number | null
  /** ISO timestamp of the underlying tick. */
  asOf: string | null
  /** "OPEN" while market is matching, "CLOSE" after close. From MIS `ot` field. */
  marketState: string | null
}

export interface TwseHistoricalRow {
  date: string  // YYYY-MM-DD
  open: number
  high: number
  low: number
  close: number
  volume: number  // shares
}

const MIS_URL = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp'
const STOCK_DAY_URL = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY'
const TPEX_DAY_URL = 'https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/** MIS returns "-" for missing numeric fields. */
function parseNum(v: unknown): number | null {
  if (typeof v !== 'string' || v === '' || v === '-') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** First non-zero value from `b` / `a` pipe-separated bid/ask ladders. */
function firstQuote(s: unknown): number | null {
  if (typeof s !== 'string') return null
  for (const part of s.split('_')) {
    const n = parseNum(part)
    if (n !== null && n > 0) return n
  }
  return null
}

export class TwseClient {
  /**
   * Real-time quote. Tries TSE first, falls back to OTC.
   *
   * MIS responds with msgArray: empty array means symbol not found in
   * the requested exchange — that's the OTC fallback signal, not an error.
   */
  async getQuote(symbol: string): Promise<TwseQuote> {
    const tse = await this.fetchMis(`tse_${symbol}.tw`)
    if (tse) return this.toQuote(tse, 'TSE')
    const otc = await this.fetchMis(`otc_${symbol}.tw`)
    if (otc) return this.toQuote(otc, 'OTC')
    throw new Error(`TWSE/TPEX: symbol "${symbol}" not found on either exchange`)
  }

  private async fetchMis(exCh: string): Promise<Record<string, unknown> | null> {
    const url = `${MIS_URL}?ex_ch=${encodeURIComponent(exCh)}&json=1&_=${Date.now()}`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`TWSE MIS HTTP ${res.status}`)
    const data = (await res.json()) as { msgArray?: Array<Record<string, unknown>> }
    const row = data.msgArray?.[0]
    // MIS sometimes returns a stub row with empty `c` instead of an
    // empty msgArray when the symbol is wrong-exchange — treat that
    // as "not found" so the caller can fall through to the other one.
    if (!row || !row.c || typeof row.c !== 'string' || row.c === '') return null
    return row
  }

  private toQuote(row: Record<string, unknown>, exchange: 'TSE' | 'OTC'): TwseQuote {
    const tlong = typeof row.tlong === 'string' ? Number(row.tlong) : null
    return {
      symbol: String(row.c ?? ''),
      name: typeof row.n === 'string' ? row.n : null,
      exchange,
      last: parseNum(row.z),
      bid: firstQuote(row.b),
      ask: firstQuote(row.a),
      open: parseNum(row.o),
      high: parseNum(row.h),
      low: parseNum(row.l),
      prevClose: parseNum(row.y),
      volume: parseNum(row.v),
      asOf: tlong ? new Date(tlong).toISOString() : null,
      marketState: typeof row.ot === 'string' ? row.ot : null,
    }
  }

  /**
   * Daily OHLCV from post-close batch files. Tries TSE then OTC.
   *
   * TWSE returns one calendar month per request. We fetch month-by-month
   * back from `endDate` until we cover `startDate` or hit 24 months
   * (sanity bound — long ranges should use a different data source).
   */
  async getHistorical(
    symbol: string,
    startDate: string,
    endDate: string = new Date().toISOString().slice(0, 10),
  ): Promise<TwseHistoricalRow[]> {
    const start = new Date(startDate + 'T00:00:00Z')
    const end = new Date(endDate + 'T00:00:00Z')
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('TWSE history: invalid date — expected YYYY-MM-DD')
    }

    const out: TwseHistoricalRow[] = []
    const cursor = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
    let safety = 0
    while (cursor.getTime() >= new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)).getTime()) {
      if (++safety > 24) break
      const yyyymmdd = `${cursor.getUTCFullYear()}${String(cursor.getUTCMonth() + 1).padStart(2, '0')}01`
      const monthRows = await this.fetchMonth(symbol, yyyymmdd)
      out.push(...monthRows)
      cursor.setUTCMonth(cursor.getUTCMonth() - 1)
    }

    return out
      .filter((r) => r.date >= startDate && r.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  private async fetchMonth(symbol: string, yyyymmdd: string): Promise<TwseHistoricalRow[]> {
    const tse = await this.fetchTseMonth(symbol, yyyymmdd)
    if (tse.length > 0) return tse
    return this.fetchTpexMonth(symbol, yyyymmdd)
  }

  private async fetchTseMonth(symbol: string, yyyymmdd: string): Promise<TwseHistoricalRow[]> {
    const url = `${STOCK_DAY_URL}?response=json&date=${yyyymmdd}&stockNo=${symbol}`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) return []
    const data = (await res.json()) as { stat?: string; data?: string[][] }
    if (data.stat !== 'OK' || !data.data) return []
    return data.data.map(rowToHistorical).filter((r): r is TwseHistoricalRow => r !== null)
  }

  /**
   * TPEX (上櫃) takes ROC-format date and returns ROC dates in rows.
   * URL format differs from TWSE; fields are at fixed indices.
   */
  private async fetchTpexMonth(symbol: string, yyyymmdd: string): Promise<TwseHistoricalRow[]> {
    const yyyy = Number(yyyymmdd.slice(0, 4))
    const mm = yyyymmdd.slice(4, 6)
    const rocDate = `${yyyy - 1911}/${mm}`
    const url = `${TPEX_DAY_URL}?l=zh-tw&d=${rocDate}&stkno=${symbol}`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) return []
    const data = (await res.json()) as { aaData?: string[][] }
    if (!data.aaData) return []
    return data.aaData.map(rowToHistorical).filter((r): r is TwseHistoricalRow => r !== null)
  }
}

/**
 * Both TSE and TPEX rows share the same shape:
 *   [日期(ROC), 成交股數, 成交金額, 開盤價, 最高價, 最低價, 收盤價, 漲跌價差, 成交筆數]
 * Numbers come with thousand separators.
 */
function rowToHistorical(row: string[]): TwseHistoricalRow | null {
  if (!row || row.length < 7) return null
  const date = rocToIso(row[0])
  if (!date) return null
  const stripped = (s: string) => Number(s.replace(/,/g, ''))
  const volume = stripped(row[1])
  const open = stripped(row[3])
  const high = stripped(row[4])
  const low = stripped(row[5])
  const close = stripped(row[6])
  if (![volume, open, high, low, close].every(Number.isFinite)) return null
  return { date, open, high, low, close, volume }
}

/** "113/05/06" -> "2024-05-06" */
function rocToIso(s: string): string | null {
  const m = s.match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null
  const yyyy = Number(m[1]) + 1911
  const mm = m[2].padStart(2, '0')
  const dd = m[3].padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
