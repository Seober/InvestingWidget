import Store from 'electron-store'
import { AppConfig, DefaultsConfig, DEFAULT_CONFIG, WindowConfig } from '@shared/schema'

const CURRENT_SCHEMA_VERSION = 1

function migrate(raw: Partial<AppConfig> & { schemaVersion?: number }): AppConfig {
  const merged: AppConfig = {
    ...DEFAULT_CONFIG,
    ...raw,
    window: { ...DEFAULT_CONFIG.window, ...(raw.window ?? {}) },
    defaults: {
      ...DEFAULT_CONFIG.defaults,
      ...(raw.defaults ?? {}),
      clickThroughTemplates: {
        ...DEFAULT_CONFIG.defaults.clickThroughTemplates,
        ...(raw.defaults?.clickThroughTemplates ?? {})
      },
      opacityBounds: {
        ...DEFAULT_CONFIG.defaults.opacityBounds,
        ...(raw.defaults?.opacityBounds ?? {})
      }
    },
    items: raw.items ?? []
  }
  merged.schemaVersion = CURRENT_SCHEMA_VERSION
  return merged
}

export class ConfigStore {
  private store: Store<AppConfig>
  private memCache: AppConfig
  private saveTimer: NodeJS.Timeout | null = null

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'config',
      defaults: DEFAULT_CONFIG,
      clearInvalidConfig: false
    })
    this.memCache = migrate(this.store.store as Partial<AppConfig>)
    this.store.store = this.memCache
  }

  get(): AppConfig {
    return this.memCache
  }

  set(patch: Partial<AppConfig>): AppConfig {
    this.memCache = migrate({ ...this.memCache, ...patch })
    this.scheduleSave()
    return this.memCache
  }

  // 중첩 필드 부분 업데이트 헬퍼 — `{ window: { ...get().window, ... } }` 스프레드 반복 정리.
  updateWindow(patch: Partial<WindowConfig>): AppConfig {
    return this.set({ window: { ...this.memCache.window, ...patch } })
  }

  updateDefaults(patch: Partial<DefaultsConfig>): AppConfig {
    return this.set({ defaults: { ...this.memCache.defaults, ...patch } })
  }

  setNow(patch: Partial<AppConfig>): AppConfig {
    this.memCache = migrate({ ...this.memCache, ...patch })
    this.store.store = this.memCache
    return this.memCache
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.store.store = this.memCache
    }, 500)
  }

  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.store.store = this.memCache
  }
}
