import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveClickThroughUrl } from '../src/main/clickThroughResolver'
import { DEFAULT_CONFIG, AppConfig, ItemConfig } from '../src/shared/schema'

const baseConfig: AppConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG))

function mkItem(over: Partial<ItemConfig>): ItemConfig {
  return {
    id: 'test',
    symbol: 'BTC',
    assetType: 'crypto-spot',
    quoteCurrency: 'USDT',
    ...over
  }
}

test('crypto-spot resolves with base/quote', () => {
  const url = resolveClickThroughUrl(mkItem({ symbol: 'BTC', assetType: 'crypto-spot' }), baseConfig)
  assert.equal(url, 'https://www.binance.com/en/trade/BTC_USDT')
})

test('crypto-perp resolves to futures URL', () => {
  const url = resolveClickThroughUrl(mkItem({ symbol: 'ETH', assetType: 'crypto-perp' }), baseConfig)
  assert.equal(url, 'https://www.binance.com/en/futures/ETHUSDT')
})

test('stock-us resolves with full {symbol}', () => {
  const url = resolveClickThroughUrl(
    mkItem({ symbol: 'AAPL', assetType: 'stock-us', quoteCurrency: undefined }),
    baseConfig
  )
  assert.equal(url, 'https://finance.yahoo.com/quote/AAPL')
})

test('etf-us resolves identically to stock-us', () => {
  const url = resolveClickThroughUrl(
    mkItem({ symbol: 'SPY', assetType: 'etf-us', quoteCurrency: undefined }),
    baseConfig
  )
  assert.equal(url, 'https://finance.yahoo.com/quote/SPY')
})

test('stock-kr resolves to TradingView KRX', () => {
  const url = resolveClickThroughUrl(
    mkItem({ symbol: '005930', assetType: 'stock-kr', quoteCurrency: undefined }),
    baseConfig
  )
  assert.equal(url, 'https://kr.tradingview.com/symbols/KRX-005930/')
})

test('item-level clickThroughUrl overrides template', () => {
  const url = resolveClickThroughUrl(
    mkItem({
      symbol: 'BTC',
      assetType: 'crypto-spot',
      clickThroughUrl: 'https://upbit.com/exchange?code=CRIX.UPBIT.KRW-{base}'
    }),
    baseConfig
  )
  assert.equal(url, 'https://upbit.com/exchange?code=CRIX.UPBIT.KRW-BTC')
})

test('custom quote currency replaces {quote}', () => {
  const url = resolveClickThroughUrl(
    mkItem({ symbol: 'BTC', quoteCurrency: 'BUSD' }),
    baseConfig
  )
  assert.equal(url, 'https://www.binance.com/en/trade/BTC_BUSD')
})

test('symbol case is normalized to uppercase', () => {
  const url = resolveClickThroughUrl(
    mkItem({ symbol: 'btc', assetType: 'crypto-spot' }),
    baseConfig
  )
  assert.equal(url, 'https://www.binance.com/en/trade/BTC_USDT')
})
