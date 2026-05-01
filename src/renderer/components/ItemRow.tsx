import { useEffect, useRef, useState } from 'react'
import type { ItemConfig, SourceId } from '@shared/schema'

const SOURCE_LABELS: Record<SourceId, string> = {
  'binance-spot': 'Binance Spot',
  'binance-perp': 'Binance Futures',
  'gateio-spot': 'Gate.io Spot',
  'gateio-perp': 'Gate.io Futures',
  finnhub: 'Finnhub',
  tradingview: 'TradingView'
}

interface Props {
  item: ItemConfig
  price?: number
  changePct?: number
  status?: 'open' | 'closed' | 'connecting' | 'reconnecting'
  errorMessage?: string
  needsApiKey: boolean
  isExperimental: boolean
}

function formatPrice(price: number, assetType: ItemConfig['assetType']): string {
  if (!Number.isFinite(price)) return '—'
  const abs = Math.abs(price)
  let digits: number
  if (abs >= 1000) digits = 2
  else if (abs >= 1) digits = 4
  else if (abs >= 0.01) digits = 5
  else digits = 8
  const symbol = currencyPrefix(assetType)
  return symbol + price.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function currencyPrefix(assetType: ItemConfig['assetType']): string {
  switch (assetType) {
    case 'stock-kr':
      return '₩'
    case 'stock-us':
    case 'etf-us':
      return '$'
    default:
      return ''
  }
}

function formatChange(pct?: number): string {
  if (pct === undefined || !Number.isFinite(pct)) return '—'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

export function ItemRow({
  item,
  price,
  changePct,
  status,
  errorMessage,
  needsApiKey,
  isExperimental
}: Props) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const prevPriceRef = useRef<number | undefined>(price)

  useEffect(() => {
    const prev = prevPriceRef.current
    if (prev !== undefined && price !== undefined && prev !== price) {
      setFlash(price > prev ? 'up' : 'down')
      const t = setTimeout(() => setFlash(null), 200)
      prevPriceRef.current = price
      return () => clearTimeout(t)
    }
    prevPriceRef.current = price
    return
  }, [price])

  const changeClass =
    changePct === undefined ? 'change-neutral' : changePct > 0 ? 'change-up' : changePct < 0 ? 'change-down' : 'change-neutral'

  const sourceTooltip = item.source ? `시세 출처: ${SOURCE_LABELS[item.source]}` : ''
  const tooltip = errorMessage || sourceTooltip
  const baseLabel = item.displayName?.trim() ? item.displayName : item.symbol
  const isPerp = item.assetType === 'crypto-perp'

  return (
    <div
      className={`row ${flash ? `flash-${flash}` : ''}`}
      data-item-id={item.id}
      title={tooltip}
    >
      <span className="symbol">
        {baseLabel}
        {isPerp && <span className="suffix-perp">(f)</span>}
        {needsApiKey && <span className="chip chip-warn">🔑</span>}
        {isExperimental && <span className="chip chip-warn">⚠</span>}
        {status === 'reconnecting' && <span className="chip">⏳</span>}
        {status === 'closed' && !needsApiKey && <span className="chip chip-warn">⏸</span>}
      </span>
      <span className="price">{price !== undefined ? formatPrice(price, item.assetType) : '—'}</span>
      <span className={`change ${changeClass}`}>{formatChange(changePct)}</span>
    </div>
  )
}
