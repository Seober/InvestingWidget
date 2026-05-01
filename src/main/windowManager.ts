import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { ConfigStore } from './configStore'

export class WindowManager {
  private win: BrowserWindow | null = null
  private dragOffset: { dx: number; dy: number } | null = null
  private boundsSaveTimer: NodeJS.Timeout | null = null

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
      resizable: true,
      hasShadow: false,
      skipTaskbar: false,
      backgroundColor: '#00000000',
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
