import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { AssetType, ItemConfig, SourceId, SymbolSuggestion } from '@shared/schema'
import { SymbolAutocomplete } from './SymbolAutocomplete'

interface Props {
  initial?: ItemConfig | null
  existingItems: ItemConfig[]
  onClose: () => void
  onSubmit: (item: Omit<ItemConfig, 'id'> & { id?: string }) => Promise<void>
  templates: Record<string, string>
}

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'crypto-spot', label: '암호화폐 현물' },
  { value: 'crypto-perp', label: '암호화폐 선물 (USDT-M)' },
  { value: 'stock-us', label: '미국 주식' },
  { value: 'etf-us', label: '미국 ETF' },
  { value: 'stock-kr', label: '한국 주식' },
  { value: 'etf-kr', label: '한국 ETF' },
]

export function AddItemModal({ initial, existingItems, onClose, onSubmit, templates }: Props) {
  const [symbol, setSymbol] = useState(initial?.symbol ?? '')
  const [assetType, setAssetType] = useState<AssetType>(initial?.assetType ?? 'crypto-spot')
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [quoteCurrency, setQuoteCurrency] = useState(initial?.quoteCurrency ?? 'USDT')
  const [clickThroughUrl, setClickThroughUrl] = useState(initial?.clickThroughUrl ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 자동완성에서 선택된 항목의 어댑터 힌트 — validate 시 우선 시도해 NUMI 같은 단일 거래소 토큰 지연 회피.
  // 사용자가 픽 후 직접 타이핑하면 무효화 (잘못된 힌트 방지).
  const [pickedSource, setPickedSource] = useState<SourceId | undefined>(initial?.source)
  const cancelledRef = useRef(false)

  useEffect(() => setError(null), [symbol, assetType])

  // 자산 유형이 바뀌면 심볼·표시이름·source 힌트 초기화. 최초 마운트(편집 모드 포함)는 건너뜀.
  const prevAssetTypeRef = useRef(assetType)
  useEffect(() => {
    if (assetType === prevAssetTypeRef.current) return
    prevAssetTypeRef.current = assetType
    setSymbol('')
    setDisplayName('')
    setPickedSource(undefined)
  }, [assetType])

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

  // form submit 핵심 로직 — event 인자 안 받아 Enter 키 핸들러도 직접 호출 가능.
  const submitForm = async (): Promise<void> => {
    const rawInput = symbol.trim()
    if (!rawInput) {
      setError('심볼을 입력하세요.')
      return
    }
    setSubmitting(true)
    setError(null)
    cancelledRef.current = false
    try {
      let finalSymbol: string
      let finalDisplayName = displayName.trim()

      if (assetType === 'stock-kr' || assetType === 'etf-kr') {
        // Naver autocomplete로 종목 존재 검증 + 이름 자동 채움 (한국 주식·ETF 동일).
        // 코드/접두사 입력도 동일하게 통과시키되, Naver가 못 찾으면 (일부 코스닥
        // 코드가 자동완성에 빠져 있는 경우) 사용자 입력을 신뢰. 이름 입력은 엄격 검증.
        // 6자리 코드 — 순수 숫자(005930) 또는 영숫자 혼합(0023A0, 0167A0 등 신규 ETF).
        const isCode = /^[0-9A-Z]{6}$/i.test(rawInput)
        const prefixedMatch = /^(KRX|KOSDAQ|KOSPI|KONEX):([0-9A-Z]{6})$/i.exec(rawInput)
        const isPrefixed = !!prefixedMatch
        const queryForResolve = prefixedMatch ? prefixedMatch[2] : rawInput
        const match = await window.api.kr.resolve(queryForResolve)
        if (cancelledRef.current) return
        if (match) {
          // KOSPI는 toTVSymbol이 KRX: 접두사를 자동 추가하므로 코드만 저장.
          // 그 외 시장(KOSDAQ/KONEX)은 명시적으로 접두사 포함해야 TradingView 인식.
          finalSymbol = match.market === 'KOSPI' ? match.code : `${match.market}:${match.code}`
          if (!finalDisplayName) finalDisplayName = match.name
        } else if (isCode || isPrefixed) {
          // Naver는 못 찾았지만 사용자가 코드 형식으로 명시 → 신뢰.
          finalSymbol = rawInput.toUpperCase()
        } else {
          throw new Error(`'${rawInput}'에 해당하는 종목을 찾지 못했습니다`)
        }
      } else {
        finalSymbol = rawInput.toUpperCase()
      }

      // 중복 등록 차단 — 같은 자산유형·심볼·(crypto면 quote)이면 거부.
      // 편집 모드에서는 자기 자신은 제외.
      const normalizedFinalSymbol = finalSymbol.toUpperCase()
      const normalizedQuote = isCrypto ? quoteCurrency.trim().toUpperCase() : ''
      const dup = existingItems.find((other) => {
        if (initial?.id && other.id === initial.id) return false
        if (other.assetType !== assetType) return false
        if ((other.symbol ?? '').toUpperCase() !== normalizedFinalSymbol) return false
        if (isCrypto) {
          const otherQuote = (other.quoteCurrency ?? 'USDT').toUpperCase()
          if (otherQuote !== normalizedQuote) return false
        }
        return true
      })
      if (dup) {
        const dupLabel = dup.displayName?.trim() || dup.symbol
        throw new Error(`이미 등록한 종목입니다: ${dupLabel}`)
      }

      await onSubmit({
        id: initial?.id,
        symbol: finalSymbol,
        assetType,
        displayName: finalDisplayName || undefined,
        quoteCurrency: isCrypto ? quoteCurrency.trim().toUpperCase() : undefined,
        clickThroughUrl: clickThroughUrl.trim() || undefined,
        source: pickedSource,
      })
      if (!cancelledRef.current) onClose()
    } catch (err: unknown) {
      if (!cancelledRef.current) {
        const msg = (err as { message?: string } | null)?.message ?? '저장 실패'
        setError(msg)
      }
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void submitForm()
  }

  const handleFormKeyDown = (e: ReactKeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault()
      void submitForm()
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
          <SymbolAutocomplete
            assetType={assetType}
            quoteCurrency={isCrypto ? quoteCurrency : undefined}
            value={symbol}
            onChange={(v) => {
              setSymbol(v)
              // 사용자가 직접 입력 → 이전 자동완성 픽의 source 힌트 무효화
              setPickedSource(undefined)
            }}
            onSelect={(s: SymbolSuggestion) => {
              // KOSDAQ/KONEX는 storeAs로 prefix 포함 형태 저장. 그 외는 symbol 그대로.
              setSymbol(s.storeAs ?? s.symbol)
              if (!displayName.trim()) setDisplayName(s.name)
              setPickedSource(s.source)
            }}
            disabled={submitting}
            autoFocus
            placeholder={
              assetType === 'stock-kr'
                ? '예: 005930 · 삼성전자 · KOSDAQ:091990'
                : assetType === 'etf-kr'
                  ? '예: 069500 · KODEX 200 · 305720'
                  : isCrypto
                    ? '예: BTC · Bitcoin'
                    : '예: AAPL · Apple'
            }
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
