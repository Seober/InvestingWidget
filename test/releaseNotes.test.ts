import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseReleaseSummary, buildReleaseUrl } from '../src/shared/releaseNotes'

test('parseReleaseSummary — 정상 마커', () => {
  const note = `[다운로드](...)

<!-- summary -->
- 변경 1
- 변경 2
<!-- /summary -->

## 본문`
  assert.equal(parseReleaseSummary(note), '- 변경 1\n- 변경 2')
})

test('parseReleaseSummary — multi-line summary 보존', () => {
  const note = `<!-- summary -->
A
B
C
<!-- /summary -->`
  assert.equal(parseReleaseSummary(note), 'A\nB\nC')
})

test('parseReleaseSummary — 마커 없음', () => {
  assert.equal(parseReleaseSummary('no markers here'), null)
})

test('parseReleaseSummary — 시작 마커만', () => {
  assert.equal(parseReleaseSummary('<!-- summary -->\ncontent'), null)
})

test('parseReleaseSummary — 종료 마커만', () => {
  assert.equal(parseReleaseSummary('content\n<!-- /summary -->'), null)
})

test('parseReleaseSummary — 빈 마커', () => {
  assert.equal(parseReleaseSummary('<!-- summary --><!-- /summary -->'), null)
})

test('parseReleaseSummary — whitespace-only summary', () => {
  assert.equal(parseReleaseSummary('<!-- summary -->\n  \n\n  \n<!-- /summary -->'), null)
})

test('parseReleaseSummary — null 입력', () => {
  assert.equal(parseReleaseSummary(null), null)
})

test('parseReleaseSummary — undefined 입력', () => {
  assert.equal(parseReleaseSummary(undefined), null)
})

test('parseReleaseSummary — ReleaseNoteInfo[] 합쳐 검색', () => {
  const notes = [
    { version: '0.6.1', note: 'old body without markers' },
    { version: '0.6.2', note: '<!-- summary -->\n- 새 기능\n<!-- /summary -->\n## 본문' },
  ]
  assert.equal(parseReleaseSummary(notes), '- 새 기능')
})

test('parseReleaseSummary — ReleaseNoteInfo[] 중 null note 필터', () => {
  const notes = [
    { version: '0.6.1', note: null },
    { version: '0.6.2', note: '<!-- summary -->\nA\n<!-- /summary -->' },
  ]
  assert.equal(parseReleaseSummary(notes), 'A')
})

test('parseReleaseSummary — 마커 대소문자 변형 (Summary)', () => {
  const note = `<!-- Summary -->\nA\n<!-- /Summary -->`
  assert.equal(parseReleaseSummary(note), 'A')
})

test('parseReleaseSummary — 마커 안 공백 허용', () => {
  const note = `<!--   summary   -->\nB\n<!--   /summary   -->`
  assert.equal(parseReleaseSummary(note), 'B')
})

test('buildReleaseUrl — 정상', () => {
  assert.equal(
    buildReleaseUrl('0.6.2'),
    'https://github.com/Seober/InvestingWidget/releases/tag/v0.6.2'
  )
})
