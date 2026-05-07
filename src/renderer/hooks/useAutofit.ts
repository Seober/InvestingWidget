import { useCallback, type RefObject } from 'react'

interface Refs {
  appRef: RefObject<HTMLDivElement>
  rowsRef: RefObject<HTMLDivElement>
  headerRef: RefObject<HTMLDivElement>
}

interface Result {
  autofitHeight: () => void
  autofitWidth: () => void
}

// 가장자리 더블클릭 시 위젯 높이/너비를 콘텐츠 자연 크기로 자동맞춤.
// flashFeedback: 호출 시 .app 에 220ms .autofitting 클래스 부착 → lime 시각 피드백.
export function useAutofit(refs: Refs): Result {
  const flashFeedback = useCallback(() => {
    const el = refs.appRef.current
    if (!el) return
    el.classList.add('autofitting')
    window.setTimeout(() => el.classList.remove('autofitting'), 220)
  }, [refs.appRef])

  const autofitHeight = useCallback(() => {
    flashFeedback()
    // .rows 는 flex:1 로 부모 따라 늘어남 → scrollHeight 가 콘텐츠 자연 높이 대신
    // .rows 자체 영역을 반환(W3C: 콘텐츠가 컨테이너에 다 들어가면 scrollHeight = clientHeight).
    // 자식 .row 들의 offsetHeight 합 + gap 으로 정확한 콘텐츠 자연 높이 측정.
    const rowsEl = refs.rowsRef.current
    let rowsH = 0
    if (rowsEl) {
      const children = rowsEl.children
      const n = children.length
      for (let i = 0; i < n; i++) {
        rowsH += (children[i] as HTMLElement).offsetHeight
      }
      if (n > 1) rowsH += n - 1 // .rows { gap: 1px }
    }
    const headerH = refs.headerRef.current?.offsetHeight ?? 0
    // .app vertical padding 4*2 = 8, .header margin-bottom 2, .app border 1*2 = 2
    const target = 8 + headerH + 2 + rowsH + 2
    void window.api.window.setContentSize({ height: target })
  }, [flashFeedback, refs.rowsRef, refs.headerRef])

  const autofitWidth = useCallback(() => {
    flashFeedback()
    const el = refs.appRef.current
    if (!el) return
    el.classList.add('measuring-width')
    // offsetWidth는 padding + border 포함 — 윈도우 contentSize에 그대로 사용 가능
    const naturalW = el.offsetWidth + 2
    el.classList.remove('measuring-width')
    void window.api.window.setContentSize({ width: naturalW })
  }, [flashFeedback, refs.appRef])

  return { autofitHeight, autofitWidth }
}
