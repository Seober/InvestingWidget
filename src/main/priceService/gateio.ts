import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import { AdapterStatus, ItemConfig } from '@shared/schema'
import { PriceAdapter } from './types'

interface GateioConfig {
  id: 'gateio-spot' | 'gateio-perp'
  baseUrl: string
  channel: 'spot.tickers' | 'futures.tickers'
  restTickerUrl: (symbol: string) => string
}

const RECONNECT_INITIAL_MS = 1000
const RECONNECT_MAX_MS = 30_000
// Self-healing poll: if a symbol has not received a tick within
// POLL_REFETCH_THRESHOLD_MS, refetch the REST snapshot. Low-liquidity pairs
// (e.g., NUMI_USDT) get few or no WS pushes, so without this they would
// freeze on the initial snapshot — or get stuck on `-` if that REST call
// silently failed.
const POLL_CHECK_MS = 15_000
const POLL_REFETCH_THRESHOLD_MS = 30_000

export class GateioAdapter extends EventEmitter implements PriceAdapter {
  readonly id: 'gateio-spot' | 'gateio-perp'
  private ws: WebSocket | null = null
  private currentStatus: AdapterStatus = 'closed'
  private reconnectDelayMs = RECONNECT_INITIAL_MS
  private reconnectTimer: NodeJS.Timeout | null = null
  private destroyed = false

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

  subscribe(item: ItemConfig) {
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

  private async fetchInitialTick(symbol: string) {
    try {
      const res = await fetch(this.cfg.restTickerUrl(symbol))
      if (!res.ok) {
        console.warn(`[${this.id}] REST ${symbol} failed: HTTP ${res.status}`)
        return
      }
      const data = (await res.json()) as any
      const arr = Array.isArray(data) ? data : [data]
      const r = arr[0]
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
    } catch (err: any) {
      console.warn(`[${this.id}] REST ${symbol} threw:`, err?.message ?? err)
    }
  }

  private ensurePollTimer() {
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

  private stopPollTimer() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  unsubscribe(itemId: string) {
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

  private itemToGateSymbol(item: ItemConfig): string {
    const quote = (item.quoteCurrency ?? 'USDT').toUpperCase()
    const base = item.symbol.toUpperCase()
    return `${base}_${quote}`
  }

  private connectIfNeeded() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    if (this.destroyed) return
    this.setStatus('connecting')
    this.ws = new WebSocket(this.cfg.baseUrl)

    this.ws.on('open', () => {
      this.setStatus('open')
      this.reconnectDelayMs = RECONNECT_INITIAL_MS
      const symbols = Array.from(this.symbolToItems.keys())
      if (symbols.length) {
        this.sendSubscribe(symbols)
        // After (re)connect, refetch REST snapshots so the UI recovers
        // immediately rather than waiting for the next WS push (which may
        // never come for low-liquidity pairs).
        for (const symbol of symbols) void this.fetchInitialTick(symbol)
      }
    })

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data))
        this.handleMessage(msg)
      } catch {
        // ignore
      }
    })

    this.ws.on('close', () => {
      this.ws = null
      if (!this.destroyed && this.symbolToItems.size > 0) {
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
    if (msg?.event !== 'update') return
    if (msg?.channel !== this.cfg.channel) return
    const result = msg.result
    const records = Array.isArray(result) ? result : [result]
    const ts = Date.now()
    for (const r of records) {
      const symbol: string | undefined = r?.currency_pair ?? r?.contract
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

  private sendSubscribe(symbols: string[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(
      JSON.stringify({
        time: Math.floor(Date.now() / 1000),
        channel: this.cfg.channel,
        event: 'subscribe',
        payload: symbols
      })
    )
  }

  private sendUnsubscribe(symbols: string[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(
      JSON.stringify({
        time: Math.floor(Date.now() / 1000),
        channel: this.cfg.channel,
        event: 'unsubscribe',
        payload: symbols
      })
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

export function createGateioSpot(): GateioAdapter {
  return new GateioAdapter({
    id: 'gateio-spot',
    baseUrl: 'wss://api.gateio.ws/ws/v4/',
    channel: 'spot.tickers',
    restTickerUrl: (sym) =>
      `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${encodeURIComponent(sym)}`
  })
}

export function createGateioPerp(): GateioAdapter {
  return new GateioAdapter({
    id: 'gateio-perp',
    baseUrl: 'wss://fx-ws.gateio.ws/v4/ws/usdt/',
    channel: 'futures.tickers',
    restTickerUrl: (sym) =>
      `https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${encodeURIComponent(sym)}`
  })
}
