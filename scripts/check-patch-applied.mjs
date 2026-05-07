// patch-package fragility 가드 — node_modules/app-builder-lib 의 NSIS template 이
// patches/app-builder-lib+25.1.8.patch 에 의해 변경됐는지 build 전 확인.
// 미적용 시 critical safety fix (INSTDIR sanitize 정확 매치) 가 빠진 채 빌드되어
// uninstall 시 다른 파일 삭제 위험. CI 에서 prebuild 로 호출해 fail-fast.
//
// 검증 방법: assistedInstaller.nsh 에 patch 가 도입한 marker 문자열이 있고,
// 제거된 StrContains.nsh include 가 없는지 둘 다 확인.

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const NSH = resolve('node_modules/app-builder-lib/templates/nsis/assistedInstaller.nsh')

if (!existsSync(NSH)) {
  console.error(
    `[check-patch-applied] ${NSH} 미존재 — node_modules 가 설치 안 됐거나 layout 변경. npm ci 후 재시도.`
  )
  process.exit(1)
}

const contents = readFileSync(NSH, 'utf8')

// patch 에 의해 도입된 marker — 사용자 수정 sanitize 함수 안 주석.
const PATCHED_MARKER = '마지막 segment'
// patch 에 의해 제거된 줄 — StrContains.nsh include.
const REMOVED_INCLUDE = '!include StrContains.nsh'

const hasMarker = contents.includes(PATCHED_MARKER)
const hasRemovedInclude = contents.includes(REMOVED_INCLUDE)

if (hasMarker && !hasRemovedInclude) {
  console.log('[check-patch-applied] OK — patches/app-builder-lib+25.1.8.patch 적용 확인.')
  process.exit(0)
}

if (!hasMarker) {
  console.error(
    '[check-patch-applied] FAIL — patch marker 미발견. patch-package 미실행 또는 app-builder-lib 버전 불일치.'
  )
}
if (hasRemovedInclude) {
  console.error(
    '[check-patch-applied] FAIL — StrContains.nsh include 가 그대로 — patch 가 적용 안 됨.'
  )
}
console.error(
  '\n해결: npm ci 재실행 (postinstall 의 patch-package 가 적용). 또는 node_modules/app-builder-lib 버전 확인 후 patches/ 갱신.'
)
process.exit(1)
