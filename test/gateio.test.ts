import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGateioSpot, createGateioPerp } from '../src/main/priceService/gateio'
import type { ItemConfig } from '../src/shared/schema'

const SKIP = process.env.SKIP_NETWORK_TESTS === '1'

test(
  'Gate.io spot WS receives BTC_USDT ticker within 10s',
  { skip: SKIP, timeout: 15_000 },
  async () => {
    const adapter = createGateioSpot()
    const item: ItemConfig = {
      id: 'gate-btc-test',
      symbol: 'BTC',
      assetType: 'crypto-spot',
      quoteCurrency: 'USDT'
    }
    const tick = await new Promise<{ price: number; changePct: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 10_000)
      adapter.on('tick', (id: string, t: any) => {
        if (id !== item.id) return
        clearTimeout(timer)
        resolve(t)
      })
      adapter.subscribe(item)
    })
    assert.ok(Number.isFinite(tick.price) && tick.price > 0)
    assert.ok(Number.isFinite(tick.changePct))
    await adapter.destroy()
  }
)

test(
  'Gate.io futures WS receives BTC_USDT contract within 10s',
  { skip: SKIP, timeout: 15_000 },
  async () => {
    const adapter = createGateioPerp()
    const item: ItemConfig = {
      id: 'gate-btc-perp-test',
      symbol: 'BTC',
      assetType: 'crypto-perp',
      quoteCurrency: 'USDT'
    }
    const got = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 10_000)
      adapter.on('tick', (id: string) => {
        if (id !== item.id) return
        clearTimeout(timer)
        resolve(true)
      })
      adapter.subscribe(item)
    })
    assert.equal(got, true, 'no tick received from Gate.io futures within 10s')
    await adapter.destroy()
  }
)
