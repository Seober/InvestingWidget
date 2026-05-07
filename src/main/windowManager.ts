import { BrowserWindow, Rectangle, screen } from 'electron'
import { join } from 'node:path'
import { ConfigStore } from './configStore'
import { iconPath } from './iconPath'
import type { ResizeEdge } from '@shared/schema'

export class WindowManager {
  private win: BrowserWindow | null = null
  private dragOffset: { dx: number; dy: number } | null = null
  private boundsSaveTimer: NodeJS.Timeout | null = null
  private edgeResize: {
    edge: ResizeEdge
    startCursor: { x: number; y: number }
    startBounds: Rectangle
  } | null = null

  constructor(private config: ConfigStore) {}

  create(): BrowserWindow {
    const cfg = this.config.get()
    const { x, y } = this.resolveStartPosition(
      cfg.window.x,
      cfg.window.y,
      cfg.window.width,
      cfg.window.height
    )

    this.win = new BrowserWindow({
      x,
      y,
      width: cfg.window.width,
      height: cfg.window.height,
      minWidth: 200,
      minHeight: 60,
      frame: false,
      transparent: true,
      alwaysOnTop: cfg.window.alwaysOnTop,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      icon: iconPath(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    this.win.setOpacity(cfg.window.opacity)
    this.win.setAlwaysOnTop(cfg.window.alwaysOnTop, 'screen-saver')

    this.win.on('resize', () => this.scheduleBoundsSave())
    this.win.on('move', () => this.scheduleBoundsSave())
    this.win.on('closed', () => {
      this.win = null
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      this.win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return this.win
  }

  get window(): BrowserWindow | null {
    return this.win
  }

  setOpacity(value: number) {
    if (!this.win) return
    const { min, max } = this.config.get().defaults.opacityBounds
    const clamped = Math.max(min, Math.min(max, value))
    this.win.setOpacity(clamped)
    this.config.set({
      window: { ...this.config.get().window, opacity: clamped }
    })
  }

  setAlwaysOnTop(enabled: boolean) {
    if (!this.win) return
    this.win.setAlwaysOnTop(enabled, 'screen-saver')
    this.config.set({
      window: { ...this.config.get().window, alwaysOnTop: enabled }
    })
  }

  show() {
    if (!this.win) return
    this.win.show()
  }

  hide() {
    if (!this.win) return
    this.win.hide()
  }

  toggleVisibility() {
    if (!this.win) return
    if (this.win.isVisible()) this.win.hide()
    else this.win.show()
  }

  setContentSize(size: { width?: number; height?: number }) {
    if (!this.win) return
    // setBounds 사용 — frameless+transparent+resizable:false 에서 setContentSize 가 무시되는
    // 케이스 회피. drag resize 도 setBounds 로 잘 동작 확인됨.
    const cur = this.win.getBounds()
    const w = Math.max(200, Math.round(size.width ?? cur.width))
    const h = Math.max(60, Math.round(size.height ?? cur.height))
    this.win.setBounds({ x: cur.x, y: cur.y, width: w, height: h })
  }

  beginDrag() {
    if (!this.win) return
    const [winX, winY] = this.win.getPosition()
    const cursor = screen.getCursorScreenPoint()
    this.dragOffset = { dx: cursor.x - winX, dy: cursor.y - winY }
  }

  drag() {
    if (!this.win || !this.dragOffset) return
    const cursor = screen.getCursorScreenPoint()
    this.win.setPosition(cursor.x - this.dragOffset.dx, cursor.y - this.dragOffset.dy)
  }

  endDrag() {
    this.dragOffset = null
    this.scheduleBoundsSave()
  }

  beginEdgeResize(edge: ResizeEdge) {
    if (!this.win) return
    this.edgeResize = {
      edge,
      startCursor: screen.getCursorScreenPoint(),
      startBounds: this.win.getBounds()
    }
  }

  dragEdgeResize() {
    if (!this.win || !this.edgeResize) return
    const { edge, startCursor, startBounds } = this.edgeResize
    const cur = screen.getCursorScreenPoint()
    const dx = cur.x - startCursor.x
    const dy = cur.y - startCursor.y

    const isLeft = edge === 'left' || edge === 'tl' || edge === 'bl'
    const isRight = edge === 'right' || edge === 'tr' || edge === 'br'
    const isTop = edge === 'top' || edge === 'tl' || edge === 'tr'
    const isBottom = edge === 'bottom' || edge === 'bl' || edge === 'br'

    let { x, y, width, height } = startBounds
    if (isTop) {
      height = startBounds.height - dy
      y = startBounds.y + dy
    } else if (isBottom) {
      height = startBounds.height + dy
    }
    if (isLeft) {
      width = startBounds.width - dx
      x = startBounds.x + dx
    } else if (isRight) {
      width = startBounds.width + dx
    }

    if (width < 200) {
      if (isLeft) x = startBounds.x + startBounds.width - 200
      width = 200
    }
    if (height < 60) {
      if (isTop) y = startBounds.y + startBounds.height - 60
      height = 60
    }

    this.win.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height)
    })
  }

  endEdgeResize() {
    this.edgeResize = null
    this.scheduleBoundsSave()
  }

  private scheduleBoundsSave() {
    if (!this.win) return
    if (this.boundsSaveTimer) clearTimeout(this.boundsSaveTimer)
    this.boundsSaveTimer = setTimeout(() => {
      if (!this.win) return
      const [x, y] = this.win.getPosition()
      const [width, height] = this.win.getSize()
      this.config.set({
        window: { ...this.config.get().window, x, y, width, height }
      })
    }, 300)
  }

  private resolveStartPosition(
    savedX: number | null,
    savedY: number | null,
    width: number,
    height: number
  ): { x: number; y: number } {
    if (savedX !== null && savedY !== null) {
      const displays = screen.getAllDisplays()
      const fits = displays.some((d) => {
        const a = d.workArea
        return (
          savedX + 40 >= a.x &&
          savedX + width - 40 <= a.x + a.width &&
          savedY + 20 >= a.y &&
          savedY + height - 20 <= a.y + a.height
        )
      })
      if (fits) return { x: savedX, y: savedY }
    }
    const primary = screen.getPrimaryDisplay().workArea
    return { x: primary.x + primary.width - width - 16, y: primary.y + 16 }
  }
}
