import { useEffect, useRef } from 'react'

const DRAG_THRESHOLD_PX = 5
const NON_DRAG_SELECTOR =
  '.modal-backdrop, input, select, textarea, button, .no-drag, [data-no-drag], .resize-handle'

export function useDrag(opts: {
  onClick?: (target: EventTarget | null) => void
  onContextMenu?: (target: EventTarget | null) => void
}) {
  const startedRef = useRef<{ x: number; y: number; target: EventTarget | null } | null>(null)
  const draggingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  // optsRef 패턴 — 콜백 identity 가 매 렌더 변해도 effect 재구독 회피.
  // ref.current 갱신은 매 렌더 동기 적용. effect 안 핸들러는 항상 최신 콜백 호출.
  // useEffect 가 외부 reactive value 참조 X (ref 만) → exhaustive-deps lint 자체 trigger X.
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    const isNonDragTarget = (target: EventTarget | null): boolean => {
      const el = target as Element | null
      if (!el || !('closest' in el)) return false
      return el.closest(NON_DRAG_SELECTOR) !== null
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (isNonDragTarget(e.target)) return
      startedRef.current = { x: e.screenX, y: e.screenY, target: e.target }
      draggingRef.current = false
    }

    const onMouseMove = (e: MouseEvent) => {
      const s = startedRef.current
      if (!s) return
      const dx = e.screenX - s.x
      const dy = e.screenY - s.y
      if (!draggingRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        draggingRef.current = true
        window.api.drag.start()
      }
      if (draggingRef.current) {
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null
            window.api.drag.move()
          })
        }
      }
    }

    const onMouseUp = (e: MouseEvent) => {
      const s = startedRef.current
      if (!s) return
      const wasDragging = draggingRef.current
      startedRef.current = null
      draggingRef.current = false
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (wasDragging) {
        window.api.drag.end()
        return
      }
      if (e.button === 0) {
        optsRef.current.onClick?.(s.target)
      }
    }

    const onContextMenu = (e: MouseEvent) => {
      if (isNonDragTarget(e.target)) return
      e.preventDefault()
      optsRef.current.onContextMenu?.(e.target)
    }

    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('contextmenu', onContextMenu)
    }
  }, [])
}
