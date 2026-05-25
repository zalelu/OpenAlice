/**
 * Currency / FX AI tools.
 *
 * Wraps `currencyClient` (typebb / OpenBB-backed) for FX historical and
 * snapshot queries. Useful for macro-impact analysis (USD/TWD against
 * Taiwanese exporters, DXY against US tech, JPY against carry trades).
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { CurrencyClientLike } from '@/domain/market-data/client/types'

export function createCurrencyTools(currencyClient: CurrencyClientLike) {
  return {
    currencyGetHistorical: tool({
      description: `Get historical FX rates for a currency pair.

Symbol format depends on provider:
  - yfinance:  "USDTWD=X", "EURUSD=X", "JPY=X"
  - fmp:       "USDTWD", "EURUSD"

Returns daily OHLC rates between startDate and endDate.

Common pairs:
  - USDTWD: 美元/台幣 — affects Taiwan exporters' margins
  - DXY (DX-Y.NYB on yfinance): 美元指數 — broad USD strength
  - USDJPY: 日圓套利交易溫度計
  - EURUSD: 歐美利差感應器`,
      inputSchema: z.object({
        symbol: z.string().describe('Currency pair, e.g. "USDTWD=X" or "EURUSD"'),
        startDate: z.string().describe('Start date YYYY-MM-DD'),
        endDate: z.string().optional().describe('End date YYYY-MM-DD (default: today)'),
      }),
      execute: async ({ symbol, startDate, endDate }) => {
        try {
          const params: Record<string, unknown> = { symbol, start_date: startDate }
          if (endDate) params.end_date = endDate
          return await currencyClient.getHistorical(params)
        } catch (err) {
          return { error: (err as Error).message }
        }
      },
    }),

    currencyGetSnapshot: tool({
      description: `Get latest snapshot quotes for one or more currency pairs.
Returns current rate plus daily change. Use for quick "where is USD/TWD now" checks.`,
      inputSchema: z.object({
        symbols: z.string().describe('Comma-separated pairs, e.g. "USDTWD=X,EURUSD=X"'),
      }),
      execute: async ({ symbols }) => {
        try {
          return await currencyClient.getSnapshots({ symbols })
        } catch (err) {
          return { error: (err as Error).message }
        }
      },
    }),
  }
}
