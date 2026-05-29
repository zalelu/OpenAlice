/**
 * Taiwan Stock AI Tools (FinMind)
 *
 * Six tools covering everything visible on the FinMind Taiwan stock dashboard:
 *   twStockSnapshot   — real-time tick snapshot
 *   twStockPrice      — historical OHLCV (daily / weekly / monthly, raw or adjusted)
 *   twStockTechnical  — BIAS, KD/RSV, RSI, MACD, OBV computed from adjusted price
 *   twStockChips      — 融資融券, 三大法人, 持股分布, 借券, 鉅額
 *   twStockFundamentals — 月營收, 財報三表, 股利, 市值, 本益比
 *   twFuturesOptions  — 期貨/選擇權三大法人未平倉 + 即時快照
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { FinMindClient } from '@/domain/market-data/client/finmind/index.js'
import type { TwStockPriceRow } from '@/domain/market-data/client/finmind/price-client.js'
import type { TwInstitutionalRow } from '@/domain/market-data/client/finmind/chips-client.js'

// ==================== Technical Indicator Helpers ====================

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

function smaSeries(values: number[], n: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < n - 1) return null
    return values.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n
  })
}

function emaSeries(values: number[], n: number): number[] {
  const k = 2 / (n + 1)
  return values.reduce<number[]>((acc, v) => {
    acc.push(acc.length === 0 ? v : acc[acc.length - 1] * (1 - k) + v * k)
    return acc
  }, [])
}

function rsiSeries(closes: number[], n: number): (number | null)[] {
  const result: (number | null)[] = Array(n).fill(null)
  // Seed with simple average of first N changes
  const changes = closes.slice(1).map((c, i) => c - closes[i])
  if (changes.length < n) return closes.map(() => null)
  let avgGain = changes.slice(0, n).reduce((a, b) => a + Math.max(0, b), 0) / n
  let avgLoss = changes.slice(0, n).reduce((a, b) => a + Math.abs(Math.min(0, b)), 0) / n
  result.push(avgLoss === 0 ? 100 : r2(100 - 100 / (1 + avgGain / avgLoss)))
  for (let i = n; i < changes.length; i++) {
    avgGain = (avgGain * (n - 1) + Math.max(0, changes[i])) / n
    avgLoss = (avgLoss * (n - 1) + Math.abs(Math.min(0, changes[i]))) / n
    result.push(avgLoss === 0 ? 100 : r2(100 - 100 / (1 + avgGain / avgLoss)))
  }
  return result
}

function computeTechnicals(rows: TwStockPriceRow[]) {
  const closes = rows.map(r => r.close)
  const highs  = rows.map(r => r.max)
  const lows   = rows.map(r => r.min)
  const vols   = rows.map(r => r.Trading_Volume)

  const ma5  = smaSeries(closes, 5)
  const ma10 = smaSeries(closes, 10)
  const ma20 = smaSeries(closes, 20)
  const ma60 = smaSeries(closes, 60)

  // BIAS = (close - MA) / MA × 100
  const biasOf = (maArr: (number | null)[]) =>
    closes.map((c, i) => (maArr[i] !== null && maArr[i] !== 0) ? r2((c - maArr[i]!) / maArr[i]! * 100) : null)

  // KD(9) with Wilder smoothing (K₀ = D₀ = 50)
  const K: (number | null)[] = []
  const D: (number | null)[] = []
  const RSV_: (number | null)[] = []
  let prevK = 50, prevD = 50
  for (let i = 0; i < rows.length; i++) {
    if (i < 8) { K.push(null); D.push(null); RSV_.push(null); continue }
    const wHigh = Math.max(...highs.slice(i - 8, i + 1))
    const wLow  = Math.min(...lows.slice(i - 8, i + 1))
    const rsv = wHigh === wLow ? 50 : (closes[i] - wLow) / (wHigh - wLow) * 100
    const k = prevK * (2 / 3) + rsv * (1 / 3)
    const d = prevD * (2 / 3) + k  * (1 / 3)
    RSV_.push(r2(rsv)); K.push(r2(k)); D.push(r2(d))
    prevK = k; prevD = d
  }

  // RSI(6) and RSI(12) — Wilder's smoothed
  const rsi6  = rsiSeries(closes, 6)
  const rsi12 = rsiSeries(closes, 12)

  // MACD(12, 26, 9)
  const ema12   = emaSeries(closes, 12)
  const ema26   = emaSeries(closes, 26)
  const macdLine    = ema12.map((v, i) => v - ema26[i])
  const signalLine  = emaSeries(macdLine, 9)
  const histogram   = macdLine.map((v, i) => v - signalLine[i])

  // OBV
  const obv: number[] = [0]
  for (let i = 1; i < rows.length; i++) {
    const dir = closes[i] > closes[i - 1] ? 1 : closes[i] < closes[i - 1] ? -1 : 0
    obv.push(obv[i - 1] + dir * vols[i])
  }

  return rows.map((row, i) => ({
    date:       row.date,
    close:      row.close,
    volume:     row.Trading_Volume,
    MA5:        ma5[i]  !== null ? r2(ma5[i]!)  : null,
    MA10:       ma10[i] !== null ? r2(ma10[i]!) : null,
    MA20:       ma20[i] !== null ? r2(ma20[i]!) : null,
    MA60:       ma60[i] !== null ? r2(ma60[i]!) : null,
    BIAS5:      biasOf(ma5)[i],
    BIAS10:     biasOf(ma10)[i],
    BIAS20:     biasOf(ma20)[i],
    BIAS60:     biasOf(ma60)[i],
    RSV:        RSV_[i],
    K:          K[i],
    D:          D[i],
    J:          (K[i] !== null && D[i] !== null) ? r2(3 * K[i]! - 2 * D[i]!) : null,
    RSI6:       rsi6[i]  !== null ? r2(rsi6[i]!)  : null,
    RSI12:      rsi12[i] !== null ? r2(rsi12[i]!) : null,
    MACD:       r2(macdLine[i]),
    Signal:     r2(signalLine[i]),
    Histogram:  r2(histogram[i]),
    OBV:        obv[i],
  }))
}

// Pivot institutional rows into { date, Foreign, InvestmentTrust, Dealer, net } per day
function pivotInstitutional(rows: TwInstitutionalRow[]) {
  const byDate = new Map<string, Record<string, number>>()
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, {})
    const entry = byDate.get(r.date)!
    entry[r.name] = (r.buy ?? 0) - (r.sell ?? 0)
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, m]) => ({
      date,
      Foreign:        (m['Foreign_Investor'] ?? 0) + (m['Foreign_Dealer_Self'] ?? 0),
      InvestmentTrust: m['Investment_Trust'] ?? 0,
      Dealer:         (m['Dealer_self'] ?? 0) + (m['Dealer_Hedging'] ?? 0),
      net:            Object.values(m).reduce((a, b) => a + b, 0),
    }))
}

// ==================== Tool Factory ====================

export function createTaiwanTools(finmind: FinMindClient) {
  return {

    // ── 1. Real-time snapshot ──────────────────────────────────────────────────

    twStockSnapshot: tool({
      description: `取得台股即時快照 (real-time tick snapshot)。
Returns the latest tick price, volume, bid/ask for Taiwan-listed stocks.
Requires Sponsor-tier FinMind account; free tier returns an error.
stock_id: 4-digit TWSE/TPEX code, e.g. "2330" (TSMC). Omit to get all stocks (large payload).`,
      inputSchema: z.object({
        stock_id: z.string().optional().describe('台股代碼，e.g. "2330"。不填則取全市場快照'),
      }),
      execute: async ({ stock_id }) => {
        return finmind.price.getSnapshot(stock_id)
      },
    }),

    // ── 2. Historical price ────────────────────────────────────────────────────

    twStockPrice: tool({
      description: `取得台股歷史價格 (historical OHLCV)。
period: 'daily' (預設) / 'weekly' / 'monthly'.
adjusted: true = 還原權值(除權息調整後)，適合長期分析與技術指標計算。
Also returns daily P/E ratio, P/B, dividend yield when include_per is true.
stock_id: TWSE/TPEX 4-digit code, e.g. "2330".
start_date / end_date: "YYYY-MM-DD".`,
      inputSchema: z.object({
        stock_id:    z.string().describe('台股代碼，e.g. "2330"'),
        start_date:  z.string().describe('起始日期 YYYY-MM-DD'),
        end_date:    z.string().optional().describe('結束日期 YYYY-MM-DD（不填預設今日）'),
        period:      z.enum(['daily', 'weekly', 'monthly']).optional().describe('K線週期（預設 daily）'),
        adjusted:    z.boolean().optional().describe('是否取還原權值（預設 false）'),
        include_per: z.boolean().optional().describe('同時回傳本益比/本淨比/殖利率（預設 false）'),
      }),
      execute: async ({ stock_id, start_date, end_date, period = 'daily', adjusted = false, include_per = false }) => {
        const pricePromise =
          period === 'weekly'  ? finmind.price.getWeekly(stock_id, start_date, end_date) :
          period === 'monthly' ? finmind.price.getMonthly(stock_id, start_date, end_date) :
          adjusted             ? finmind.price.getAdjusted(stock_id, start_date, end_date) :
                                 finmind.price.getDaily(stock_id, start_date, end_date)

        const [price, per] = await Promise.all([
          pricePromise,
          include_per ? finmind.price.getPER(stock_id, start_date, end_date).catch(() => []) : Promise.resolve([]),
        ])
        return include_per ? { price, per } : price
      },
    }),

    // ── 3. Technical indicators ────────────────────────────────────────────────

    twStockTechnical: tool({
      description: `計算台股技術指標，包含 MA, BIAS(乖離率), KD/RSV(隨機指標), RSI, MACD, OBV。

Uses adjusted (還原權值) prices internally for accuracy.
Fetches enough historical data automatically; you only need to specify the window you want returned.

Returned fields per row:
  date, close, volume,
  MA5/10/20/60, BIAS5/10/20/60,
  RSV, K, D, J,
  RSI6, RSI12,
  MACD, Signal, Histogram, OBV

Also optionally returns day-trading (當沖) statistics when include_day_trading is true:
  (volume breakdown: day-trade vs normal, buy/sell counts)

「融資使用率」(margin utilization / 過熱指數之一) is in twStockChips — call that with include=['margin'].`,
      inputSchema: z.object({
        stock_id:            z.string().describe('台股代碼，e.g. "2330"'),
        end_date:            z.string().optional().describe('最後日期 YYYY-MM-DD（不填預設今日）'),
        limit:               z.number().int().positive().optional().describe('回傳最近幾筆（預設 60）'),
        include_day_trading: z.boolean().optional().describe('同時回傳當沖統計（預設 false）'),
      }),
      execute: async ({ stock_id, end_date, limit = 60, include_day_trading = false }) => {
        // Need at least 120 bars for MACD(26) + enough Signal(9) warmup + MA60 + limit
        const lookback = Math.max(limit + 120, 180)
        const startMs  = Date.now() - lookback * 1.5 * 24 * 60 * 60 * 1000  // ~1.5× for weekends
        const startDate = new Date(startMs).toISOString().slice(0, 10)

        const [rows, dayTrade] = await Promise.all([
          finmind.price.getAdjusted(stock_id, startDate, end_date),
          include_day_trading
            ? finmind.price.getDayTrading(stock_id, startDate, end_date).catch(() => [])
            : Promise.resolve([]),
        ])

        const technicals = computeTechnicals(rows).slice(-limit)
        return include_day_trading ? { technicals, dayTrade: dayTrade.slice(-limit) } : technicals
      },
    }),

    // ── 4. Chips / investor activity ──────────────────────────────────────────

    twStockChips: tool({
      description: `台股籌碼面分析。

include options (選一或多個):
  'margin'        — 融資融券：餘額、增減、融資使用率(balance/limit × 100)
  'institutional' — 三大法人買賣超：外資、投信、自營商（含 net 合計），已 pivot 成每日一行
  'shareholding'  — 持股分布：散戶/主力/大股東持股結構
  'shareholding_pct' — 大股東持股比例
  'lending'       — 借券賣出
  'block'         — 鉅額交易

stock_id: TWSE/TPEX code. start_date / end_date: "YYYY-MM-DD".`,
      inputSchema: z.object({
        stock_id:   z.string().describe('台股代碼'),
        start_date: z.string().describe('起始日期 YYYY-MM-DD'),
        end_date:   z.string().optional().describe('結束日期 YYYY-MM-DD'),
        include:    z.array(z.enum(['margin', 'institutional', 'shareholding', 'shareholding_pct', 'lending', 'block']))
                     .describe('要取哪幾類籌碼資料'),
      }),
      execute: async ({ stock_id, start_date, end_date, include }) => {
        const result: Record<string, unknown> = {}
        await Promise.all(include.map(async (key) => {
          switch (key) {
            case 'margin': {
              const rows = await finmind.chips.getMarginShort(stock_id, start_date, end_date)
              result.margin = rows.map(r => ({
                ...r,
                MarginUtilizationPct: r.MarginPurchaseLimit > 0
                  ? r2(r.MarginPurchaseTodayBalance / r.MarginPurchaseLimit * 100)
                  : null,
                ShortUtilizationPct: r.ShortSaleLimit > 0
                  ? r2(r.ShortSaleTodayBalance / r.ShortSaleLimit * 100)
                  : null,
              }))
              break
            }
            case 'institutional': {
              const rows = await finmind.chips.getInstitutional(stock_id, start_date, end_date)
              result.institutional = pivotInstitutional(rows)
              break
            }
            case 'shareholding': {
              result.shareholding = await finmind.chips.getShareholding(stock_id, start_date, end_date)
              break
            }
            case 'shareholding_pct': {
              result.shareholding_pct = await finmind.chips.getShareholdingPct(stock_id, start_date, end_date)
              break
            }
            case 'lending': {
              result.lending = await finmind.chips.getSecuritiesLending(stock_id, start_date, end_date)
              break
            }
            case 'block': {
              result.block = await finmind.chips.getBlockTrade(stock_id, start_date, end_date)
              break
            }
          }
        }))
        return result
      },
    }),

    // ── 5. Fundamentals ───────────────────────────────────────────────────────

    twStockFundamentals: tool({
      description: `台股基本面數據。

type options:
  'revenue'     — 月營收（含年/月增減率可自行計算）
  'income'      — 綜合損益表（季報）
  'balance'     — 資產負債表（季報）
  'cashflow'    — 現金流量表（季報）
  'dividend'    — 歷年股利政策（現金股利 + 股票股利）
  'dividend_result' — 除權除息日期與實際金額
  'market_value'— 每日市值
  'per'         — 每日本益比 / 本淨比 / 殖利率

stock_id: TWSE/TPEX code.
start_date / end_date only apply to time-series types (revenue / income / balance / cashflow / market_value / per).
dividend and dividend_result use stock_id only (ignore date range).`,
      inputSchema: z.object({
        stock_id:   z.string().describe('台股代碼，e.g. "2330"'),
        type:       z.enum(['revenue', 'income', 'balance', 'cashflow', 'dividend', 'dividend_result', 'market_value', 'per'])
                     .describe('要取哪類基本面資料'),
        start_date: z.string().optional().describe('起始日期 YYYY-MM-DD（部分類型必填）'),
        end_date:   z.string().optional().describe('結束日期 YYYY-MM-DD'),
      }),
      execute: async ({ stock_id, type, start_date, end_date }) => {
        const sd = start_date ?? ''
        switch (type) {
          case 'revenue':         return finmind.fundamental.getMonthRevenue(stock_id, sd, end_date)
          case 'income':          return finmind.fundamental.getFinancialStatements(stock_id, sd, end_date)
          case 'balance':         return finmind.fundamental.getBalanceSheet(stock_id, sd, end_date)
          case 'cashflow':        return finmind.fundamental.getCashFlow(stock_id, sd, end_date)
          case 'dividend':        return finmind.fundamental.getDividend(stock_id)
          case 'dividend_result': return finmind.fundamental.getDividendResult(stock_id, start_date)
          case 'market_value':    return finmind.fundamental.getMarketValue(stock_id, sd, end_date)
          case 'per':             return finmind.fundamental.getPER(stock_id, sd, end_date)
        }
      },
    }),

    // ── 6. Futures / Options ──────────────────────────────────────────────────

    twFuturesOptions: tool({
      description: `台灣期貨 / 選擇權數據。

type options:
  'futures_institutional'  — 三大法人期貨未平倉（含多空淨部位）
  'options_institutional'  — 三大法人選擇權未平倉（Buy/Sell OI）
  'futures_snapshot'       — 期貨即時快照（Sponsor tier 限定）
  'options_snapshot'       — 選擇權即時快照（Sponsor tier 限定）
  'futures_daily'          — 期貨日K (需 symbol，e.g. "TX" 大台指, "MXF" 小台指)
  'options_daily'          — 選擇權日K (需 symbol)

For institutional types, start_date is required; symbol is ignored.
For snapshot types, symbol is optional (omit = all contracts).
For daily types, both symbol and start_date are required.`,
      inputSchema: z.object({
        type:       z.enum(['futures_institutional', 'options_institutional', 'futures_snapshot', 'options_snapshot', 'futures_daily', 'options_daily']),
        symbol:     z.string().optional().describe('合約代碼，e.g. "TX" (大台), "MXF" (小台)'),
        start_date: z.string().optional().describe('起始日期 YYYY-MM-DD'),
        end_date:   z.string().optional().describe('結束日期 YYYY-MM-DD'),
      }),
      execute: async ({ type, symbol, start_date, end_date }) => {
        const sd = start_date ?? ''
        switch (type) {
          case 'futures_institutional':  return finmind.derivatives.getFuturesInstitutional(sd, end_date)
          case 'options_institutional':  return finmind.derivatives.getOptionsInstitutional(sd, end_date)
          case 'futures_snapshot':       return finmind.derivatives.getFuturesSnapshot(symbol)
          case 'options_snapshot':       return finmind.derivatives.getOptionsSnapshot(symbol)
          case 'futures_daily':          return finmind.derivatives.getFuturesDaily(symbol ?? 'TX', sd, end_date)
          case 'options_daily':          return finmind.derivatives.getOptionsDaily(symbol ?? 'TXO', sd, end_date)
        }
      },
    }),

  }
}
