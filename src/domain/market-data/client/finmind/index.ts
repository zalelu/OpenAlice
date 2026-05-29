export { FinMindBaseClient } from './base-client.js'
export { TaiwanPriceClient } from './price-client.js'
export type { TwStockPriceRow, TwStockKBarRow, TwStockInfoRow } from './price-client.js'
export { TaiwanChipsClient } from './chips-client.js'
export type { TwMarginRow, TwInstitutionalRow } from './chips-client.js'
export { TaiwanFundamentalClient } from './fundamental-client.js'
export type { TwMonthRevenueRow, TwDividendRow } from './fundamental-client.js'
export { TaiwanDerivativesClient } from './derivatives-client.js'

import { TaiwanPriceClient } from './price-client.js'
import { TaiwanChipsClient } from './chips-client.js'
import { TaiwanFundamentalClient } from './fundamental-client.js'
import { TaiwanDerivativesClient } from './derivatives-client.js'

export class FinMindClient {
  readonly price: TaiwanPriceClient
  readonly chips: TaiwanChipsClient
  readonly fundamental: TaiwanFundamentalClient
  readonly derivatives: TaiwanDerivativesClient

  constructor(token: string) {
    this.price = new TaiwanPriceClient(token)
    this.chips = new TaiwanChipsClient(token)
    this.fundamental = new TaiwanFundamentalClient(token)
    this.derivatives = new TaiwanDerivativesClient(token)
  }
}

export function createFinMindClient(): FinMindClient {
  const token = process.env.FINMIND_TOKEN ?? ''
  if (!token) console.warn('finmind: FINMIND_TOKEN not set — API calls will be rate-limited')
  return new FinMindClient(token)
}
