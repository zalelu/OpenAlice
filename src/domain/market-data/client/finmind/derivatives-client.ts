import { FinMindBaseClient } from './base-client.js'

export class TaiwanDerivativesClient extends FinMindBaseClient {
  /** 期貨日K — futures daily OHLCV. Common symbols: 'TX' (大台指), 'MXF' (小台指) */
  getFuturesDaily(symbol: string, startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanFuturesDaily', { data_id: symbol, start_date: startDate, end_date: endDate })
  }

  /** 選擇權日K — options daily data */
  getOptionsDaily(symbol: string, startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanOptionDaily', { data_id: symbol, start_date: startDate, end_date: endDate })
  }

  /**
   * 三大法人期貨未平倉 — futures institutional open interest by type.
   * No data_id required — returns all contracts for the date range.
   */
  getFuturesInstitutional(startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanFuturesInstitutionalInvestors', { start_date: startDate, end_date: endDate })
  }

  /**
   * 三大法人選擇權未平倉 — options institutional open interest by type.
   * No data_id required.
   */
  getOptionsInstitutional(startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanOptionInstitutionalInvestors', { start_date: startDate, end_date: endDate })
  }

  /** 期貨即時快照 — real-time futures snapshot. Sponsor tier required. */
  getFuturesSnapshot(symbol?: string) {
    return this.queryEndpoint<Record<string, unknown>>('taiwan_futures_snapshot', symbol ? { data_id: symbol } : {})
  }

  /** 選擇權即時快照 — real-time options snapshot. Sponsor tier required. */
  getOptionsSnapshot(symbol?: string) {
    return this.queryEndpoint<Record<string, unknown>>('taiwan_options_snapshot', symbol ? { data_id: symbol } : {})
  }
}
