import { test } from 'node:test'
import assert from 'node:assert/strict'
import { t } from '../src/shared/i18n/messages'

test('adapter messages — invalidSymbol interpolation', () => {
  assert.equal(t.adapter.invalidSymbol('binance-spot'), 'binance-spot에 없는 심볼입니다')
  assert.equal(t.adapter.invalidSymbol('gateio-perp'), 'gateio-perp에 없는 심볼입니다')
})

test('adapter messages — finnhubKeyMissing 정적', () => {
  assert.match(t.adapter.finnhubKeyMissing, /Finnhub API 키/)
})

test('adapter messages — TradingView 변형들', () => {
  assert.match(t.adapter.tradingviewLoadFailed('boom'), /로드 실패: boom/)
  assert.match(t.adapter.tradingviewSessionFailed('xx'), /세션 생성 실패: xx/)
  assert.match(t.adapter.tradingviewSymbolFailed('yy'), /심볼 생성 실패: yy/)
  assert.match(t.adapter.tradingviewError('zz'), /TradingView 오류: zz/)
})

test('updater messages — interpolation', () => {
  assert.match(t.updater.upToDate('0.6.0'), /v0\.6\.0/)
  assert.match(t.updater.foundMessage('0.7.0'), /v0\.7\.0/)
  assert.match(t.updater.downloadedMessage('0.8.0'), /v0\.8\.0/)
  assert.match(t.updater.checkFailed('error 123'), /error 123/)
  assert.match(t.updater.downloadFailed('connection'), /connection/)
})

test('updater messages — button labels 정적', () => {
  assert.equal(t.updater.downloadButton, '다운로드')
  assert.equal(t.updater.laterButton, '나중에')
  assert.equal(t.updater.restartButton, '재시작·적용')
})

test('all top-level i18n namespaces 존재', () => {
  assert.ok(t.adapter, 'adapter namespace')
  assert.ok(t.updater, 'updater namespace')
})
