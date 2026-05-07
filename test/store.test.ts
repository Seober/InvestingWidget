import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useStore } from '../src/renderer/store'
import type { AppConfig, ItemConfig } from '../src/shared/schema'
import { DEFAULT_CONFIG } from '../src/shared/schema'

function makeConfig(items: ItemConfig[]): AppConfig {
  return { ...DEFAULT_CONFIG, items }
}

beforeEach(() => {
  // store 초기화 — 매 테스트 격리
  useStore.setState({ config: null, items: [], ticks: {}, itemIdsByAdapter: new Map() })
})

test('setConfig builds adapterId → itemIds index', () => {
  const items: ItemConfig[] = [
    { id: '1', symbol: 'BTC', assetType: 'crypto-spot' },
    { id: '2', symbol: 'AAPL', assetType: 'stock-us' },
    { id: '3', symbol: 'ETH', assetType: 'crypto-spot' },
  ]
  useStore.getState().setConfig(makeConfig(items))
  const idx = useStore.getState().itemIdsByAdapter
  assert.equal(idx.get('binance-spot')?.size, 2)
  assert.ok(idx.get('binance-spot')?.has('1'))
  assert.ok(idx.get('binance-spot')?.has('3'))
  assert.equal(idx.get('finnhub')?.size, 1)
  assert.ok(idx.get('finnhub')?.has('2'))
})

test('setAdapterStatus only updates items mapped to that adapter (O(matched))', () => {
  const items: ItemConfig[] = [
    { id: '1', symbol: 'BTC', assetType: 'crypto-spot' },
    { id: '2', symbol: 'AAPL', assetType: 'stock-us' },
    { id: '3', symbol: 'ETH', assetType: 'crypto-spot' },
  ]
  useStore.getState().setConfig(makeConfig(items))
  useStore.getState().setAdapterStatus('binance-spot', 'reconnecting', '재연결')
  const ticks = useStore.getState().ticks
  assert.equal(ticks['1']?.status, 'reconnecting')
  assert.equal(ticks['1']?.errorMessage, '재연결')
  assert.equal(ticks['3']?.status, 'reconnecting')
  // finnhub 매핑 항목은 영향 X
  assert.equal(ticks['2'], undefined)
})

test('setAdapterStatus skips items with prior errorMessage', () => {
  const items: ItemConfig[] = [{ id: '1', symbol: 'BTC', assetType: 'crypto-spot' }]
  useStore.getState().setConfig(makeConfig(items))
  useStore.getState().setItemError('1', '심볼 없음')
  useStore.getState().setAdapterStatus('binance-spot', 'open')
  // setItemError 가 선행해 set 되었으면 status 덮어쓰기 X
  const tick = useStore.getState().ticks['1']
  assert.equal(tick?.status, 'closed')
  assert.equal(tick?.errorMessage, '심볼 없음')
})

test('setAdapterStatus on unknown adapterId no-ops', () => {
  const items: ItemConfig[] = [{ id: '1', symbol: 'BTC', assetType: 'crypto-spot' }]
  useStore.getState().setConfig(makeConfig(items))
  const before = useStore.getState().ticks
  useStore.getState().setAdapterStatus('nonexistent-adapter', 'open')
  // ticks 동일 (no change)
  assert.equal(useStore.getState().ticks, before)
})
