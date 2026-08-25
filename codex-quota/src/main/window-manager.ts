import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import type { WindowSizeMode } from '../shared/types'

const windowMargin = 8
const collapsedSize = { width: 240, height: 120 }
const expandedSize = { width: 340, height: 250 }
const sizeAnimationDuration = 260

type DragState = {
  pointerX: number
  pointerY: number
  windowX: number
  windowY: number
}

type ExpansionAnchor = {
  horizontal: 'left' | 'right'
  vertical: 'top' | 'bottom'
}

export class FloatingWindowManager {
  private window: BrowserWindow | null = null
  private dragState: DragState | null = null
  private sizeMode: WindowSizeMode = 'collapsed'
  private expansionAnchor: ExpansionAnchor | null = null
  private animationTimer: NodeJS.Timeout | null = null
  private animationResolve: (() => void) | null = null

  create(): BrowserWindow {
    if (this.window) {
      return this.window
    }

    const window = new BrowserWindow({
      ...collapsedSize,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      closable: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      acceptFirstMouse: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    window.setAlwaysOnTop(true, 'floating')
    if (process.platform === 'darwin') {
      window.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      })
    }

    this.window = window
    window.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL) => {
        console.error(
          '[renderer-load-failed]',
          errorCode,
          errorDescription,
          validatedURL
        )
      }
    )
    window.webContents.on('render-process-gone', (_event, details) => {
      console.error('[renderer-gone]', details.reason, details.exitCode)
    })
    this.positionInitialWindow()
    window.once('ready-to-show', () => {
      window.showInactive()
    })

    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    if (rendererUrl) {
      void window.loadURL(rendererUrl)
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return window
  }

  getWindow(): BrowserWindow | null {
    return this.window
  }

  show(): void {
    this.window?.showInactive()
  }

  hide(): void {
    this.window?.hide()
  }

  async setSize(mode: WindowSizeMode): Promise<void> {
    const window = this.window
    if (!window || window.isDestroyed()) {
      return
    }
    if (this.sizeMode === mode && !this.animationTimer) {
      return
    }

    const from = window.getBounds()
    const display = screen.getDisplayMatching(from)
    const nextSize = mode === 'expanded' ? expandedSize : collapsedSize
    const target = this.getTargetBounds(mode, from, nextSize, display.bounds, 0)

    if (mode === 'expanded') {
      this.expansionAnchor = target.anchor
    }
    this.sizeMode = mode
    await this.animateBounds(from, target.bounds)
  }

  beginDrag(): void {
    const window = this.window
    if (!window || window.isDestroyed()) {
      return
    }

    this.cancelBoundsAnimation()
    const cursor = screen.getCursorScreenPoint()
    if (!this.isFinitePoint(cursor)) {
      return
    }

    const [windowX, windowY] = window.getPosition()
    this.dragState = {
      pointerX: Math.round(cursor.x),
      pointerY: Math.round(cursor.y),
      windowX,
      windowY
    }
  }

  moveDrag(): void {
    const window = this.window
    const drag = this.dragState
    if (!window || window.isDestroyed() || !drag) {
      return
    }

    const cursor = screen.getCursorScreenPoint()
    if (!this.isFinitePoint(cursor)) {
      return
    }

    const bounds = window.getBounds()
    const display = screen.getDisplayNearestPoint(cursor)
    const screenX = Math.round(cursor.x)
    const screenY = Math.round(cursor.y)
    const x = drag.windowX + screenX - drag.pointerX
    const y = drag.windowY + screenY - drag.pointerY
    const position = this.clampPosition(
      x,
      y,
      bounds.width,
      bounds.height,
      display.bounds,
      0
    )
    window.setPosition(position.x, position.y)
  }

  endDrag(): void {
    this.dragState = null
  }

  destroy(): void {
    this.cancelBoundsAnimation()
    this.dragState = null
    this.window?.destroy()
    this.window = null
  }

  private getTargetBounds(
    mode: WindowSizeMode,
    current: Electron.Rectangle,
    size: { width: number; height: number },
    screenBounds: Electron.Rectangle,
    edgeMargin = windowMargin
  ): { bounds: Electron.Rectangle; anchor: ExpansionAnchor | null } {
    const anchor =
      mode === 'expanded'
        ? this.chooseExpansionAnchor(current, screenBounds)
        : this.expansionAnchor ?? this.chooseExpansionAnchor(current, screenBounds)
    const x =
      anchor.horizontal === 'right'
        ? current.x + current.width - size.width
        : current.x
    const y =
      anchor.vertical === 'bottom'
        ? current.y + current.height - size.height
        : current.y
    const position = this.clampPosition(
      x,
      y,
      size.width,
      size.height,
      screenBounds,
      edgeMargin
    )

    return {
      bounds: {
        ...position,
        ...size
      },
      anchor: mode === 'expanded' ? anchor : null
    }
  }

  private chooseExpansionAnchor(
    bounds: Electron.Rectangle,
    workArea: Electron.Rectangle
  ): ExpansionAnchor {
    const leftSpace = Math.max(0, bounds.x - workArea.x - windowMargin)
    const rightSpace = Math.max(
      0,
      workArea.x + workArea.width - windowMargin - (bounds.x + bounds.width)
    )
    const topSpace = Math.max(0, bounds.y - workArea.y - windowMargin)
    const bottomSpace = Math.max(
      0,
      workArea.y + workArea.height - windowMargin - (bounds.y + bounds.height)
    )

    return {
      horizontal: rightSpace >= leftSpace ? 'left' : 'right',
      vertical: bottomSpace >= topSpace ? 'top' : 'bottom'
    }
  }

  private async animateBounds(
    from: Electron.Rectangle,
    to: Electron.Rectangle
  ): Promise<void> {
    this.cancelBoundsAnimation()

    const window = this.window
    if (!window || window.isDestroyed()) {
      return
    }

    const changed =
      from.x !== to.x ||
      from.y !== to.y ||
      from.width !== to.width ||
      from.height !== to.height
    if (!changed) {
      return
    }

    // Let macOS animate the native window as one compositor operation. The
    // previous frame-by-frame setBounds loop forced a native resize and
    // renderer reflow every 16ms, which made the detail panel stutter.
    window.setBounds(to, process.platform === 'darwin')

    await new Promise<void>((resolve) => {
      this.animationResolve = resolve
      this.animationTimer = setTimeout(() => {
        this.animationTimer = null
        this.animationResolve = null
        resolve()
      }, sizeAnimationDuration)
    })
  }

  private cancelBoundsAnimation(): void {
    if (this.animationTimer) {
      clearTimeout(this.animationTimer)
      this.animationTimer = null
    }
    const resolve = this.animationResolve
    this.animationResolve = null
    resolve?.()
  }

  private positionInitialWindow(): void {
    const window = this.window
    if (!window) {
      return
    }

    const display = screen.getPrimaryDisplay()
    const position = this.clampPosition(
      display.workArea.x + display.workArea.width - collapsedSize.width - 24,
      display.workArea.y + display.workArea.height - collapsedSize.height - 24,
      collapsedSize.width,
      collapsedSize.height,
      display.workArea
    )
    window.setPosition(position.x, position.y)
  }

  private clampPosition(
    x: number,
    y: number,
    width: number,
    height: number,
    bounds: Electron.Rectangle,
    edgeMargin = windowMargin
  ): { x: number; y: number } {
    const safeWidth = Math.max(1, Math.round(width))
    const safeHeight = Math.max(1, Math.round(height))
    const minX = bounds.x + edgeMargin
    const minY = bounds.y + edgeMargin
    const maxX = Math.max(
      minX,
      bounds.x + bounds.width - safeWidth - edgeMargin
    )
    const maxY = Math.max(
      minY,
      bounds.y + bounds.height - safeHeight - edgeMargin
    )
    const safeX = Number.isFinite(x) ? x : minX
    const safeY = Number.isFinite(y) ? y : minY

    return {
      x: Math.round(Math.min(Math.max(safeX, minX), maxX)),
      y: Math.round(Math.min(Math.max(safeY, minY), maxY))
    }
  }

  private isFinitePoint(point: { x: number; y: number }): boolean {
    return Number.isFinite(point.x) && Number.isFinite(point.y)
  }
}
