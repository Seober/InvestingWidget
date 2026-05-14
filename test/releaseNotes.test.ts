import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseReleaseSummary, buildReleaseUrl } from '../src/shared/releaseNotes'

test('parseReleaseSummary — GitHub atom feed HTML', () => {
  const html = `<p>📥 다운로드 ...</p>
<hr>

<h2>요약</h2>
<ul>
<li>변경 1</li>
<li>변경 2</li>
<li>변경 3</li>
</ul>

<h2>본문</h2>`
  assert.equal(parseReleaseSummary(html), '- 변경 1\n- 변경 2\n- 변경 3')
})

test('parseReleaseSummary — HTML with anchor (GitHub heading auto-id)', () => {
  const html = `<h2><a id="user-content-요약" class="anchor" aria-hidden="true"></a>요약</h2>
<ul>
<li>A</li>
<li>B</li>
</ul>`
  assert.equal(parseReleaseSummary(html), '- A\n- B')
})

test('parseReleaseSummary — markdown 원본 (non-atom source)', () => {
  const md = `# Header

## 요약
- A
- B

## 본문
...`
  assert.equal(parseReleaseSummary(md), '- A\n- B')
})

test('parseReleaseSummary — heading 없음', () => {
  assert.equal(parseReleaseSummary('<p>plain text</p>'), null)
})

test('parseReleaseSummary — heading 있고 list 없음', () => {
  assert.equal(parseReleaseSummary('<h2>요약</h2><p>not a list</p>'), null)
})

test('parseReleaseSummary — HTML entity decode', () => {
  const html = `<h2>요약</h2><ul><li>&quot;hello&quot; &amp; world</li></ul>`
  assert.equal(parseReleaseSummary(html), '- "hello" & world')
})

test('parseReleaseSummary — inline tag strip', () => {
  const html = `<h2>요약</h2><ul><li><strong>bold</strong> <em>italic</em> text</li></ul>`
  assert.equal(parseReleaseSummary(html), '- bold italic text')
})

test('parseReleaseSummary — markdown bullet 변형 (*, +)', () => {
  const md = `## 요약\n* A\n+ B\n- C`
  assert.equal(parseReleaseSummary(md), '- A\n- B\n- C')
})

test('parseReleaseSummary — ReleaseNoteInfo[] 합쳐 검색', () => {
  const notes = [
    { version: '0.6.1', note: '<p>old release without heading</p>' },
    { version: '0.6.2', note: '<h2>요약</h2><ul><li>새 기능</li></ul>' },
  ]
  assert.equal(parseReleaseSummary(notes), '- 새 기능')
})

test('parseReleaseSummary — null/undefined', () => {
  assert.equal(parseReleaseSummary(null), null)
  assert.equal(parseReleaseSummary(undefined), null)
})

test('parseReleaseSummary — 빈 list item 필터', () => {
  const html = `<h2>요약</h2><ul><li></li><li>A</li><li>   </li></ul>`
  assert.equal(parseReleaseSummary(html), '- A')
})

test('buildReleaseUrl — 정상', () => {
  assert.equal(
    buildReleaseUrl('0.6.4'),
    'https://github.com/Seober/InvestingWidget/releases/tag/v0.6.4'
  )
})
