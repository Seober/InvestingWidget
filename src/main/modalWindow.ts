import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { iconPath } from './iconPath'

export type ModalKind = 'add-item' | 'edit-item' | 'settings' | 'list-edit'

interface ModalDims {
  width: number
  height: number
  title: string
}

const DIMS: Record<ModalKind, ModalDims> = {
  'add-item': { width: 480, height: 600, title: '항목 추가' },
  'edit-item': { width: 480, height: 600, title: '항목 편집' },
  settings: { width: 540, height: 720, title: '설정' },
  'list-edit': { width: 540, height: 640, title: '목록 편집' }
}

const openModals = new Map<ModalKind, BrowserWindow>()

export function openModal(opts: {
  parent: BrowserWindow
  kind: ModalKind
  itemId?: string
}): BrowserWindow {
  const existing = openModals.get(opts.kind)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return existing
  }

  const dims = DIMS[opts.kind]
  const { x, y } = computeModalPosition(opts.parent, dims.width, dims.height)

  const modal = new BrowserWindow({
    parent: opts.parent,
    modal: true,
    x,
    y,
    width: dims.width,
    height: dims.height,
    title: dims.title,
    frame: true,
    transparent: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#111418',
    icon: iconPath(),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  modal.removeMenu()
  openModals.set(opts.kind, modal)

  modal.once('ready-to-show', () => modal.show())
  modal.on('closed', () => {
    openModals.delete(opts.kind)
  })

  const hashParts = [opts.kind]
  const params = new URLSearchParams()
  if (opts.itemId) params.set('id', opts.itemId)
  const paramStr = params.toString()
  const hash = `#/${hashParts.join('/')}${paramStr ? `?${paramStr}` : ''}`

  if (process.env['ELECTRON_RENDERER_URL']) {
    modal.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${hash}`)
  } else {
    modal.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: hash.replace(/^#/, '')
    })
  }

  return modal
}

export function closeAllModals() {
  for (const w of openModals.values()) {
    if (!w.isDestroyed()) w.close()
  }
  openModals.clear()
}

// Center modal on parent, then clamp into the work area of the display the
// parent sits on. Prevents modals from spilling off-screen when the widget is
// pinned to a monitor edge or corner.
function computeModalPosition(
  parent: BrowserWindow,
  width: number,
  height: number
): { x: number; y: number } {
  const parentBounds = parent.getBounds()
  const display = screen.getDisplayMatching(parentBounds)
  const wa = display.workArea

  const cx = parentBounds.x + Math.round((parentBounds.width - width) / 2)
  const cy = parentBounds.y + Math.round((parentBounds.height - height) / 2)

  const maxX = wa.x + Math.max(0, wa.width - width)
  const maxY = wa.y + Math.max(0, wa.height - height)
  const x = Math.min(Math.max(cx, wa.x), maxX)
  const y = Math.min(Math.max(cy, wa.y), maxY)
  return { x, y }
}
