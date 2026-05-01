import { AppConfig, ItemConfig } from '@shared/schema'

export function resolveClickThroughUrl(item: ItemConfig, config: AppConfig): string | null {
  const templates = config.defaults.clickThroughTemplates
  const template =
    item.clickThroughUrl?.trim() ||
    (item.source ? templates[item.source] : '') ||
    templates[item.assetType] ||
    ''
  if (!template) return null

  const symbolUpper = item.symbol.toUpperCase()
  const quote = (item.quoteCurrency ?? 'USDT').toUpperCase()
  const base = symbolUpper
  const fullSymbol =
    item.assetType === 'crypto-spot' || item.assetType === 'crypto-perp'
      ? `${base}${quote}`
      : symbolUpper

  return template
    .replaceAll('{symbol}', fullSymbol)
    .replaceAll('{base}', base)
    .replaceAll('{quote}', quote)
}
