import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG } from '../src/shared/schema'
import type { StatusEvent } from '../src/shared/schema'
import { adapterFor } from '../src/shared/adapterMap'

test('default config has 5s refresh interval', () => {
  assert.equal(DEFAULT_CONFIG.refreshIntervalMs, 5000)
})

test('default config has all asset-type click-through templates', () => {
  const types = ['crypto-spot', 'crypto-perp', 'stock-us', 'etf-us', 'stock-kr', 'etf-kr'] as const
  for (const t of types) {
    const tpl = DEFAULT_CONFIG.defaults.clickThroughTemplates[t]
    assert.ok(tpl && tpl.length > 0, `missing template for ${t}`)
    assert.ok(tpl.startsWith('https://'), `template for ${t} not https: ${tpl}`)
  }
})

test('default opacity bounds are sensible', () => {
  const { min, max } = DEFAULT_CONFIG.defaults.opacityBounds
  assert.ok(min > 0 && min < max, `bad min: ${min}`)
  assert.ok(max <= 1, `max above 1: ${max}`)
  assert.ok(min >= 0.1, 'min should be >= 0.1 to keep widget clickable')
})

test('adapterFor maps each asset type to expected adapter', () => {
  assert.equal(adapterFor('crypto-spot'), 'binance-spot')
  assert.equal(adapterFor('crypto-perp'), 'binance-perp')
  assert.equal(adapterFor('stock-us'), 'finnhub')
  assert.equal(adapterFor('etf-us'), 'finnhub')
  assert.equal(adapterFor('stock-kr'), 'tradingview')
  assert.equal(adapterFor('etf-kr'), 'tradingview')
})

test('default initial window opacity sits inside bounds', () => {
  const { opacity } = DEFAULT_CONFIG.window
  const { min, max } = DEFAULT_CONFIG.defaults.opacityBounds
  assert.ok(opacity >= min && opacity <= max, `opacity ${opacity} outside [${min}, ${max}]`)
})

test('StatusEvent discriminator kind narrows to ItemStatusEvent', () => {
  const evt: StatusEvent = { kind: 'item', itemId: 'abc', status: 'closed' }
  if (evt.kind === 'item') {
    // 컴파일 타임 narrow — itemId 접근 가능, adapterId 접근 불가
    assert.equal(evt.itemId, 'abc')
    assert.equal(evt.status, 'closed')
  } else {
    assert.fail('kind item 인데 narrow 실패')
  }
})

test('StatusEvent discriminator kind narrows to AdapterStatusEvent', () => {
  const evt: StatusEvent = { kind: 'adapter', adapterId: 'binance-spot', status: 'open' }
  if (evt.kind === 'adapter') {
    assert.equal(evt.adapterId, 'binance-spot')
    assert.equal(evt.status, 'open')
  } else {
    assert.fail('kind adapter 인데 narrow 실패')
  }
})
