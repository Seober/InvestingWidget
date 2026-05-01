import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBinanceSpot } from '../src/main/priceService/binance'
import type { ItemConfig } from '../src/shared/schema'

// Live integration test: connects to Binance public WebSocket and waits for a tick.
// Skipped automatically if SKIP_NETWORK_TESTS=1.

const SKIP = process.env.SKIP_NETWORK_TESTS === '1'

test(
  'Binance spot WS receives BTCUSDT ticker within 10s',
  { skip: SKIP, timeout: 15_000 },
  async () => {
    const adapter = createBinanceSpot()
    const item: ItemConfig = {
      id: 'btc-test',
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

    assert.ok(Number.isFinite(tick.price), `price not finite: ${tick.price}`)
    assert.ok(tick.price > 0, `price not positive: ${tick.price}`)
    assert.ok(Number.isFinite(tick.changePct), `changePct not finite: ${tick.changePct}`)

    await adapter.destroy()
  }
)

test(
  'Binance perp WS resolves USDT-M futures symbol',
  { skip: SKIP, timeout: 15_000 },
  async () => {
    const { createBinancePerp } = await import('../src/main/priceService/binance')
    const adapter = createBinancePerp()
    const item: ItemConfig = {
      id: 'btc-perp-test',
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

    assert.equal(got, true, 'no tick received from futures stream within 10s')
    await adapter.destroy()
  }
)
