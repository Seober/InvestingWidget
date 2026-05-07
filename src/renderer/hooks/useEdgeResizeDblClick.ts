import { useEffect } from 'react'

// React onDoubleClick prop 대신 글로벌 window dblclick listener 사용 — React 합성 이벤트가
// 일부 환경(transparent + frameless + handle div 조합) 에서 발화 누락 가능성 회피.
// e.target.closest('.resize-handle') + data-resize-edge attribute 로 어느 핸들인지 판정.
export function useEdgeResizeDblClick(autofitHeight: () => void, autofitWidth: () => void): void {
  useEffect(() => {
    const onDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const handle = target?.closest('.resize-handle')
      if (!handle) return
      const edge = handle.getAttribute('data-resize-edge')
      if (!edge) return
      if (edge === 'top' || edge === 'bottom') {
        autofitHeight()
      } else if (edge === 'left' || edge === 'right') {
        autofitWidth()
      } else {
        autofitHeight()
        autofitWidth()
      }
    }
    window.addEventListener('dblclick', onDblClick)
    return () => window.removeEventListener('dblclick', onDblClick)
  }, [autofitHeight, autofitWidth])
}
