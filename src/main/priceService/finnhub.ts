import { ItemConfig } from '@shared/schema'
import { BaseWsAdapter } from './baseWsAdapter'

const WS_URL = 'wss://ws.finnhub.io'
const QUOTE_URL = 'https://finnhub.io/api/v1/quote'
const PC_REFRESH_MS = 6 * 60 * 60 * 1000 // 6 hours
// Self-healing recovery: only fires for symbols that have not received any
// tick yet. Stocks intentionally skip polling once a tick is in — off-hours
// silence is correct behavior (the last close stays on screen) and polling
// would just burn the 60 calls/min Finnhub free quota.
const RECOVERY_CHECK_MS = 30_000
const PC_REFRESH_CHECK_MS = 30 * 60 * 1000

interface PrevClose {
  pc: number
  fetchedAt: number
}

export class FinnhubAdapter extends BaseWsAdapter {
  readonly id = 'finnhub' as const
  private apiKey: string

  // itemId -> symbol
  private itemToSymbol = new Map<string, string>()
  // symbol -> set of itemIds
  private symbolToItems = new Map<string, Set<string>>()
  // symbol -> previous close
  private prevCloseCache = new Map<string, PrevClose>()
  // symbol -> latest price (so we can re-emit when pc updates)
  private lastPrice = new Map<string, number>()
  // symbol -> last tick timestamp (REST or WS)
  private lastTickTs = new Map<string, number>()
  // periodic pc refresh
  private pcRefreshTimer: NodeJS.Timeout | null = null
  // recovery timer; runs only while there are still pending (no-tick) symbols
  private recoveryTimer: NodeJS.Timeout | null = null

  constructor(apiKey: string) {
    super()
    this.apiKey = apiKey
  }

  setApiKey(key: string): void {
    if (key === this.apiKey) return
    this.apiKey = key
    if (this.ws) {
      this.closeWs()
    }
    if (this.symbolToItems.size > 0 && this.apiKey) {
      this.connectIfNeeded()
    }
  }

  subscribe(item: ItemConfig): void {
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
    this.ensureRecoveryTimer()
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
        this.lastPrice.delete(symbol)
        this.prevCloseCache.delete(symbol)
        this.lastTickTs.delete(symbol)
        this.sendUnsubscribe(symbol)
      }
    }
    if (this.symbolToItems.size === 0) {
      this.closeWs()
      this.stopPcRefreshTimer()
      this.stopRecoveryTimer()
    }
  }

  protected getWsUrl(): string | null {
    if (!this.apiKey) return null
    return `${WS_URL}?token=${encodeURIComponent(this.apiKey)}`
  }

  protected hasSubscriptions(): boolean {
    // apiKey 가 없으면 reconnect 시도 X — close 시 close 상태로 안주
    return this.symbolToItems.size > 0 && !!this.apiKey
  }

  protected onWsOpen(): void {
    for (const sym of this.symbolToItems.keys()) {
      this.sendSubscribe(sym)
      // After (re)connect, refetch /quote so the UI shows a fresh tick even
      // if the market is closed and WS will stay silent.
      void this.fetchPrevClose(sym)
    }
  }

  protected onDestroy(): void {
    this.stopPcRefreshTimer()
    this.stopRecoveryTimer()
  }

  protected handleMessage(msg: unknown): void {
    const obj = msg as { type?: string; data?: Array<{ s?: string; p?: unknown }> } | null
    if (obj?.type !== 'trade' || !Array.isArray(obj.data)) return
    const ts = Date.now()
    const latestPerSymbol = new Map<string, number>()
    for (const t of obj.data) {
      const sym = t?.s
      const price = Number(t?.p)
      if (!sym || !Number.isFinite(price)) continue
      latestPerSymbol.set(sym, price)
    }
    for (const [sym, price] of latestPerSymbol) {
      this.lastPrice.set(sym, price)
      this.lastTickTs.set(sym, ts)
      const items = this.symbolToItems.get(sym)
      if (!items) continue
      const cached = this.prevCloseCache.get(sym)
      const pc = cached?.pc
      for (const itemId of items) {
        this.emitTickFor(itemId, sym, price, pc, ts)
      }
    }
  }

  private emitTickFor(
    itemId: string,
    symbol: string,
    price: number,
    pc: number | undefined,
    ts = Date.now()
  ): void {
    const changePct = pc && pc > 0 ? ((price - pc) / pc) * 100 : 0
    this.emit('tick', itemId, { symbol, price, changePct, ts })
  }

  private async fetchPrevClose(symbol: string): Promise<void> {
    if (!this.apiKey) return
    try {
      const url = `${QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(this.apiKey)}`
      const res = await fetch(url)
      if (!res.ok) return
      const data = (await res.json()) as { pc?: unknown; c?: unknown }
      const pc = Number(data?.pc)
      const c = Number(data?.c)
      if (!Number.isFinite(pc) || pc <= 0) return
      this.prevCloseCache.set(symbol, { pc, fetchedAt: Date.now() })
      // Prefer freshly-fetched current price; fall back to last seen WS price.
      const initialPrice = Number.isFinite(c) && c > 0 ? c : this.lastPrice.get(symbol)
      if (initialPrice !== undefined) {
        if (Number.isFinite(c) && c > 0) this.lastPrice.set(symbol, c)
        this.lastTickTs.set(symbol, Date.now())
        const items = this.symbolToItems.get(symbol)
        if (items) {
          for (const itemId of items) {
            this.emitTickFor(itemId, symbol, initialPrice, pc)
          }
        }
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string } | null)?.message ?? String(err)
      console.warn(`[finnhub] /quote ${symbol} threw:`, msg)
    }
  }

  private ensureRecoveryTimer(): void {
    if (this.recoveryTimer) return
    this.recoveryTimer = setInterval(() => {
      const pending: string[] = []
      for (const sym of this.symbolToItems.keys()) {
        if (!this.lastTickTs.has(sym)) pending.push(sym)
      }
      if (pending.length === 0) {
        this.stopRecoveryTimer()
        return
      }
      for (const sym of pending) void this.fetchPrevClose(sym)
    }, RECOVERY_CHECK_MS)
  }

  private stopRecoveryTimer(): void {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer)
      this.recoveryTimer = null
    }
  }

  private ensurePcRefreshTimer(): void {
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
    }, PC_REFRESH_CHECK_MS)
  }

  private stopPcRefreshTimer(): void {
    if (this.pcRefreshTimer) {
      clearInterval(this.pcRefreshTimer)
      this.pcRefreshTimer = null
    }
  }

  private sendSubscribe(symbol: string): void {
    this.sendWs({ type: 'subscribe', symbol })
  }

  private sendUnsubscribe(symbol: string): void {
    this.sendWs({ type: 'unsubscribe', symbol })
  }
}
