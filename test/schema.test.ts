import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG } from '../src/shared/schema'
import { adapterFor } from '../src/shared/adapterMap'

test('default config has 0.5s refresh interval', () => {
  assert.equal(DEFAULT_CONFIG.refreshIntervalMs, 500)
})

test('default config has all asset-type click-through templates', () => {
  const types = ['crypto-spot', 'crypto-perp', 'stock-us', 'etf-us', 'stock-kr'] as const
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
})

test('default initial window opacity sits inside bounds', () => {
  const { opacity } = DEFAULT_CONFIG.window
  const { min, max } = DEFAULT_CONFIG.defaults.opacityBounds
  assert.ok(opacity >= min && opacity <= max, `opacity ${opacity} outside [${min}, ${max}]`)
})
