import { ItemConfig } from '@shared/schema'
import { BaseWsAdapter } from './baseWsAdapter'

interface GateioConfig {
  id: 'gateio-spot' | 'gateio-perp'
  baseUrl: string
  channel: 'spot.tickers' | 'futures.tickers'
  restTickerUrl: (symbol: string) => string
}

// Self-healing poll: if a symbol has not received a tick within
// POLL_REFETCH_THRESHOLD_MS, refetch the REST snapshot. Low-liquidity pairs
// (e.g., NUMI_USDT) get few or no WS pushes, so without this they would
// freeze on the initial snapshot — or get stuck on `-` if that REST call
// silently failed.
const POLL_CHECK_MS = 15_000
const POLL_REFETCH_THRESHOLD_MS = 30_000

export class GateioAdapter extends BaseWsAdapter {
  readonly id: 'gateio-spot' | 'gateio-perp'

  // itemId -> gate.io symbol (e.g., "BTC_USDT")
  private itemToSymbol = new Map<string, string>()
  // symbol -> set of itemIds
  private symbolToItems = new Map<string, Set<string>>()
  // symbol -> last tick timestamp (REST or WS); used by poll timer to detect
  // silent symbols.
  private lastTickTs = new Map<string, number>()
  private pollTimer: NodeJS.Timeout | null = null

  constructor(private cfg: GateioConfig) {
    super()
    this.id = cfg.id
  }

  subscribe(item: ItemConfig): void {
    const symbol = this.itemToGateSymbol(item)
    this.itemToSymbol.set(item.id, symbol)
    let set = this.symbolToItems.get(symbol)
    const isNew = !set
    if (!set) {
      set = new Set()
      this.symbolToItems.set(symbol, set)
    }
    set.add(item.id)

    if (isNew) {
      this.connectIfNeeded()
      this.sendSubscribe([symbol])
      // Gate.io's tickers channel only pushes on trade events; for low-liquidity
      // pairs the first WS update can take minutes. Fetch a one-shot REST
      // snapshot so the validate timeout sees a tick immediately.
      void this.fetchInitialTick(symbol)
      this.ensurePollTimer()
    }
  }

  unsubscribe(itemId: string): void {
    const symbol = this.itemToSymbol.get(itemId)
    if (!symbol) return
    this.itemToSymbol.delete(itemId)
    const set = this.symbolToItems.get(symbol)
    if (set) {
      set.delete(itemId)
      if (set.size === 0) {
        this.symbolToItems.delete(symbol)
        this.lastTickTs.delete(symbol)
        this.sendUnsubscribe([symbol])
      }
    }
    if (this.symbolToItems.size === 0) {
      this.closeWs()
      this.stopPollTimer()
    }
  }

  protected getWsUrl(): string {
    return this.cfg.baseUrl
  }

  protected hasSubscriptions(): boolean {
    return this.symbolToItems.size > 0
  }

  protected onWsOpen(): void {
    const symbols = Array.from(this.symbolToItems.keys())
    if (symbols.length) {
      this.sendSubscribe(symbols)
      // After (re)connect, refetch REST snapshots so the UI recovers
      // immediately rather than waiting for the next WS push (which may
      // never come for low-liquidity pairs).
      for (const symbol of symbols) void this.fetchInitialTick(symbol)
    }
  }

  protected onDestroy(): void {
    this.stopPollTimer()
  }

  protected handleMessage(msg: unknown): void {
    const obj = msg as {
      event?: string
      channel?: string
      result?: unknown
    } | null
    if (obj?.event !== 'update') return
    if (obj?.channel !== this.cfg.channel) return
    const result = obj.result
    const records = (Array.isArray(result) ? result : [result]) as Array<{
      currency_pair?: string
      contract?: string
      last?: unknown
      change_percentage?: unknown
    }>
    const ts = Date.now()
    for (const r of records) {
      const symbol = r?.currency_pair ?? r?.contract
      const price = Number(r?.last)
      const changePct = Number(r?.change_percentage)
      if (!symbol || !Number.isFinite(price)) continue
      const items = this.symbolToItems.get(symbol)
      if (!items) continue
      const finalChange = Number.isFinite(changePct) ? changePct : 0
      this.lastTickTs.set(symbol, ts)
      for (const itemId of items) {
        this.emit('tick', itemId, { symbol, price, changePct: finalChange, ts })
      }
    }
  }

  private async fetchInitialTick(symbol: string): Promise<void> {
    try {
      const res = await fetch(this.cfg.restTickerUrl(symbol))
      if (!res.ok) {
        console.warn(`[${this.id}] REST ${symbol} failed: HTTP ${res.status}`)
        // Gate.io는 invalid currency pair에 HTTP 400 반환 → 즉시 itemError emit해서
        // validate의 5초 timeout 회피.
        if (res.status === 400) {
          const items = this.symbolToItems.get(symbol)
          if (items) {
            for (const itemId of items) {
              this.emit('itemError', itemId, `${this.id}에 없는 심볼입니다`)
            }
          }
        }
        return
      }
      const data = (await res.json()) as unknown
      const arr = Array.isArray(data) ? data : [data]
      const r = arr[0] as { last?: unknown; change_percentage?: unknown } | undefined
      if (!r) {
        console.warn(`[${this.id}] REST ${symbol} returned empty payload`)
        return
      }
      const price = Number(r.last)
      const changePct = Number(r.change_percentage)
      if (!Number.isFinite(price) || price <= 0) {
        console.warn(`[${this.id}] REST ${symbol} invalid last="${r.last}"`)
        return
      }
      const items = this.symbolToItems.get(symbol)
      if (!items) return
      const ts = Date.now()
      const finalChange = Number.isFinite(changePct) ? changePct : 0
      this.lastTickTs.set(symbol, ts)
      for (const itemId of items) {
        this.emit('tick', itemId, { symbol, price, changePct: finalChange, ts })
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string } | null)?.message ?? String(err)
      console.warn(`[${this.id}] REST ${symbol} threw:`, msg)
    }
  }

  private ensurePollTimer(): void {
    if (this.pollTimer) return
    this.pollTimer = setInterval(() => {
      const now = Date.now()
      for (const symbol of this.symbolToItems.keys()) {
        const last = this.lastTickTs.get(symbol) ?? 0
        if (now - last > POLL_REFETCH_THRESHOLD_MS) {
          void this.fetchInitialTick(symbol)
        }
      }
    }, POLL_CHECK_MS)
  }

  private stopPollTimer(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private itemToGateSymbol(item: ItemConfig): string {
    const quote = (item.quoteCurrency ?? 'USDT').toUpperCase()
    const base = item.symbol.toUpperCase()
    return `${base}_${quote}`
  }

  private sendSubscribe(symbols: string[]): void {
    this.sendWs({
      time: Math.floor(Date.now() / 1000),
      channel: this.cfg.channel,
      event: 'subscribe',
      payload: symbols,
    })
  }

  private sendUnsubscribe(symbols: string[]): void {
    this.sendWs({
      time: Math.floor(Date.now() / 1000),
      channel: this.cfg.channel,
      event: 'unsubscribe',
      payload: symbols,
    })
  }
}

export function createGateioSpot(): GateioAdapter {
  return new GateioAdapter({
    id: 'gateio-spot',
    baseUrl: 'wss://api.gateio.ws/ws/v4/',
    channel: 'spot.tickers',
    restTickerUrl: (sym) =>
      `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${encodeURIComponent(sym)}`,
  })
}

export function createGateioPerp(): GateioAdapter {
  return new GateioAdapter({
    id: 'gateio-perp',
    baseUrl: 'wss://fx-ws.gateio.ws/v4/ws/usdt/',
    channel: 'futures.tickers',
    restTickerUrl: (sym) =>
      `https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${encodeURIComponent(sym)}`,
  })
}
