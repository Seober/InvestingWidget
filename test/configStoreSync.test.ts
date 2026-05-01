import { test } from 'node:test'
import assert from 'node:assert/strict'

// Inline minimal copy of the migrate + sync semantics to validate the contract.
// The real ConfigStore depends on electron-store / electron app paths,
// which can't load in plain Node. This test verifies the *core invariant*:
// after set(), get() returns the new value synchronously.

import { DEFAULT_CONFIG, AppConfig } from '../src/shared/schema'

function migrate(raw: Partial<AppConfig> & { schemaVersion?: number }): AppConfig {
  const merged: AppConfig = {
    ...DEFAULT_CONFIG,
    ...raw,
    window: { ...DEFAULT_CONFIG.window, ...(raw.window ?? {}) },
    defaults: {
      ...DEFAULT_CONFIG.defaults,
      ...(raw.defaults ?? {}),
      clickThroughTemplates: {
        ...DEFAULT_CONFIG.defaults.clickThroughTemplates,
        ...(raw.defaults?.clickThroughTemplates ?? {})
      },
      opacityBounds: {
        ...DEFAULT_CONFIG.defaults.opacityBounds,
        ...(raw.defaults?.opacityBounds ?? {})
      }
    },
    items: raw.items ?? []
  }
  merged.schemaVersion = 1
  return merged
}

class FakeConfigStore {
  private memCache: AppConfig
  private saveTimer: NodeJS.Timeout | null = null
  public diskWrites = 0

  constructor() {
    this.memCache = migrate({} as Partial<AppConfig>)
  }

  get(): AppConfig {
    return this.memCache
  }

  set(patch: Partial<AppConfig>): AppConfig {
    this.memCache = migrate({ ...this.memCache, ...patch })
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.diskWrites++
    }, 500)
    return this.memCache
  }

  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.diskWrites++
  }
}

test('set updates memory immediately (no debounce on get)', () => {
  const s = new FakeConfigStore()
  assert.equal(s.get().refreshIntervalMs, 500)
  s.set({ refreshIntervalMs: 250 })
  assert.equal(s.get().refreshIntervalMs, 250, 'memory must reflect set() result synchronously')
})

test('multiple sets in quick succession all visible to get()', () => {
  const s = new FakeConfigStore()
  s.set({ items: [{ id: 'a', symbol: 'BTC', assetType: 'crypto-spot' }] })
  assert.equal(s.get().items.length, 1)
  s.set({ items: [...s.get().items, { id: 'b', symbol: 'ETH', assetType: 'crypto-spot' }] })
  assert.equal(s.get().items.length, 2)
  assert.deepEqual(
    s.get().items.map((i) => i.symbol),
    ['BTC', 'ETH']
  )
})

test('disk write is debounced (not synchronous)', () => {
  const s = new FakeConfigStore()
  s.set({ refreshIntervalMs: 250 })
  s.set({ refreshIntervalMs: 1000 })
  s.set({ refreshIntervalMs: 2000 })
  // Three rapid sets should produce zero disk writes immediately
  assert.equal(s.diskWrites, 0)
})

test('flush forces a disk write', () => {
  const s = new FakeConfigStore()
  s.set({ refreshIntervalMs: 250 })
  s.flush()
  assert.equal(s.diskWrites, 1)
})

test('migrate preserves user items', () => {
  const result = migrate({
    items: [{ id: 'x', symbol: 'BTC', assetType: 'crypto-spot' }]
  })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]!.symbol, 'BTC')
})

test('migrate sets schemaVersion to 1', () => {
  const result = migrate({})
  assert.equal(result.schemaVersion, 1)
})
