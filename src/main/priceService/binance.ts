import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import { AdapterStatus, ItemConfig } from '@shared/schema'
import { PriceAdapter } from './types'

interface BinanceConfig {
  id: 'binance-spot' | 'binance-perp'
  baseUrl: string
  restTickerUrl: (symbol: string) => string
}

const RECONNECT_INITIAL_MS = 1000
const RECONNECT_MAX_MS = 30_000
// Self-healing poll: see gateio.ts for rationale. Binance ticker streams are
// active for major pairs, but symmetry with Gate.io guards against silent
// REST failures and dead WS subscriptions on edge symbols.
const POLL_CHECK_MS = 15_000
const POLL_REFETCH_THRESHOLD_MS = 30_000

export class BinanceAdapter extends EventEmitter implements PriceAdapter {
  readonly id: 'binance-spot' | 'binance-perp'
  private ws: WebSocket | null = null
  private currentStatus: AdapterStatus = 'closed'
  private reconnectDelayMs = RECONNECT_INITIAL_MS
  private reconnectTimer: NodeJS.Timeout | null = null
  private msgIdCounter = 1
  private destroyed = false

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

  subscribe(item: ItemConfig) {
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

  private async fetchInitialTick(stream: string) {
    const symbolUpper = stream.replace(/@ticker$/, '').toUpperCase()
    try {
      const res = await fetch(this.cfg.restTickerUrl(symbolUpper))
      if (!res.ok) {
        console.warn(`[${this.id}] REST ${symbolUpper} failed: HTTP ${res.status}`)
        return
      }
      const data = (await res.json()) as any
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
    } catch (err: any) {
      console.warn(`[${this.id}] REST ${symbolUpper} threw:`, err?.message ?? err)
    }
  }

  private ensurePollTimer() {
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

  private stopPollTimer() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  unsubscribe(itemId: string) {
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

  status() {
    return this.currentStatus
  }

  async destroy() {
    this.destroyed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.stopPollTimer()
    this.closeWs()
  }

  private itemToStreamKey(item: ItemConfig): string {
    const quote = (item.quoteCurrency ?? 'USDT').toUpperCase()
    const base = item.symbol.toUpperCase()
    const sym = `${base}${quote}`.toLowerCase()
    return `${sym}@ticker`
  }

  private connectIfNeeded() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    if (this.destroyed) return
    this.setStatus('connecting')
    this.ws = new WebSocket(this.cfg.baseUrl)

    this.ws.on('open', () => {
      this.setStatus('open')
      this.reconnectDelayMs = RECONNECT_INITIAL_MS
      const streams = Array.from(this.streamToItems.keys())
      if (streams.length) {
        this.sendSubscribe(streams)
        // After (re)connect, refetch REST so the UI recovers immediately.
        for (const stream of streams) void this.fetchInitialTick(stream)
      }
    })

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data))
        this.handleMessage(msg)
      } catch {
        // ignore non-JSON frames (pings handled by ws automatically)
      }
    })

    this.ws.on('close', () => {
      this.ws = null
      if (!this.destroyed && this.streamToItems.size > 0) {
        this.setStatus('reconnecting')
        this.scheduleReconnect()
      } else {
        this.setStatus('closed')
      }
    })

    this.ws.on('error', () => {
      // close handler will run reconnect
    })
  }

  private handleMessage(msg: any) {
    // Combined stream payload: { stream: "btcusdt@ticker", data: {...} }
    const stream: string | undefined = msg?.stream
    const data = msg?.data
    if (!stream || !data) return
    const items = this.streamToItems.get(stream)
    if (!items || items.size === 0) return

    const price = Number(data.c)
    const changePct = Number(data.P)
    if (!Number.isFinite(price) || !Number.isFinite(changePct)) return
    const ts = Date.now()
    this.lastTickTs.set(stream, ts)
    for (const itemId of items) {
      this.emit('tick', itemId, { symbol: data.s, price, changePct, ts })
    }
  }

  private sendSubscribe(streams: string[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(
      JSON.stringify({ method: 'SUBSCRIBE', params: streams, id: this.msgIdCounter++ })
    )
  }

  private sendUnsubscribe(streams: string[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(
      JSON.stringify({ method: 'UNSUBSCRIBE', params: streams, id: this.msgIdCounter++ })
    )
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_MS)
      this.connectIfNeeded()
    }, this.reconnectDelayMs)
  }

  private closeWs() {
    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        // ignore
      }
      this.ws = null
    }
  }

  private setStatus(s: AdapterStatus, message?: string) {
    if (s === this.currentStatus) return
    this.currentStatus = s
    this.emit('status', s, message)
  }
}

export function createBinanceSpot(): BinanceAdapter {
  return new BinanceAdapter({
    id: 'binance-spot',
    baseUrl: 'wss://stream.binance.com:9443/stream',
    restTickerUrl: (sym) =>
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(sym)}`
  })
}

export function createBinancePerp(): BinanceAdapter {
  return new BinanceAdapter({
    id: 'binance-perp',
    baseUrl: 'wss://fstream.binance.com/stream',
    restTickerUrl: (sym) =>
      `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(sym)}`
  })
}
