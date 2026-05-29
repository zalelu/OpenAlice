import { FinMindBaseClient } from './base-client.js'

export interface TwStockPriceRow {
  date: string
  stock_id: string
  /** Opening price */
  open: number
  /** Daily high */
  max: number
  /** Daily low */
  min: number
  /** Closing price */
  close: number
  /** Price change from previous close */
  spread: number
  Trading_Volume: number
  Trading_money: number
  Trading_turnover: number
}

export interface TwStockKBarRow {
  date: string
  stock_id: string
  /** Intraday time "HH:MM" */
  Time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface TwStockInfoRow {
  stock_id: string
  stock_name: string
  type: string
  date: string
  market_type: string
  industry_category: string
  address: string
}

export class TaiwanPriceClient extends FinMindBaseClient {
  getDaily(stockId: string, startDate: string, endDate?: string) {
    return this.query<TwStockPriceRow>('TaiwanStockPrice', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  getAdjusted(stockId: string, startDate: string, endDate?: string) {
    return this.query<TwStockPriceRow>('TaiwanStockPriceAdj', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  getWeekly(stockId: string, startDate: string, endDate?: string) {
    return this.query<TwStockPriceRow>('TaiwanStockWeekPrice', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  getMonthly(stockId: string, startDate: string, endDate?: string) {
    return this.query<TwStockPriceRow>('TaiwanStockMonthPrice', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  getKBar(stockId: string, startDate: string, endDate?: string) {
    return this.query<TwStockKBarRow>('TaiwanStockKBar', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  getPER(stockId: string, startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanStockPER', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  getDayTrading(stockId: string, startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanStockDayTrading', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  /** 5-second order/execution statistics — Sponsor tier required */
  getMarketIndicators(stockId: string, startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanVariousIndicators5Seconds', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  /** Real-time tick snapshot — Sponsor tier required. Omit stockId for all stocks. */
  getSnapshot(stockId?: string) {
    return this.queryEndpoint<Record<string, unknown>>('taiwan_stock_tick_snapshot', stockId ? { data_id: stockId } : {})
  }

  getInfo(stockId?: string) {
    return this.query<TwStockInfoRow>('TaiwanStockInfo', stockId ? { data_id: stockId } : {})
  }
}
