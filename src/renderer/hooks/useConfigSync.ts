import { useEffect } from 'react'
import type { AppConfig } from '@shared/schema'

// main 의 config 를 처음 한 번 로드 + 이후 onChange 구독으로 동기화.
export function useConfigSync(setConfig: (cfg: AppConfig) => void): void {
  useEffect(() => {
    void window.api.config.get().then(setConfig)
    return window.api.config.onChange(setConfig)
  }, [setConfig])
}
