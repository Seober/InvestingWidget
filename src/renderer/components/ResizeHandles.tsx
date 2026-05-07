import { useEffect, useRef } from 'react'
import type { ResizeEdge } from '@shared/schema'

interface HandleSpec {
  edge: ResizeEdge
  cls: string
}

const HANDLES: HandleSpec[] = [
  { edge: 'top', cls: 'resize-top' },
  { edge: 'bottom', cls: 'resize-bottom' },
  { edge: 'left', cls: 'resize-left' },
  { edge: 'right', cls: 'resize-right' },
  { edge: 'tl', cls: 'resize-tl' },
  { edge: 'tr', cls: 'resize-tr' },
  { edge: 'bl', cls: 'resize-bl' },
  { edge: 'br', cls: 'resize-br' }
]

interface Props {
  onAutofitHeight: () => void
  onAutofitWidth: () => void
}

const DRAG_THRESHOLD_PX = 5

export function ResizeHandles({ onAutofitHeight, onAutofitWidth }: Props) {
  const startedRef = useRef<{ edge: ResizeEdge; x: number; y: number } | null>(null)
  const draggingRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const s = startedRef.current
      if (!s) return
      if (!draggingRef.current) {
        const dx = e.screenX - s.x
        const dy = e.screenY - s.y
        if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return
        draggingRef.current = true
        window.api.resize.start(s.edge)
      }
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          window.api.resize.move()
        })
      }
    }
    const onUp = () => {
      const wasDragging = draggingRef.current
      startedRef.current = null
      draggingRef.current = false
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (wasDragging) {
        window.api.resize.end()
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const handleMouseDown = (edge: ResizeEdge) => (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    startedRef.current = { edge, x: e.screenX, y: e.screenY }
    draggingRef.current = false
  }

  const handleDoubleClick = (edge: ResizeEdge) => (e: React.MouseEvent) => {
    e.stopPropagation()
    if (edge === 'top' || edge === 'bottom') {
      onAutofitHeight()
    } else if (edge === 'left' || edge === 'right') {
      onAutofitWidth()
    } else {
      onAutofitHeight()
      onAutofitWidth()
    }
  }

  return (
    <>
      {HANDLES.map(({ edge, cls }) => (
        <div
          key={edge}
          className={`resize-handle ${cls}`}
          onMouseDown={handleMouseDown(edge)}
          onDoubleClick={handleDoubleClick(edge)}
        />
      ))}
    </>
  )
}
