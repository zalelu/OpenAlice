/**
 * Taiwan-market AI tools.
 *
 * Read-only data layer — no broker/account dependency. Wraps TWSE/TPEX
 * public endpoints (real-time + post-close OHLCV) and FinMind (chip
 * data: institutional flow, margin/short, monthly revenue).
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TwseClient } from '@/domain/market-data/taiwan/twse-client'
import type { FinMindClient } from '@/domain/market-data/taiwan/finmind-client'

const SYMBOL = z.string().regex(/^\d{4,6}$/).describe('Taiwan stock code, e.g. "2330" (TSMC), "0050" (元大台灣50), "5483" (中美晶, OTC)')

export function createTaiwanTools(twse: TwseClient, finmind: FinMindClient) {
  return {
    taiwanGetQuote: tool({
      description: `Get a real-time quote for a Taiwan-listed stock (上市/上櫃).
Source: TWSE/TPEX MIS — refreshes every ~5s during market hours (09:00–13:30 Taipei),
freezes at the official close after 13:30. Auto-detects TSE vs OTC.

Use this for "current price" / "今天股價" / "盤後收盤" questions on Taiwan equities.`,
      inputSchema: z.object({ symbol: SYMBOL }),
      execute: async ({ symbol }) => {
        try {
          return await twse.getQuote(symbol)
        } catch (err) {
          return { error: (err as Error).message }
        }
      },
    }),

    taiwanGetHistory: tool({
      description: `Get historical daily OHLCV for a Taiwan-listed stock (post-close only).
Source: TWSE STOCK_DAY / TPEX daily report. Returns calendar-day bars.
Range cap: roughly 24 months. Use shorter ranges (e.g., 30–90 days) for analysis.`,
      inputSchema: z.object({
        symbol: SYMBOL,
        startDate: z.string().describe('Start date YYYY-MM-DD'),
        endDate: z.string().optional().describe('End date YYYY-MM-DD (default: today)'),
      }),
      execute: async ({ symbol, startDate, endDate }) => {
        try {
          return await twse.getHistorical(symbol, startDate, endDate)
        } catch (err) {
          return { error: (err as Error).message }
        }
      },
    }),

    taiwanGetInstitutional: tool({
      description: `Get institutional investor (三大法人: 外資/投信/自營商) buy-sell activity for a Taiwan stock.
Source: FinMind. Updates daily after market close. Use to gauge smart-money flow.`,
      inputSchema: z.object({
        symbol: SYMBOL,
        startDate: z.string().describe('Start date YYYY-MM-DD'),
        endDate: z.string().optional().describe('End date YYYY-MM-DD (default: latest)'),
      }),
      execute: async ({ symbol, startDate, endDate }) => {
        try {
          return await finmind.getInstitutionalInvestors(symbol, startDate, endDate)
        } catch (err) {
          return { error: (err as Error).message }
        }
      },
    }),

    taiwanGetMarginShort: tool({
      description: `Get margin financing and short-selling balances (融資融券) for a Taiwan stock.
Source: FinMind. Useful for retail-leverage signals — rapid margin growth + flat price often precedes squeezes.`,
      inputSchema: z.object({
        symbol: SYMBOL,
        startDate: z.string().describe('Start date YYYY-MM-DD'),
        endDate: z.string().optional().describe('End date YYYY-MM-DD'),
      }),
      execute: async ({ symbol, startDate, endDate }) => {
        try {
          return await finmind.getMarginShort(symbol, startDate, endDate)
        } catch (err) {
          return { error: (err as Error).message }
        }
      },
    }),

    taiwanGetMonthlyRevenue: tool({
      description: `Get monthly revenue (月營收) for a Taiwan-listed company.
Source: FinMind (originated from TWSE/TPEX official filings, published ~10th of next month).
Key fundamental data point for Taiwan stocks — YoY growth is heavily watched.`,
      inputSchema: z.object({
        symbol: SYMBOL,
        startDate: z.string().describe('Start date YYYY-MM-DD'),
      }),
      execute: async ({ symbol, startDate }) => {
        try {
          return await finmind.getMonthlyRevenue(symbol, startDate)
        } catch (err) {
          return { error: (err as Error).message }
        }
      },
    }),

    taiwanGetMacro: tool({
      description: `Fetch macro / cross-asset data series from FinMind.

Available indicators (free tier):
  - "InterestRate"           : 各國基準利率 — REQUIRES dataId (e.g. "FED", "ECB", "BOJ", "PBoC")
                               sparse data (only on rate-change events)
  - "GovernmentBondsYield"   : 各國公債殖利率 — REQUIRES dataId (series code)
                               台灣 10Y 通常需付費版，美國 10Y 改用 FRED "DGS10"
  - "CrudeOilPrices"         : WTI / Brent 原油 (no dataId needed)
  - "GoldPrice"              : 黃金現貨 (no dataId needed)
  - "CnnFearGreedIndex"      : CNN 恐懼貪婪指數 (no dataId needed)

⚠️ Taiwan CPI / GDP / 失業率 / 央行外匯存底 are NOT available via FinMind free tier.
   For Taiwan-specific macro NOT in this list, use FRED (economyFredSearch + economyFredSeries) —
   FRED has limited Taiwan coverage. For USD/TWD or other FX, use currencyGetHistorical with
   yfinance symbol (e.g. "USDTWD=X").`,
      inputSchema: z.object({
        indicator: z.enum([
          'InterestRate',
          'GovernmentBondsYield',
          'CrudeOilPrices',
          'GoldPrice',
          'CnnFearGreedIndex',
        ]).describe('Macro indicator dataset name'),
        startDate: z.string().describe('Start date YYYY-MM-DD'),
        endDate: z.string().optional().describe('End date YYYY-MM-DD (default: latest)'),
        dataId: z.string().optional().describe('Required for InterestRate (e.g. "FED") and GovernmentBondsYield. Omit for others.'),
      }),
      execute: async ({ indicator, startDate, endDate, dataId }) => {
        try {
          return await finmind.getMacro(indicator, startDate, endDate, dataId)
        } catch (err) {
          return { error: (err as Error).message }
        }
      },
    }),
  }
}
