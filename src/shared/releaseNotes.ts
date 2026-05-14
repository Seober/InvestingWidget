import type { ReleaseNoteInfo } from 'builder-util-runtime'

// GitHub release body 의 "## 요약" heading 다음 bullet list 추출.
// electron-updater 의 GitHubProvider 가 atom feed 의 <content type="html"> 에서 releaseNotes 를
// 가져오는데, atom feed content 는 markdown→HTML 변환된 형태 — HTML 주석 마커는 변환 시 제거되므로
// heading 기반 패턴 사용.
//
// 작성 규약 (release body markdown):
//   📥 다운로드: ...
//   ---
//   ## 요약
//   - 변경 1
//   - 변경 2
//   ## 본문
//   ...
//
// GitHub atom feed 의 HTML 결과 (GitHub 이 heading 에 anchor 자동 inject):
//   <h2><a id="user-content-요약"></a>요약</h2>
//   <ul>
//   <li>변경 1</li>
//   <li>변경 2</li>
//   </ul>
//
// markdown 원본 입력도 호환 (단위 테스트·non-GitHub source 대응).
// heading·list 없으면 null → caller 가 fallback prompt 사용.

const HTML_SUMMARY_RE = /<h2[^>]*>\s*(?:<a[^>]*>\s*<\/a>\s*)?요약\s*<\/h2>\s*<ul>([\s\S]*?)<\/ul>/i
const HTML_LI_RE = /<li>([\s\S]*?)<\/li>/g
const MD_SUMMARY_HEADING_RE = /^##\s+요약\s*$/

function htmlEntitiesDecode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

function htmlToPlainText(html: string): string {
  return htmlEntitiesDecode(stripTags(html)).trim()
}

function parseHtmlSummary(text: string): string | null {
  const m = HTML_SUMMARY_RE.exec(text)
  if (!m) return null
  const ulInner = m[1]
  const items: string[] = []
  HTML_LI_RE.lastIndex = 0
  let li: RegExpExecArray | null
  while ((li = HTML_LI_RE.exec(ulInner)) !== null) {
    const plain = htmlToPlainText(li[1])
    if (plain.length > 0) items.push(`- ${plain}`)
  }
  return items.length > 0 ? items.join('\n') : null
}

function parseMdSummary(text: string): string | null {
  const lines = text.split('\n')
  const headingIdx = lines.findIndex((line) => MD_SUMMARY_HEADING_RE.test(line))
  if (headingIdx === -1) return null
  const items: string[] = []
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^##?\s/.test(line)) break
    const m = line.match(/^\s*[-*+]\s+(.*)$/)
    if (m) items.push(`- ${m[1].trim()}`)
  }
  return items.length > 0 ? items.join('\n') : null
}

export function parseReleaseSummary(
  releaseNotes: string | ReleaseNoteInfo[] | null | undefined
): string | null {
  if (!releaseNotes) return null
  const text =
    typeof releaseNotes === 'string'
      ? releaseNotes
      : releaseNotes
          .map((r) => r.note ?? '')
          .filter((s) => s.length > 0)
          .join('\n\n')
  return parseHtmlSummary(text) ?? parseMdSummary(text)
}

// electron-builder.yml 의 publish: { owner: Seober, repo: InvestingWidget } 와 동기화.
// 깨지면 "본문 보기" 버튼 클릭 시 GitHub 가 404 페이지를 보여줘 사용자가 즉시 인지 — 조용한 실패 없음.
export function buildReleaseUrl(version: string): string {
  return `https://github.com/Seober/InvestingWidget/releases/tag/v${version}`
}
