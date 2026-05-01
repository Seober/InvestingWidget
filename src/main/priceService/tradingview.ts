import { EventEmitter } from 'node:events'
import { AdapterStatus, ItemConfig } from '@shared/schema'
import { PriceAdapter } from './types'

interface TVMarketHandle {
  delete: () => void
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

    market.onData((data: any) => {
      const price = Number(data?.lp)
      const changePct = Number(data?.chp)
      if (!Number.isFinite(price)) return
      const finalChange = Number.isFinite(changePct) ? changePct : 0
      this.lastData.set(item.id, { price, changePct: finalChange })
      this.emit('tick', item.id, {
        symbol: tvSymbol,
        price,
        changePct: finalChange,
        ts: Date.now()
      })
    })
    market.onError?.((err: any) => {
      this.emit('itemError', item.id, `TradingView 오류: ${err?.message ?? String(err)}`)
    })

    this.itemHandles.set(item.id, { tvSymbol, market })
  }

  unsubscribe(itemId: string) {
    const h = this.itemHandles.get(itemId)
    if (!h) return
    try {
      h.market.delete()
    } catch {
      // ignore
    }
    this.itemHandles.delete(itemId)
    this.lastData.delete(itemId)
    if (this.itemHandles.size === 0) {
      this.teardownSession()
    }
  }

  status() {
    return this.currentStatus
  }

  async destroy() {
    this.destroyed = true
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
