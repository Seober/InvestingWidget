import { useEffect, useState } from 'react'
import type { AssetType, ItemConfig } from '@shared/schema'

const ASSET_LABELS: Record<AssetType, string> = {
  'crypto-spot': '현물',
  'crypto-perp': '선물',
  'stock-us': '미국주식',
  'etf-us': '미국ETF',
  'stock-kr': '한국주식'
}

interface Props {
  initialItems: ItemConfig[]
  onClose: () => void
  onSave: (items: ItemConfig[]) => Promise<void>
  onEditItem: (itemId: string) => void
}

export function ListEditModal({ initialItems, onClose, onSave, onEditItem }: Props) {
  const [items, setItems] = useState<ItemConfig[]>(initialItems)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [saving, onClose])

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id))
  const noneSelected = selected.size === 0

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))
  }
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDeleteSelected = () => {
    if (noneSelected) return
    setItems((prev) => prev.filter((i) => !selected.has(i.id)))
    setSelected(new Set())
  }

  const onDragStart = (e: React.DragEvent, idx: number) => {
    setDraggingIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (draggingIdx === null || draggingIdx === idx) return
    setItems((prev) => {
      const next = [...prev]
      const [moved] = next.splice(draggingIdx, 1)
      next.splice(idx, 0, moved)
      return next
    })
    setDraggingIdx(idx)
  }
  const onDragEnd = () => setDraggingIdx(null)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(items)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleEditRow = async (id: string) => {
    setSaving(true)
    try {
      await onSave(items)
      onEditItem(id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div className="modal modal-list-edit">
        <h2>목록 편집</h2>

        <div className="list-edit-table">
          <div className="list-edit-row list-edit-head">
            <span className="list-edit-handle-cell" />
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={items.length === 0}
              aria-label="전체 선택"
            />
            <span className="list-edit-col-symbol">심볼</span>
            <span className="list-edit-col-type">유형</span>
            <span className="list-edit-col-actions" />
          </div>

          <div className="list-edit-rows">
            {items.length === 0 && <div className="empty">항목이 없습니다.</div>}
            {items.map((it, idx) => {
              const label = it.displayName?.trim()
                ? `${it.displayName} (${it.symbol})`
                : it.symbol
              const isDragging = draggingIdx === idx
              return (
                <div
                  key={it.id}
                  className={`list-edit-row ${isDragging ? 'is-dragging' : ''}`}
                  draggable
                  onDragStart={(e) => onDragStart(e, idx)}
                  onDragOver={(e) => onDragOver(e, idx)}
                  onDragEnd={onDragEnd}
                >
                  <span className="list-edit-handle-cell" title="끌어서 순서 변경">
                    ⋮⋮
                  </span>
                  <input
                    type="checkbox"
                    checked={selected.has(it.id)}
                    onChange={() => toggleOne(it.id)}
                    aria-label={`${label} 선택`}
                  />
                  <span className="list-edit-col-symbol">{label}</span>
                  <span className="list-edit-col-type">{ASSET_LABELS[it.assetType]}</span>
                  <button
                    type="button"
                    className="list-edit-edit-btn"
                    onClick={() => handleEditRow(it.id)}
                    disabled={saving}
                  >
                    편집
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="list-edit-footer">
          <button
            type="button"
            className="list-edit-delete-btn"
            onClick={handleDeleteSelected}
            disabled={noneSelected || saving}
          >
            선택 항목 삭제 ({selected.size})
          </button>
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button
              type="button"
              className="list-edit-save-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
