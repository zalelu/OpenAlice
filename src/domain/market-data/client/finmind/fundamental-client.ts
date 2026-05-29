import { FinMindBaseClient } from './base-client.js'

export interface TwMonthRevenueRow {
  date: string
  stock_id: string
  country: string
  revenue: number
  revenue_month: number
  revenue_year: number
}

export interface TwDividendRow {
  date: string
  stock_id: string
  year: number
  StockEarningsDistribution: number
  StockStatutoryReserve: number
  StockSurplusReserve: number
  StockSpecialReserve: number
  StockDirectorCompensation: number
  CashEarningsDistribution: number
  CashStatutoryReserve: number
  CashSurplusReserve: number
  CashSpecialReserve: number
  CashDirectorCompensation: number
  CashCapitalReserveDistribution: number
  StockCapitalReserveDistribution: number
  EmployeeBonus: number
}

export class TaiwanFundamentalClient extends FinMindBaseClient {
  /** 月營收 — monthly revenue (date format: YYYY-MM-01) */
  getMonthRevenue(stockId: string, startDate: string, endDate?: string) {
    return this.query<TwMonthRevenueRow>('TaiwanStockMonthRevenue', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  /** 綜合損益表 — income statement (quarterly) */
  getFinancialStatements(stockId: string, startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanStockFinancialStatements', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  /** 資產負債表 — balance sheet */
  getBalanceSheet(stockId: string, startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanStockBalanceSheet', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  /** 現金流量表 — cash flow statement */
  getCashFlow(stockId: string, startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanStockCashFlowsStatement', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  /** 股利政策 — announced dividend policy per year */
  getDividend(stockId: string) {
    return this.query<TwDividendRow>('TaiwanStockDividend', { data_id: stockId })
  }

  /** 除權除息 — ex-dividend/ex-rights results (actual payout dates and amounts) */
  getDividendResult(stockId: string, startDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanStockDividendResult', { data_id: stockId, start_date: startDate })
  }

  /** 市值 — daily market capitalisation */
  getMarketValue(stockId: string, startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanStockMarketValue', { data_id: stockId, start_date: startDate, end_date: endDate })
  }

  /** 本益比 — daily P/E, P/B, dividend yield */
  getPER(stockId: string, startDate: string, endDate?: string) {
    return this.query<Record<string, unknown>>('TaiwanStockPER', { data_id: stockId, start_date: startDate, end_date: endDate })
  }
}
