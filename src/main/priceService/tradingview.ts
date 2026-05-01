import { EventEmitter } from 'node:events'
import { AdapterStatus, ItemConfig } from '@shared/schema'
import { PriceAdapter } from './types'

interface TVMarketHandle {
  close: () => void
  onData: (cb: (data: any) => void) => void
  onLoaded?: (cb: () => void) => void
  onError?: (cb: (err: any) => void) => void
}

interface TVQuoteSession {
  Market: new (symbol: string) => TVMarketHandle
  delete?: () => void
}

interface TVClient {
  Session: { Quote: new () => TVQuoteSession }
  end: () => void
  on?: (event: string, cb: (...args: any[]) => void) => void
}

interface TVModule {
  Client: new () => TVClient
}

// Self-healing recovery: only recreates market handles that have NEVER
// received a tick. Items that received a tick but went silent (off-hours, KR
// market closed) are left alone — the last quote stays visible.
const RECOVERY_CHECK_MS = 30_000

export class TradingViewAdapter extends EventEmitter implements PriceAdapter {
  readonly id = 'tradingview' as const
  private currentStatus: AdapterStatus = 'closed'
  private mod: TVModule | null = null
  private client: TVClient | null = null
  private session: TVQuoteSession | null = null

  // itemId -> { tvSymbol, market }
  private itemHandles = new Map<string, { tvSymbol: string; market: TVMarketHandle }>()
  // Latest data per item for re-emit on subscribe
  private lastData = new Map<string, { price: number; changePct: number }>()
  // itemId -> last tick timestamp; missing means "never received a tick"
  private lastTickTs = new Map<string, number>()
  private recoveryTimer: NodeJS.Timeout | null = null
  private destroyed = false

  async initIfNeeded() {
    if (this.mod) return
    try {
      // dynamic import so absence of optional dep doesn't crash main
      const imported: any = await import('@mathieuc/tradingview')
      this.mod = imported.default ?? imported
    } catch (err: any) {
      this.setStatus('closed', `@mathieuc/tradingview 로드 실패: ${err?.message ?? err}`)
      throw err
    }
  }

  async subscribe(item: ItemConfig) {
    if (this.itemHandles.has(item.id)) return
    if (this.destroyed) return

    try {
      await this.initIfNeeded()
    } catch {
      this.emit('itemError', item.id, 'TradingView 어댑터 초기화 실패')
      return
    }
    this.ensureSession()
    if (!this.session) {
      this.emit('itemError', item.id, 'TradingView 세션 생성 실패')
      return
    }

    const tvSymbol = this.toTVSymbol(item.symbol)
    let market: TVMarketHandle
    try {
      market = new this.session.Market(tvSymbol)
    } catch (err: any) {
      this.emit('itemError', item.id, `TradingView 심볼 생성 실패: ${err?.message ?? err}`)
      return
    }

    this.wireMarketHandlers(item.id, tvSymbol, market)
    this.itemHandles.set(item.id, { tvSymbol, market })
    this.ensureRecoveryTimer()
  }

  private wireMarketHandlers(itemId: string, tvSymbol: string, market: TVMarketHandle) {
    // `loaded` event = subscription registered on TV side. Mark lastTickTs
    // so the recovery timer doesn't keep recreating the market while waiting
    // for the first qsd packet (which can take a few seconds, especially
    // outside KR market hours).
    market.onLoaded?.(() => {
      if (!this.lastTickTs.has(itemId)) {
        this.lastTickTs.set(itemId, Date.now())
      }
    })
    market.onData((data: any) => {
      // TV pushes partial updates: e.g., volume-only or chp-only frames
      // without `lp`. Merge with cached values so we still emit a sensible
      // tick instead of dropping the update.
      const lpRaw = Number(data?.lp)
      const chpRaw = Number(data?.chp)
      const cached = this.lastData.get(itemId)
      let price: number
      if (Number.isFinite(lpRaw)) price = lpRaw
      else if (cached !== undefined) price = cached.price
      else return
      const changePct = Number.isFinite(chpRaw) ? chpRaw : (cached?.changePct ?? 0)
      this.lastData.set(itemId, { price, changePct })
      this.lastTickTs.set(itemId, Date.now())
      this.emit('tick', itemId, {
        symbol: tvSymbol,
        price,
        changePct,
        ts: Date.now()
      })
    })
    market.onError?.((err: any) => {
      this.emit('itemError', itemId, `TradingView 오류: ${err?.message ?? String(err)}`)
    })
  }

  private recreateMarket(itemId: string) {
    const handle = this.itemHandles.get(itemId)
    if (!handle || !this.session) return
    try {
      handle.market.close()
    } catch {
      // ignore
    }
    let market: TVMarketHandle
    try {
      market = new this.session.Market(handle.tvSymbol)
    } catch (err: any) {
      this.emit('itemError', itemId, `TradingView 재구독 실패: ${err?.message ?? err}`)
      return
    }
    this.wireMarketHandlers(itemId, handle.tvSymbol, market)
    this.itemHandles.set(itemId, { tvSymbol: handle.tvSymbol, market })
  }

  private ensureRecoveryTimer() {
    if (this.recoveryTimer) return
    this.recoveryTimer = setInterval(() => {
      const pending: string[] = []
      for (const itemId of this.itemHandles.keys()) {
        if (!this.lastTickTs.has(itemId)) pending.push(itemId)
      }
      if (pending.length === 0) {
        this.stopRecoveryTimer()
        return
      }
      for (const itemId of pending) this.recreateMarket(itemId)
    }, RECOVERY_CHECK_MS)
  }

  private stopRecoveryTimer() {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer)
      this.recoveryTimer = null
    }
  }

  unsubscribe(itemId: string) {
    const h = this.itemHandles.get(itemId)
    if (!h) return
    try {
      h.market.close()
    } catch {
      // ignore
    }
    this.itemHandles.delete(itemId)
    this.lastData.delete(itemId)
    this.lastTickTs.delete(itemId)
    if (this.itemHandles.size === 0) {
      this.stopRecoveryTimer()
      this.teardownSession()
    }
  }

  status() {
    return this.currentStatus
  }

  async destroy() {
    this.destroyed = true
    this.stopRecoveryTimer()
    for (const itemId of Array.from(this.itemHandles.keys())) this.unsubscribe(itemId)
    this.teardownSession()
  }

  private ensureSession() {
    if (this.session || !this.mod) return
    try {
      this.client = new this.mod.Client()
      this.client.on?.('error', () => {
        // tolerated; per-item errors come through onError
      })
      this.client.on?.('disconnected', () => this.setStatus('reconnecting'))
      this.client.on?.('connected', () => this.setStatus('open'))
      this.session = new this.client.Session.Quote()
      this.setStatus('open')
    } catch (err: any) {
      this.setStatus('closed', err?.message ?? String(err))
      this.client = null
      this.session = null
    }
  }

  private teardownSession() {
    if (this.session) {
      try {
        this.session.delete?.()
      } catch {
        // ignore
      }
      this.session = null
    }
    if (this.client) {
      try {
        this.client.end()
      } catch {
        // ignore
      }
      this.client = null
    }
    this.setStatus('closed')
  }

  private toTVSymbol(rawSymbol: string): string {
    if (rawSymbol.includes(':')) return rawSymbol.toUpperCase()
    return `KRX:${rawSymbol.toUpperCase()}`
  }

  private setStatus(s: AdapterStatus, message?: string) {
    if (s === this.currentStatus) return
    this.currentStatus = s
    this.emit('status', s, message)
  }
}
