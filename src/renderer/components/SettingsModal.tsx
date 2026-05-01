import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { AppConfig, AssetType, Theme } from '@shared/schema'

interface Props {
  config: AppConfig
  onClose: () => void
  onSave: (patch: Partial<AppConfig>) => Promise<void>
}

const ASSET_LABELS: Record<AssetType, string> = {
  'crypto-spot': '암호화폐 현물',
  'crypto-perp': '암호화폐 선물',
  'stock-us': '미국 주식',
  'etf-us': '미국 ETF',
  'stock-kr': '한국 주식'
}

export function SettingsModal({ config, onClose, onSave }: Props) {
  const [refreshIntervalMs, setRefresh] = useState(config.refreshIntervalMs)
  const [finnhubApiKey, setFinnhubApiKey] = useState(config.finnhubApiKey)
  const [tradingViewEnabled, setTvEnabled] = useState(config.tradingViewEnabled)
  const [theme, setTheme] = useState<Theme>(config.theme)
  const [fontSize, setFontSize] = useState(config.fontSize)
  const [opMin, setOpMin] = useState(config.defaults.opacityBounds.min)
  const [opMax, setOpMax] = useState(config.defaults.opacityBounds.max)
  const [templates, setTemplates] = useState(config.defaults.clickThroughTemplates)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const updateTemplate = (k: AssetType, v: string) => setTemplates((t) => ({ ...t, [k]: v }))

  const handleFormKeyDown = (e: ReactKeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault()
      void handleSave(e as unknown as React.FormEvent)
    }
    if (e.key === 'Escape') onClose()
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        refreshIntervalMs,
        finnhubApiKey,
        tradingViewEnabled,
        theme,
        fontSize,
        defaults: {
          ...config.defaults,
          opacityBounds: { min: Math.min(opMin, opMax), max: Math.max(opMin, opMax) },
          clickThroughTemplates: templates
        }
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal modal-wide" onSubmit={handleSave} onKeyDown={handleFormKeyDown}>
        <h2>설정</h2>

        <label>
          갱신 간격 (ms): {refreshIntervalMs}
          <input
            type="range"
            min={100}
            max={5000}
            step={50}
            value={refreshIntervalMs}
            onChange={(e) => setRefresh(Number(e.target.value))}
          />
          <small className="muted">UI 렌더 throttle. WebSocket 데이터는 더 빠르게 들어옵니다.</small>
        </label>

        <label>
          Finnhub API 키 (미국 주식/ETF용)
          <input
            type="password"
            value={finnhubApiKey}
            onChange={(e) => setFinnhubApiKey(e.target.value)}
            placeholder="finnhub.io에서 무료 발급"
          />
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={tradingViewEnabled}
            onChange={(e) => setTvEnabled(e.target.checked)}
          />
          TradingView 어댑터 활성화 (한국 주식, 비공식 — 실험적)
        </label>

        <label>
          테마
          <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            <option value="dark">다크</option>
            <option value="light">라이트</option>
            <option value="auto">시스템</option>
          </select>
        </label>

        <label>
          폰트 크기: {fontSize}px
          <input
            type="range"
            min={10}
            max={20}
            step={1}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
        </label>

        <fieldset>
          <legend>투명도 범위</legend>
          <label>
            최소: {opMin.toFixed(2)}
            <input
              type="range"
              min={0.05}
              max={0.5}
              step={0.05}
              value={opMin}
              onChange={(e) => setOpMin(Number(e.target.value))}
            />
          </label>
          <label>
            최대: {opMax.toFixed(2)}
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.05}
              value={opMax}
              onChange={(e) => setOpMax(Number(e.target.value))}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>자산 유형별 기본 클릭 이동 URL 템플릿</legend>
          {(Object.keys(ASSET_LABELS) as AssetType[]).map((k) => (
            <label key={k}>
              {ASSET_LABELS[k]}
              <input value={templates[k]} onChange={(e) => updateTemplate(k, e.target.value)} />
            </label>
          ))}
          <small className="muted">치환 변수: {'{symbol}, {base}, {quote}'}</small>
        </fieldset>

        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button type="submit" disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </div>
  )
}
