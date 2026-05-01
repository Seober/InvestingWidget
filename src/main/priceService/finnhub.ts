import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import { AdapterStatus, ItemConfig } from '@shared/schema'
import { PriceAdapter } from './types'

const WS_URL = 'wss://ws.finnhub.io'
const QUOTE_URL = 'https://finnhub.io/api/v1/quote'
const PC_REFRESH_MS = 6 * 60 * 60 * 1000 // 6 hours
const RECONNECT_INITIAL_MS = 1000
const RECONNECT_MAX_MS = 30_000

interface PrevClose {
  pc: number
  fetchedAt: number
}

export class FinnhubAdapter extends EventEmitter implements PriceAdapter {
  readonly id = 'finnhub' as const
  private apiKey: string
  private ws: WebSocket | null = null
  private currentStatus: AdapterStatus = 'closed'
  private reconnectDelayMs = RECONNECT_INITIAL_MS
  private reconnectTimer: NodeJS.Timeout | null = null
  private destroyed = false

  // itemId -> symbol
  private itemToSymbol = new Map<string, string>()
  // symbol -> set of itemIds
  private symbolToItems = new Map<string, Set<string>>()
  // symbol -> previous close
  private prevCloseCache = new Map<string, PrevClose>()
  // symbol -> latest price (so we can re-emit when pc updates)
  private lastPrice = new Map<string, number>()
  // periodic pc refresh
  private pcRefreshTimer: NodeJS.Timeout | null = null

  constructor(apiKey: string) {
    super()
    this.apiKey = apiKey
  }

  setApiKey(key: string) {
    if (key === this.apiKey) return
    this.apiKey = key
    if (this.ws) {
      this.closeWs()
    }
    if (this.symbolToItems.size > 0 && this.apiKey) {
      this.connectIfNeeded()
    }
  }

  subscribe(item: ItemConfig) {
    const symbol = item.symbol.toUpperCase()
    this.itemToSymbol.set(item.id, symbol)
    let set = this.symbolToItems.get(symbol)
    const isNew = !set
    if (!set) {
      set = new Set()
      this.symbolToItems.set(symbol, set)
    }
    set.add(item.id)

    if (!this.apiKey) {
      this.emit('itemError', item.id, 'Finnhub API 키가 필요합니다 (설정에서 입력)')
      return
    }

    if (isNew) {
      void this.fetchPrevClose(symbol)
      this.connectIfNeeded()
      this.sendSubscribe(symbol)
    } else {
      const cached = this.prevCloseCache.get(symbol)
      const last = this.lastPrice.get(symbol)
      if (cached && last !== undefined) {
        this.emitTickFor(item.id, symbol, last, cached.pc)
      }
    }
    this.ensurePcRefreshTimer()
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
        this.lastPrice.delete(symbol)
        this.prevCloseCache.delete(symbol)
        this.sendUnsubscribe(symbol)
      }
    }
    if (this.symbolToItems.size === 0) {
      this.closeWs()
      this.stopPcRefreshTimer()
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
    this.stopPcRefreshTimer()
    this.closeWs()
  }

  private connectIfNeeded() {
    if (!this.apiKey) return
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    if (this.destroyed) return
    this.setStatus('connecting')
    this.ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(this.apiKey)}`)

    this.ws.on('open', () => {
      this.setStatus('open')
      this.reconnectDelayMs = RECONNECT_INITIAL_MS
      for (const sym of this.symbolToItems.keys()) {
        this.sendSubscribe(sym)
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
      if (!this.destroyed && this.symbolToItems.size > 0 && this.apiKey) {
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
    if (msg?.type !== 'trade' || !Array.isArray(msg.data)) return
    const ts = Date.now()
    const latestPerSymbol = new Map<string, number>()
    for (const t of msg.data) {
      const sym: string = t.s
      const price = Number(t.p)
      if (!sym || !Number.isFinite(price)) continue
      latestPerSymbol.set(sym, price)
    }
    for (const [sym, price] of latestPerSymbol) {
      this.lastPrice.set(sym, price)
      const items = this.symbolToItems.get(sym)
      if (!items) continue
      const cached = this.prevCloseCache.get(sym)
      const pc = cached?.pc
      for (const itemId of items) {
        this.emitTickFor(itemId, sym, price, pc, ts)
      }
    }
  }

  private emitTickFor(itemId: string, symbol: string, price: number, pc: number | undefined, ts = Date.now()) {
    const changePct = pc && pc > 0 ? ((price - pc) / pc) * 100 : 0
    this.emit('tick', itemId, { symbol, price, changePct, ts })
  }

  private async fetchPrevClose(symbol: string) {
    if (!this.apiKey) return
    try {
      const url = `${QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(this.apiKey)}`
      const res = await fetch(url)
      if (!res.ok) return
      const data: any = await res.json()
      const pc = Number(data?.pc)
      const c = Number(data?.c)
      if (!Number.isFinite(pc) || pc <= 0) return
      this.prevCloseCache.set(symbol, { pc, fetchedAt: Date.now() })
      // Prefer freshly-fetched current price; fall back to last seen WS price.
      const initialPrice = Number.isFinite(c) && c > 0 ? c : this.lastPrice.get(symbol)
      if (initialPrice !== undefined) {
        if (Number.isFinite(c) && c > 0) this.lastPrice.set(symbol, c)
        const items = this.symbolToItems.get(symbol)
        if (items) {
          for (const itemId of items) {
            this.emitTickFor(itemId, symbol, initialPrice, pc)
          }
        }
      }
    } catch {
      // network error — will retry on next refresh
    }
  }

  private ensurePcRefreshTimer() {
    if (this.pcRefreshTimer) return
    this.pcRefreshTimer = setInterval(() => {
      const now = Date.now()
      for (const [sym, entry] of this.prevCloseCache) {
        if (now - entry.fetchedAt >= PC_REFRESH_MS) {
          void this.fetchPrevClose(sym)
        }
      }
      for (const sym of this.symbolToItems.keys()) {
        if (!this.prevCloseCache.has(sym)) void this.fetchPrevClose(sym)
      }
    }, 30 * 60 * 1000) // check every 30min
  }

  private stopPcRefreshTimer() {
    if (this.pcRefreshTimer) {
      clearInterval(this.pcRefreshTimer)
      this.pcRefreshTimer = null
    }
  }

  private sendSubscribe(symbol: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ type: 'subscribe', symbol }))
  }

  private sendUnsubscribe(symbol: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }))
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
