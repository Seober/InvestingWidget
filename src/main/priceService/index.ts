import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import {
  AdapterStatus,
  AppConfig,
  AssetType,
  ItemConfig,
  SourceId,
  ValidateResult
} from '@shared/schema'
import { PriceAdapter, RawTick } from './types'
import { BinanceAdapter, createBinancePerp, createBinanceSpot } from './binance'
import { FinnhubAdapter } from './finnhub'
import { TradingViewAdapter } from './tradingview'
import { GateioAdapter, createGateioPerp, createGateioSpot } from './gateio'

const FALLBACK_TIMEOUT_MS = 5_000

export class PriceService extends EventEmitter {
  private binSpot: BinanceAdapter
  private binPerp: BinanceAdapter
  private gateSpot: GateioAdapter
  private gatePerp: GateioAdapter
  private finnhub: FinnhubAdapter
  private tv: TradingViewAdapter

  private subscribedItemIds = new Set<string>()
  private itemTypes = new Map<string, AssetType>()
  private tradingViewEnabled: boolean

  constructor(config: AppConfig) {
    super()
    this.binSpot = createBinanceSpot()
    this.binPerp = createBinancePerp()
    this.gateSpot = createGateioSpot()
    this.gatePerp = createGateioPerp()
    this.finnhub = new FinnhubAdapter(config.finnhubApiKey)
    this.tv = new TradingViewAdapter()
    this.tradingViewEnabled = config.tradingViewEnabled

    for (const a of this.allAdapters()) this.wire(a)
  }

  private allAdapters(): PriceAdapter[] {
    return [this.binSpot, this.binPerp, this.gateSpot, this.gatePerp, this.finnhub, this.tv]
  }

  private adapterChain(assetType: AssetType): PriceAdapter[] {
    switch (assetType) {
      case 'crypto-spot':
        return [this.binSpot, this.gateSpot]
      case 'crypto-perp':
        // Binance USDT-M futures is blocked from KR IPs → use Gate.io only.
        // VPN users can edit this list to fall back to binPerp if desired.
        return [this.gatePerp]
      case 'stock-us':
      case 'etf-us':
        return [this.finnhub]
      case 'stock-kr':
        return this.tradingViewEnabled ? [this.tv] : []
      default:
        return []
    }
  }

  private adapterById(id: SourceId): PriceAdapter | null {
    switch (id) {
      case 'binance-spot':
        return this.binSpot
      case 'binance-perp':
        return this.binPerp
      case 'gateio-spot':
        return this.gateSpot
      case 'gateio-perp':
        return this.gatePerp
      case 'finnhub':
        return this.finnhub
      case 'tradingview':
        return this.tradingViewEnabled ? this.tv : null
      default:
        return null
    }
  }

  setItems(items: ItemConfig[]) {
    const incoming = new Set(items.map((i) => i.id))
    for (const id of this.subscribedItemIds) {
      if (!incoming.has(id)) this.unsubscribeItem(id)
    }
    for (const item of items) {
      if (this.subscribedItemIds.has(item.id)) continue
      this.subscribeItem(item)
    }
  }

  refreshItem(item: ItemConfig) {
    if (this.subscribedItemIds.has(item.id)) this.unsubscribeItem(item.id)
    this.subscribeItem(item)
  }

  setFinnhubApiKey(key: string) {
    this.finnhub.setApiKey(key)
  }

  setTradingViewEnabled(enabled: boolean) {
    this.tradingViewEnabled = enabled
    if (!enabled) {
      for (const [id, t] of this.itemTypes) {
        if (t === 'stock-kr') this.unsubscribeItem(id)
      }
    }
  }

  async validate(
    itemDraft: Omit<ItemConfig, 'id'>,
    signal?: AbortSignal
  ): Promise<ValidateResult> {
    const chain = this.adapterChain(itemDraft.assetType)
    if (chain.length === 0) {
      return {
        ok: false,
        error:
          itemDraft.assetType === 'stock-kr'
            ? 'TradingView 어댑터가 비활성화되어 있습니다 (설정에서 활성화)'
            : '지원하지 않는 자산 유형입니다.'
      }
    }
    // @mathieuc/tradingview 라이브러리에 알려진 버그: validate 단계에서 임시 Market을
    // 만들었다 close하면 symbolListeners 배열의 length가 줄지 않아 (delete 슬롯만)
    // 같은 session 내 다음 Market 생성 시 quote_add_symbols가 전송되지 않음 →
    // 두 번째 한국 주식부터 영구 stuck. 검증은 이미 renderer가 Naver로 처리하므로
    // tryAdapter를 우회하고 실제 구독에서만 1회 Market을 만들도록 함.
    if (itemDraft.assetType === 'stock-kr' && chain[0].id === 'tradingview') {
      return { ok: true, source: 'tradingview' }
    }
    const errors: string[] = []
    for (const adapter of chain) {
      if (signal?.aborted) return { ok: false, error: '취소됨' }
      const result = await this.tryAdapter(adapter, itemDraft, FALLBACK_TIMEOUT_MS, signal)
      if (result.ok) {
        return { ok: true, source: adapter.id as SourceId }
      }
      if (signal?.aborted) return { ok: false, error: '취소됨' }
      if (result.error) errors.push(`${adapter.id}: ${result.error}`)
    }
    return {
      ok: false,
      error: errors.length
        ? `시도한 거래소(${chain.map((a) => a.id).join(', ')})에서 모두 시세를 받지 못했습니다.`
        : '시세 수신 실패'
    }
  }

  private tryAdapter(
    adapter: PriceAdapter,
    itemDraft: Omit<ItemConfig, 'id'>,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<{ ok: boolean; error?: string }> {
    const tempId = `validate-${randomUUID()}`
    const tempItem: ItemConfig = { ...itemDraft, id: tempId }
    return new Promise((resolve) => {
      let settled = false
      const cleanup = () => {
        try {
          adapter.unsubscribe(tempId)
        } catch {
          // ignore
        }
        clearTimeout(timer)
        adapter.off('tick', onTick)
        adapter.off('itemError', onError)
        if (signal && onAbort) signal.removeEventListener('abort', onAbort)
      }
      const finish = (ok: boolean, error?: string) => {
        if (settled) return
        settled = true
        cleanup()
        resolve({ ok, error })
      }
      const onTick = (id: string) => {
        if (id === tempId) finish(true)
      }
      const onError = (id: string, msg: string) => {
        if (id === tempId) finish(false, msg)
      }
      const onAbort = () => finish(false, '취소됨')

      if (signal?.aborted) {
        resolve({ ok: false, error: '취소됨' })
        return
      }
      adapter.on('tick', onTick)
      adapter.on('itemError', onError)
      signal?.addEventListener('abort', onAbort)
      const timer = setTimeout(() => finish(false, `${timeoutMs}ms 내 응답 없음`), timeoutMs)

      try {
        const result = adapter.subscribe(tempItem) as unknown
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          ;(result as Promise<unknown>).catch((err) =>
            finish(false, err?.message ?? '구독 오류')
          )
        }
      } catch (err: any) {
        finish(false, err?.message ?? '구독 오류')
      }
    })
  }

  async destroy() {
    await Promise.all(this.allAdapters().map((a) => a.destroy()))
  }

  private subscribeItem(item: ItemConfig) {
    const adapter = this.resolveAdapter(item)
    if (!adapter) {
      this.emit(
        'itemError',
        item.id,
        item.assetType === 'stock-kr'
          ? 'TradingView 어댑터가 비활성화되어 있습니다 (설정에서 활성화)'
          : '지원하지 않는 자산 유형입니다.'
      )
      return
    }
    this.subscribedItemIds.add(item.id)
    this.itemTypes.set(item.id, item.assetType)
    try {
      const result = adapter.subscribe(item) as unknown
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        ;(result as Promise<unknown>).catch((err) =>
          this.emit('itemError', item.id, err?.message ?? '구독 오류')
        )
      }
    } catch (err: any) {
      this.emit('itemError', item.id, err?.message ?? '구독 오류')
    }
  }

  private unsubscribeItem(itemId: string) {
    this.subscribedItemIds.delete(itemId)
    this.itemTypes.delete(itemId)
    for (const a of this.allAdapters()) a.unsubscribe(itemId)
  }

  private resolveAdapter(item: ItemConfig): PriceAdapter | null {
    if (item.source) {
      const a = this.adapterById(item.source)
      if (a) return a
    }
    const chain = this.adapterChain(item.assetType)
    return chain[0] ?? null
  }

  private wire(adapter: PriceAdapter) {
    adapter.on('tick', (itemId: string, tick: RawTick) => {
      this.emit('tick', itemId, tick)
    })
    adapter.on('itemError', (itemId: string, msg: string) => {
      this.emit('itemError', itemId, msg)
    })
    adapter.on('status', (status: AdapterStatus, message?: string) => {
      this.emit('adapterStatus', adapter.id as SourceId, status, message)
    })
  }
}

export type { RawTick } from './types'
