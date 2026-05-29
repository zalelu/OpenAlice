import { FinMindBaseClient } from './base-client.js'

export interface TwMarginRow {
  date: string
  stock_id: string
  MarginPurchaseBuy: number
  MarginPurchaseSell: number
  MarginPurchaseCashRepayment: number
  MarginPurchaseYesterdayBalance: number
  MarginPurchaseTodayBalance: number
  /** 融資上限 */
  MarginPurchaseLimit: number
  ShortSaleBuy: number
  ShortSaleSell: number
  ShortSaleCashRepayment: number
  ShortSaleYesterdayBalance: number
  ShortSaleTodayBalance: number
  /** 融券上限 */
  ShortSaleLimit: number
  /** 資券互抵 */
  OffsetLoanAndShort: number
  note: string
}

export interface TwInstitutionalRow {
  date: string
  stock_id: string
  buy: number
  sell: number
  /**
   * Investor type:
   * 'Foreign_Investor' | 'Foreign_Dealer_Self' | 'Investment_Trust' |
   * 'Dealer_self' | 'Dealer_Hedging'
   */
  name: string
}

export class TaiwanChipsClient extends FinMindBaseClient {
  /** 融資融券 — margin purchase & short sale balances */
  getMarginShort(stockId: string, startDate: string, endDate?: string) {
    return this.query<TwMarginRow>('TaiwanStockMarginPurchaseShortSale', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  /** 三大法人買賣超 — Foreign / Investment Trust / Dealer buy-sell */
  getInstitutional(stockId: string, startDate: string, endDate?: string) {
    return this.query<TwInstitutionalRow>('TaiwanStockInstitutionalInvestorsBuySell', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  /** 持股分布 — distribution of shares by holding size bracket */
  getShareholding(stockId: string, startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanStockShareholding', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  /** 持股比例 — top shareholders percentage */
  getShareholdingPct(stockId: string, startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanStockHoldingSharesPer', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  /** 借券賣出 — securities lending transactions */
  getSecuritiesLending(stockId: string, startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanStockSecuritiesLending', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  /** 鉅額交易 — block trades */
  getBlockTrade(stockId: string, startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanStockBlockTrade', { data_id: stockId, start_date: startDate, end_date: endDate })
  }
}
