/**
 * FinMind Open Data API client.
 *
 * Free tier: 300 req/hour anonymous, more with a token.
 * https://finmindtrade.com — endpoint: /api/v4/data?dataset=...
 *
 * Only the post-close datasets we actually expose to the AI are wrapped
 * here; the raw fetcher accepts any dataset name for power-user calls.
 */

const BASE_URL = 'https://api.finmindtrade.com/api/v4/data'

export interface FinMindRow {
  [key: string]: unknown
}

export interface FinMindResponse {
  msg: string
  status: number
  data: FinMindRow[]
}

export class FinMindClient {
  constructor(private readonly token?: string) {}

  /**
   * Generic fetch — returns the `data` array verbatim. Caller is
   * responsible for shaping rows; FinMind dataset schemas are stable.
   */
  async query(params: Record<string, string | number>): Promise<FinMindRow[]> {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) qs.set(k, String(v))
    if (this.token) qs.set('token', this.token)
    const res = await fetch(`${BASE_URL}?${qs.toString()}`)
    if (!res.ok) throw new Error(`FinMind HTTP ${res.status}`)
    const json = (await res.json()) as FinMindResponse
    if (json.status !== 200) throw new Error(`FinMind: ${json.msg}`)
    return json.data ?? []
  }

  /** 三大法人買賣超 (foreign / investment trust / dealer). */
  async getInstitutionalInvestors(symbol: string, startDate: string, endDate?: string) {
    return this.query({
      dataset: 'TaiwanStockInstitutionalInvestorsBuySell',
      data_id: symbol,
      start_date: startDate,
      ...(endDate ? { end_date: endDate } : {}),
    })
  }

  /** 融資融券 (margin / short). */
  async getMarginShort(symbol: string, startDate: string, endDate?: string) {
    return this.query({
      dataset: 'TaiwanStockMarginPurchaseShortSale',
      data_id: symbol,
      start_date: startDate,
      ...(endDate ? { end_date: endDate } : {}),
    })
  }

  /** 月營收 (monthly revenue). */
  async getMonthlyRevenue(symbol: string, startDate: string) {
    return this.query({
      dataset: 'TaiwanStockMonthRevenue',
      data_id: symbol,
      start_date: startDate,
    })
  }

  // ==================== Macro / cross-asset datasets ====================
  //
  // Verified against FinMind v4 enum (probed 2026-05). FinMind does NOT
  // expose Taiwan CPI / GDP / unemployment / FX reserves / CBC policy
  // rate as free datasets — those must be sourced elsewhere (FRED for
  // global indicators, 主計總處 / 央行 web pages for Taiwan-specifics).
  //
  // Confirmed-available datasets (free tier):
  //   InterestRate           : 各國基準利率
  //   GovernmentBondsYield   : 各國公債殖利率（含台灣）
  //   CrudeOilPrices         : 國際油價（WTI/Brent）
  //   GoldPrice              : 黃金現貨
  //   CnnFearGreedIndex      : CNN 恐懼貪婪指數
  //
  // Paid-tier (will return 400 with "update your user level"):
  //   TaiwanExchangeRate     : 央行公告匯率 — 用 currencyClient(yfinance) 替代
  //   TaiwanBusinessIndicator: 景氣領先指標

  /**
   * Generic macro fetcher. Caller picks dataset name from the FinMind
   * enum; AI tools route through this for flexibility.
   *
   * Some macro datasets (InterestRate, GovernmentBondsYield) require a
   * `data_id` to scope the query — e.g. country code "FED" / "ECB" /
   * "BOJ" for InterestRate. Pass it via the optional 4th arg.
   */
  async getMacro(dataset: string, startDate: string, endDate?: string, dataId?: string) {
    return this.query({
      dataset,
      start_date: startDate,
      ...(endDate ? { end_date: endDate } : {}),
      ...(dataId ? { data_id: dataId } : {}),
    })
  }

  /**
   * 各國基準利率. data_id is required — pass country code.
   * Known codes: "FED" (US), "ECB" (EU), "BOJ" (Japan), "PBoC" (China).
   * Note: data is sparse (rate-change events only, not continuous).
   */
  async getInterestRate(country: string, startDate: string, endDate?: string) {
    return this.getMacro('InterestRate', startDate, endDate, country)
  }

  /**
   * 各國公債殖利率. data_id is required — pass series code.
   * (Taiwan series may not be available on free tier; use FRED's DGS10
   *  for US 10Y instead.)
   */
  async getGovernmentBondsYield(seriesId: string, startDate: string, endDate?: string) {
    return this.getMacro('GovernmentBondsYield', startDate, endDate, seriesId)
  }

  /** 國際原油價格（WTI / Brent）. */
  async getCrudeOilPrice(startDate: string, endDate?: string) {
    return this.getMacro('CrudeOilPrices', startDate, endDate)
  }

  /** 黃金現貨價格. */
  async getGoldPrice(startDate: string, endDate?: string) {
    return this.getMacro('GoldPrice', startDate, endDate)
  }

  /** CNN 恐懼貪婪指數（市場情緒）. */
  async getFearGreedIndex(startDate: string, endDate?: string) {
    return this.getMacro('CnnFearGreedIndex', startDate, endDate)
  }
}
