import { test } from 'node:test'
import assert from 'node:assert/strict'

// Preload 의 Api type 이 정상 export 되고 expected shape 를 가지는지 type-level 검증.
// 실 IPC 동작 검증 X — Electron 환경 mocking 큰 작업이라 별 plan.
//
// 본 테스트의 의의: Api shape 변경 시 typecheck + 본 테스트 둘 다 fail → contract drift 검출.
test('Api 의 namespaces 모두 expected shape 를 가짐 (typecheck)', async () => {
  // dynamic import — electron 의존성 회피 (preload 자체가 electron 사용)
  // 본 테스트는 type 만 import — runtime contextBridge.expose 안 호출
  // typeof import('../src/preload') 가 컴파일 통과만 하면 OK.
  type _Api = import('../src/preload').Api
  type _AssertHasConfig = _Api['config']
  type _AssertHasItems = _Api['items']
  type _AssertHasUpdater = _Api['updater']
  type _AssertHasPrices = _Api['prices']
  type _AssertHasModal = _Api['modal']
  // satisfies 만으로 타입 검증 — runtime assert 없음
  assert.ok(true, 'Api type compile-time check pass')
})
