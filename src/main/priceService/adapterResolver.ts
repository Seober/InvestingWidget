import type { AssetType, ItemConfig, SourceId } from '@shared/schema'
import type { PriceAdapter } from './types'

export interface AdapterRegistry {
  binSpot: PriceAdapter
  binPerp: PriceAdapter
  gateSpot: PriceAdapter
  gatePerp: PriceAdapter
  finnhub: PriceAdapter
  tv: PriceAdapter
}

// assetType→adapter 매핑·source 힌트 처리·전체 어댑터 enumerate 를 단일 클래스로.
// 이전엔 PriceService 안에 adapterChain·adapterById·resolveAdapter·allAdapters 4 메서드로 분산.
export class AdapterResolver {
  constructor(
    private registry: AdapterRegistry,
    private getTradingViewEnabled: () => boolean
  ) {}

  // assetType 의 fallback chain.
  // crypto-perp: Binance USDT-M futures 가 KR IP 차단되어 Gate.io 단독.
  // stock-kr/etf-kr: TradingView 어댑터가 활성일 때만 사용 (비공식 엔드포인트라 옵트인).
  chainFor(assetType: AssetType): PriceAdapter[] {
    switch (assetType) {
      case 'crypto-spot':
        return [this.registry.binSpot, this.registry.gateSpot]
      case 'crypto-perp':
        return [this.registry.gatePerp]
      case 'stock-us':
      case 'etf-us':
        return [this.registry.finnhub]
      case 'stock-kr':
      case 'etf-kr':
        return this.getTradingViewEnabled() ? [this.registry.tv] : []
      default:
        return []
    }
  }

  byId(id: SourceId): PriceAdapter | null {
    switch (id) {
      case 'binance-spot':
        return this.registry.binSpot
      case 'binance-perp':
        return this.registry.binPerp
      case 'gateio-spot':
        return this.registry.gateSpot
      case 'gateio-perp':
        return this.registry.gatePerp
      case 'finnhub':
        return this.registry.finnhub
      case 'tradingview':
        return this.getTradingViewEnabled() ? this.registry.tv : null
      default:
        return null
    }
  }

  // item 에 실제 적용할 단일 어댑터 — 자동완성 source 힌트 있으면 그것, 없으면 chain[0].
  resolve(item: ItemConfig): PriceAdapter | null {
    if (item.source) {
      const a = this.byId(item.source)
      if (a) return a
    }
    return this.chainFor(item.assetType)[0] ?? null
  }

  all(): PriceAdapter[] {
    return [
      this.registry.binSpot,
      this.registry.binPerp,
      this.registry.gateSpot,
      this.registry.gatePerp,
      this.registry.finnhub,
      this.registry.tv
    ]
  }
}
