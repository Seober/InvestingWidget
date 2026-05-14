import type { ReleaseNoteInfo } from 'builder-util-runtime'

// GitHub release body 의 <!-- summary --> ... <!-- /summary --> 사이 텍스트 추출.
// 업데이트 발견 dialog 의 detail 영역에 3줄 요약을 표시하기 위한 파서.
//
// 작성 규약 (release body 형식):
//   [InvestingWidget-x.y.z.zip 다운로드](...)
//
//   <!-- summary -->
//   - 변경사항 1
//   - 변경사항 2
//   - 변경사항 3
//   <!-- /summary -->
//
//   ## 본문 ...
//
// 마커가 없거나 내용이 비면 null → caller 가 fallback prompt 사용.
// 정규식의 \s* 는 마커 안팎 공백 허용, [\s\S]*? 는 lazy multi-line 매칭, /i 는 대소문자 변형 (Summary 등) 허용.
const SUMMARY_RE = /<!--\s*summary\s*-->([\s\S]*?)<!--\s*\/summary\s*-->/i

export function parseReleaseSummary(
  releaseNotes: string | ReleaseNoteInfo[] | null | undefined
): string | null {
  if (!releaseNotes) return null
  // ReleaseNoteInfo[] 케이스 — 여러 버전의 note 가 누적될 수 있음. 각 note 의 string 만 합쳐 검색.
  const text =
    typeof releaseNotes === 'string'
      ? releaseNotes
      : releaseNotes
          .map((r) => r.note ?? '')
          .filter((s) => s.length > 0)
          .join('\n\n')
  const match = SUMMARY_RE.exec(text)
  if (!match) return null
  const summary = match[1].trim()
  return summary.length > 0 ? summary : null
}

// electron-builder.yml 의 publish: { owner: Seober, repo: InvestingWidget } 와 동기화.
// 깨지면 "본문 보기" 버튼 클릭 시 GitHub 가 404 페이지를 보여줘 사용자가 즉시 인지 — 조용한 실패 없음.
export function buildReleaseUrl(version: string): string {
  return `https://github.com/Seober/InvestingWidget/releases/tag/v${version}`
}
