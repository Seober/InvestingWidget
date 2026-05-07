import { ItemConfig } from '@shared/schema'
import { BaseWsAdapter } from './baseWsAdapter'

interface BinanceConfig {
  id: 'binance-spot' | 'binance-perp'
  baseUrl: string
  restTickerUrl: (symbol: string) => string
}

// Self-healing poll: see gateio.ts for rationale. Binance ticker streams are
// active for major pairs, but symmetry with Gate.io guards against silent
// REST failures and dead WS subscriptions on edge symbols.
const POLL_CHECK_MS = 15_000
const POLL_REFETCH_THRESHOLD_MS = 30_000

export class BinanceAdapter extends BaseWsAdapter {
  readonly id: 'binance-spot' | 'binance-perp'
  private msgIdCounter = 1

  // itemId -> stream key (e.g. "btcusdt@ticker")
  private itemToStream = new Map<string, string>()
  // stream key -> set of itemIds
  private streamToItems = new Map<string, Set<string>>()
  // stream key -> last tick timestamp
  private lastTickTs = new Map<string, number>()
  private pollTimer: NodeJS.Timeout | null = null

  constructor(private cfg: BinanceConfig) {
    super()
    this.id = cfg.id
  }

  subscribe(item: ItemConfig): void {
    const stream = this.itemToStreamKey(item)
    this.itemToStream.set(item.id, stream)
    let set = this.streamToItems.get(stream)
    const isNewStream = !set
    if (!set) {
      set = new Set()
      this.streamToItems.set(stream, set)
    }
    set.add(item.id)

    if (isNewStream) {
      this.connectIfNeeded()
      this.sendSubscribe([stream])
      void this.fetchInitialTick(stream)
      this.ensurePollTimer()
    }
  }

  unsubscribe(itemId: string): void {
    const stream = this.itemToStream.get(itemId)
    if (!stream) return
    this.itemToStream.delete(itemId)
    const set = this.streamToItems.get(stream)
    if (set) {
      set.delete(itemId)
      if (set.size === 0) {
        this.streamToItems.delete(stream)
        this.lastTickTs.delete(stream)
        this.sendUnsubscribe([stream])
      }
    }
    if (this.streamToItems.size === 0) {
      this.closeWs()
      this.stopPollTimer()
    }
  }

  protected getWsUrl(): string {
    return this.cfg.baseUrl
  }

  protected hasSubscriptions(): boolean {
    return this.streamToItems.size > 0
  }

  protected onWsOpen(): void {
    const streams = Array.from(this.streamToItems.keys())
    if (streams.length) {
      this.sendSubscribe(streams)
      // After (re)connect, refetch REST so the UI recovers immediately.
      for (const stream of streams) void this.fetchInitialTick(stream)
    }
  }

  protected onDestroy(): void {
    this.stopPollTimer()
  }

  protected handleMessage(msg: unknown): void {
    // Combined stream payload: { stream: "btcusdt@ticker", data: {...} }
    const obj = msg as { stream?: string; data?: { c?: unknown; P?: unknown; s?: string } } | null
    const stream = obj?.stream
    const data = obj?.data
    if (!stream || !data) return
    const items = this.streamToItems.get(stream)
    if (!items || items.size === 0) return

    const price = Number(data.c)
    const changePct = Number(data.P)
    if (!Number.isFinite(price) || !Number.isFinite(changePct)) return
    const ts = Date.now()
    this.lastTickTs.set(stream, ts)
    for (const itemId of items) {
      this.emit('tick', itemId, { symbol: data.s ?? '', price, changePct, ts })
    }
  }

  private async fetchInitialTick(stream: string): Promise<void> {
    const symbolUpper = stream.replace(/@ticker$/, '').toUpperCase()
    try {
      const res = await fetch(this.cfg.restTickerUrl(symbolUpper))
      if (!res.ok) {
        console.warn(`[${this.id}] REST ${symbolUpper} failed: HTTP ${res.status}`)
        // Invalid symbol (HTTP 400) → fast-fail subscribed items so validate's
        // tryAdapter doesn't wait the full 5s timeout before falling back.
        // WS for invalid streams stays silent indefinitely.
        if (res.status === 400) {
          const items = this.streamToItems.get(stream)
          if (items) {
            for (const itemId of items) {
              this.emit('itemError', itemId, `${this.id}에 없는 심볼입니다`)
            }
          }
        }
        return
      }
      const data = (await res.json()) as { lastPrice?: unknown; priceChangePercent?: unknown }
      const price = Number(data?.lastPrice)
      const changePct = Number(data?.priceChangePercent)
      if (!Number.isFinite(price) || price <= 0) {
        console.warn(`[${this.id}] REST ${symbolUpper} invalid lastPrice="${data?.lastPrice}"`)
        return
      }
      const items = this.streamToItems.get(stream)
      if (!items) return
      const ts = Date.now()
      const finalChange = Number.isFinite(changePct) ? changePct : 0
      this.lastTickTs.set(stream, ts)
      for (const itemId of items) {
        this.emit('tick', itemId, { symbol: symbolUpper, price, changePct: finalChange, ts })
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string } | null)?.message ?? String(err)
      console.warn(`[${this.id}] REST ${symbolUpper} threw:`, msg)
    }
  }

  private ensurePollTimer(): void {
    if (this.pollTimer) return
    this.pollTimer = setInterval(() => {
      const now = Date.now()
      for (const stream of this.streamToItems.keys()) {
        const last = this.lastTickTs.get(stream) ?? 0
        if (now - last > POLL_REFETCH_THRESHOLD_MS) {
          void this.fetchInitialTick(stream)
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

  private itemToStreamKey(item: ItemConfig): string {
    const quote = (item.quoteCurrency ?? 'USDT').toUpperCase()
    const base = item.symbol.toUpperCase()
    const sym = `${base}${quote}`.toLowerCase()
    return `${sym}@ticker`
  }

  private sendSubscribe(streams: string[]): void {
    this.sendWs({ method: 'SUBSCRIBE', params: streams, id: this.msgIdCounter++ })
  }

  private sendUnsubscribe(streams: string[]): void {
    this.sendWs({ method: 'UNSUBSCRIBE', params: streams, id: this.msgIdCounter++ })
  }
}

export function createBinanceSpot(): BinanceAdapter {
  return new BinanceAdapter({
    id: 'binance-spot',
    baseUrl: 'wss://stream.binance.com:9443/stream',
    restTickerUrl: (sym) =>
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(sym)}`,
  })
}

export function createBinancePerp(): BinanceAdapter {
  return new BinanceAdapter({
    id: 'binance-perp',
    baseUrl: 'wss://fstream.binance.com/stream',
    restTickerUrl: (sym) =>
      `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(sym)}`,
  })
}
