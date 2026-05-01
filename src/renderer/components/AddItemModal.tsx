import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { AssetType, ItemConfig } from '@shared/schema'

interface Props {
  initial?: ItemConfig | null
  onClose: () => void
  onSubmit: (item: Omit<ItemConfig, 'id'> & { id?: string }) => Promise<void>
  templates: Record<string, string>
}

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'crypto-spot', label: '암호화폐 현물' },
  { value: 'crypto-perp', label: '암호화폐 선물 (USDT-M)' },
  { value: 'stock-us', label: '미국 주식' },
  { value: 'etf-us', label: '미국 ETF' },
  { value: 'stock-kr', label: '한국 주식' }
]

export function AddItemModal({ initial, onClose, onSubmit, templates }: Props) {
  const [symbol, setSymbol] = useState(initial?.symbol ?? '')
  const [assetType, setAssetType] = useState<AssetType>(initial?.assetType ?? 'crypto-spot')
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [quoteCurrency, setQuoteCurrency] = useState(initial?.quoteCurrency ?? 'USDT')
  const [clickThroughUrl, setClickThroughUrl] = useState(initial?.clickThroughUrl ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => setError(null), [symbol, assetType])

  // Document-level Esc: cancel during validation, close otherwise.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (submitting) {
        cancelledRef.current = true
        window.api.items.cancelValidate()
        setSubmitting(false)
        setError('취소됨')
      } else {
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [submitting, onClose])

  const isCrypto = assetType === 'crypto-spot' || assetType === 'crypto-perp'
  const previewUrl = clickThroughUrl.trim() || templates[assetType] || ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!symbol.trim()) {
      setError('심볼을 입력하세요.')
      return
    }
    setSubmitting(true)
    setError(null)
    cancelledRef.current = false
    try {
      await onSubmit({
        id: initial?.id,
        symbol: symbol.trim().toUpperCase(),
        assetType,
        displayName: displayName.trim() || undefined,
        quoteCurrency: isCrypto ? quoteCurrency.trim().toUpperCase() : undefined,
        clickThroughUrl: clickThroughUrl.trim() || undefined
      })
      if (!cancelledRef.current) onClose()
    } catch (err: any) {
      if (!cancelledRef.current) setError(err?.message ?? '저장 실패')
    } finally {
      if (!cancelledRef.current) setSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (submitting) {
      cancelledRef.current = true
      window.api.items.cancelValidate()
      setSubmitting(false)
      setError('취소됨')
    } else {
      onClose()
    }
  }

  const handleFormKeyDown = (e: ReactKeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault()
      void handleSubmit(e as unknown as React.FormEvent)
    }
    if (e.key === 'Escape') {
      if (submitting) handleCancel()
      else onClose()
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
        <h2>{initial ? '항목 편집' : '항목 추가'}</h2>

        <label>
          자산 유형
          <select
            value={assetType}
            onChange={(e) => setAssetType(e.target.value as AssetType)}
            disabled={submitting}
          >
            {ASSET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          심볼
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder={
              assetType === 'stock-kr'
                ? '예: 005930 또는 KOSDAQ:091990'
                : isCrypto
                  ? '예: BTC'
                  : '예: AAPL'
            }
            disabled={submitting}
            autoFocus
          />
        </label>

        {isCrypto && (
          <label>
            Quote 통화
            <input
              value={quoteCurrency}
              onChange={(e) => setQuoteCurrency(e.target.value)}
              disabled={submitting}
            />
          </label>
        )}

        <label>
          표시 이름 (선택)
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="비워두면 심볼"
            disabled={submitting}
          />
        </label>

        <label>
          클릭 시 이동 URL (선택)
          <input
            value={clickThroughUrl}
            onChange={(e) => setClickThroughUrl(e.target.value)}
            placeholder={templates[assetType] || ''}
            disabled={submitting}
          />
          <small className="muted">미리보기: {previewUrl}</small>
        </label>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" onClick={handleCancel}>
            {submitting ? '취소' : '닫기'}
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? '저장 중…' : initial ? '저장' : '추가'}
          </button>
        </div>
      </form>
    </div>
  )
}
