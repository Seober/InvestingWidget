import { EventEmitter } from 'node:events'
import { AdapterStatus, ItemConfig } from '@shared/schema'
import { t } from '@shared/i18n/messages'
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

interface ItemEntry {
  tvSymbol: string
  client: TVClient
  session: TVQuoteSession
  market: TVMarketHandle
}

// Self-healing recovery: only recreates market handles that have NEVER
// received a tick. Items that received a tick but went silent (off-hours, KR
// market closed) are left alone — the last quote stays visible.
const RECOVERY_CHECK_MS = 30_000

export class TradingViewAdapter extends EventEmitter implements PriceAdapter {
  readonly id = 'tradingview' as const
  private currentStatus: AdapterStatus = 'closed'
  private mod: TVModule | null = null

  // 항목별 자체 client + session + market 보유.
  // @mathieuc/tradingview 의 알려진 버그: 같은 session 안에서 market.close() 후
  // 새 Market 생성 시 symbolListeners 배열 stuck → quote_add_symbols 누락 → 영구 stuck.
  // 회피책으로 항목마다 자체 client/session 분리 (KR 항목 N개 → WebSocket N개).
  private itemHandles = new Map<string, ItemEntry>()
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
      this.setStatus('closed', t.adapter.tradingviewLoadFailed(err?.message ?? String(err)))
      throw err
    }
  }

  async subscribe(item: ItemConfig) {
    if (this.itemHandles.has(item.id)) return
    if (this.destroyed) return

    try {
      await this.initIfNeeded()
    } catch {
      this.emit('itemError', item.id, t.adapter.tradingviewInitFailed)
      return
    }

    const tvSymbol = this.toTVSymbol(item.symbol)
    const entry = this.createItemEntry(item.id, tvSymbol)
    if (!entry) return // createItemEntry 에서 이미 emit

    this.itemHandles.set(item.id, entry)
    this.setStatus('open')
    this.ensureRecoveryTimer()
  }

  // 항목 entry 한 개 (client + session + market) 생성 + handler wire.
  // subscribe / recreateMarket 양쪽에서 동일 패턴 사용.
  private createItemEntry(itemId: string, tvSymbol: string): ItemEntry | null {
    if (!this.mod) {
      this.emit('itemError', itemId, t.adapter.tradingviewModuleMissing)
      return null
    }
    let client: TVClient
    let session: TVQuoteSession
    try {
      client = new this.mod.Client()
      client.on?.('error', () => {
        // tolerated; per-item errors come through market.onError
      })
      client.on?.('disconnected', () => this.setStatus('reconnecting'))
      client.on?.('connected', () => this.setStatus('open'))
      session = new client.Session.Quote()
    } catch (err: any) {
      this.emit('itemError', itemId, t.adapter.tradingviewSessionFailed(err?.message ?? String(err)))
      return null
    }

    let market: TVMarketHandle
    try {
      market = new session.Market(tvSymbol)
    } catch (err: any) {
      try {
        session.delete?.()
      } catch {
        // ignore
      }
      try {
        client.end()
      } catch {
        // ignore
      }
      this.emit('itemError', itemId, t.adapter.tradingviewSymbolFailed(err?.message ?? String(err)))
      return null
    }

    this.wireMarketHandlers(itemId, tvSymbol, market)
    return { tvSymbol, client, session, market }
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
        ts: Date.now(),
      })
    })
    market.onError?.((err: any) => {
      this.emit('itemError', itemId, t.adapter.tradingviewError(err?.message ?? String(err)))
    })
  }

  // recovery — 같은 항목 entry 의 client/session 통째 재생성 (lib stuck 회피).
  private recreateMarket(itemId: string) {
    const handle = this.itemHandles.get(itemId)
    if (!handle) return
    try {
      handle.market.close()
    } catch {
      // ignore
    }
    try {
      handle.session.delete?.()
    } catch {
      // ignore
    }
    try {
      handle.client.end()
    } catch {
      // ignore
    }
    this.itemHandles.delete(itemId)

    const entry = this.createItemEntry(itemId, handle.tvSymbol)
    if (!entry) return
    this.itemHandles.set(itemId, entry)
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
    try {
      h.session.delete?.()
    } catch {
      // ignore
    }
    try {
      h.client.end()
    } catch {
      // ignore
    }
    this.itemHandles.delete(itemId)
    this.lastData.delete(itemId)
    this.lastTickTs.delete(itemId)
    if (this.itemHandles.size === 0) {
      this.stopRecoveryTimer()
      this.setStatus('closed')
    }
  }

  status() {
    return this.currentStatus
  }

  async destroy() {
    this.destroyed = true
    this.stopRecoveryTimer()
    for (const itemId of Array.from(this.itemHandles.keys())) this.unsubscribe(itemId)
  }

  private toTVSymbol(rawSymbol: string): string {
    // 일부 KR 종목(엠게임 058630 등) 이 TV 데이터 피드에서 KRX: prefix 만 인식하고
    // KOSDAQ:/KOSPI: 를 reject 하므로 콜론 prefix 무시하고 코드만 추출해 KRX: 로 통일.
    // KRX 가 한국 통합 거래소 코드라 KOSPI/KOSDAQ/KONEX 모든 종목 포괄.
    const upper = rawSymbol.toUpperCase()
    const code = upper.includes(':') ? upper.split(':')[1] : upper
    return `KRX:${code}`
  }

  private setStatus(s: AdapterStatus, message?: string) {
    if (s === this.currentStatus) return
    this.currentStatus = s
    this.emit('status', s, message)
  }
}
