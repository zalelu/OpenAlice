const FINMIND_BASE = 'https://api.finmindtrade.com/api/v4'

interface FinMindEnvelope<T> {
  msg: string
  status: number
  data: T[]
}

type Params = Record<string, string | number | undefined>

export class FinMindBaseClient {
  constructor(protected readonly token: string) {}

  protected async query<T>(dataset: string, params: Params = {}): Promise<T[]> {
    const url = new URL(`${FINMIND_BASE}/data`)
    url.searchParams.set('dataset', dataset)
    if (this.token) url.searchParams.set('token', this.token)
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`FinMind HTTP ${res.status}: ${res.statusText}`)
    const json = await res.json() as FinMindEnvelope<T>
    if (json.status !== 200) throw new Error(`FinMind: ${json.msg} (status ${json.status})`)
    return json.data
  }

  protected async queryEndpoint<T>(path: string, params: Params = {}): Promise<T[]> {
    const url = new URL(`${FINMIND_BASE}/${path}`)
    if (this.token) url.searchParams.set('token', this.token)
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`FinMind HTTP ${res.status}: ${res.statusText}`)
    const json = await res.json() as FinMindEnvelope<T>
    if (json.status !== 200) throw new Error(`FinMind: ${json.msg} (status ${json.status})`)
    return json.data
  }
}
