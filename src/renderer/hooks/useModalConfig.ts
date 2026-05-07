import { useEffect, useState } from 'react'
import type { AppConfig } from '@shared/schema'

// Modal route 4 종 (AddItem/Settings/ListEdit/UpdaterProgress) 의 config 초기 로드
// boilerplate 통합. main 의 config 한 번 받아 state 보관 — onChange 구독은 안 함
// (modal 은 짧은 lifetime, save 시 close 하므로 mid-modal 변경 무시 OK).
export function useModalConfig(): AppConfig | null {
  const [config, setConfig] = useState<AppConfig | null>(null)
  useEffect(() => {
    void window.api.config.get().then(setConfig)
  }, [])
  return config
}
