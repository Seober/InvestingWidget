import { useEffect, useRef, useState } from 'react'
import type { AssetType, SymbolSuggestion } from '@shared/schema'

const DEBOUNCE_MS = 250

interface Props {
  assetType: AssetType
  quoteCurrency?: string
  value: string
  onChange: (value: string) => void
  onSelect: (suggestion: SymbolSuggestion) => void
  disabled?: boolean
  placeholder?: string
  autoFocus?: boolean
}

export function SymbolAutocomplete({
  assetType,
  quoteCurrency,
  value,
  onChange,
  onSelect,
  disabled,
  placeholder,
  autoFocus
}: Props) {
  const [suggestions, setSuggestions] = useState<SymbolSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [loading, setLoading] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const justPickedRef = useRef(false) // skip search-after-select cycle
  // 픽 직후 refocus 시 onFocus의 setOpen(true)를 한 번만 무시 — 안 그러면 "결과 없음" 깜빡임
  const skipNextFocusOpenRef = useRef(false)

  // Debounced search
  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false
      setSuggestions([])
      setLoading(false)
      return
    }
    const q = value.trim()
    if (!q || disabled) {
      setSuggestions([])
      setLoading(false)
      return
    }

    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
    setLoading(true)
    debounceTimerRef.current = setTimeout(() => {
      const myId = ++requestIdRef.current
      void window.api.symbols
        .search({ assetType, query: q, quoteCurrency })
        .then((results) => {
          if (myId !== requestIdRef.current) return
          setSuggestions(results)
          setHighlight(0)
          setLoading(false)
        })
        .catch(() => {
          if (myId !== requestIdRef.current) return
          setSuggestions([])
          setLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
    }
  }, [value, assetType, quoteCurrency, disabled])

  // Click outside closes the dropdown
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const handlePick = (s: SymbolSuggestion) => {
    justPickedRef.current = true
    skipNextFocusOpenRef.current = true
    onChange(s.symbol)
    onSelect(s)
    setOpen(false)
    setSuggestions([])
    // refocus input so user can submit with Enter immediately
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Esc에 최우선 — 드롭다운 열려 있으면 그것만 닫고 (modal까지 닫히는 거 방지),
    // 닫혀 있으면 상위 모달 핸들러로 bubble.
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        e.stopPropagation()
        e.nativeEvent?.stopImmediatePropagation?.()
        setOpen(false)
      }
      return
    }
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter') {
      const s = suggestions[highlight]
      if (s) {
        e.preventDefault()
        e.stopPropagation()
        handlePick(s)
      }
    }
  }

  const showDropdown = open && (loading || suggestions.length > 0 || value.trim().length > 0)

  return (
    <div ref={containerRef} className="autocomplete">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (skipNextFocusOpenRef.current) {
            skipNextFocusOpenRef.current = false
            return
          }
          setOpen(true)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
      />
      {showDropdown && (
        <ul className="autocomplete-dropdown" role="listbox">
          {loading && <li className="autocomplete-loading">검색 중…</li>}
          {!loading && suggestions.length === 0 && value.trim().length > 0 && (
            <li className="autocomplete-empty">결과 없음</li>
          )}
          {!loading &&
            suggestions.map((s, i) => (
              <li
                key={`${s.symbol}-${i}`}
                role="option"
                aria-selected={i === highlight}
                className={i === highlight ? 'highlighted' : ''}
                onMouseDown={(e) => {
                  e.preventDefault() // keep input focused
                  handlePick(s)
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="autocomplete-symbol">{s.symbol}</span>
                <span className="autocomplete-name">{s.name}</span>
                {s.market && <span className="autocomplete-market">{s.market}</span>}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
