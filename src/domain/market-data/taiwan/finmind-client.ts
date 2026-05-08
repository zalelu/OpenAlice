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
}
