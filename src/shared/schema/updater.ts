// 자동 업데이트 다운로드 진행 정보 — main → renderer IPC payload.
// electron-updater 의 ProgressInfo 와 동일한 shape 이지만, renderer/preload/main
// 3 곳 중복 회피 위해 단일 source 로 추출.
export interface UpdateProgressInfo {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

// 자동 업데이트 다운로드 완료 이벤트 — main → renderer IPC payload.
export interface UpdateDownloadedInfo {
  version: string
}
