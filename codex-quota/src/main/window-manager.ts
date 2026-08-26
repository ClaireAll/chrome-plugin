import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, powerMonitor, screen } from 'electron'
import type {
  WindowArrowPlacement,
  WindowPlacement,
  WindowSizeMode
} from '../shared/types'

const windowMargin = 8
const collapsedSize = { width: 240, height: 120 }
const expandedSize = { width: 340, height: 250 }
const sizeAnimationDuration = 260
const displayRestoreDelay = 500
const windowStateFileName = 'window-state.json'

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

type WindowAnchor = ExpansionAnchor & {
  x: number
  y: number
}

type SavedWindowPosition = {
  x: number
  y: number
}

export class FloatingWindowManager {
  private window: BrowserWindow | null = null
  private dragState: DragState | null = null
  private sizeMode: WindowSizeMode = 'collapsed'
  private windowAnchor: WindowAnchor | null = null
  private animationTimer: NodeJS.Timeout | null = null
  private animationResolve: (() => void) | null = null
  private windowStatePath: string | null = null
  private restoreTimer: NodeJS.Timeout | null = null
  private readonly handleDisplayChange = () => {
    this.schedulePositionRestore()
  }
  private readonly handlePowerResume = () => {
    this.schedulePositionRestore(displayRestoreDelay)
  }
  private readonly handleWindowMove = () => {
    if (!this.dragState) {
      return
    }

    this.refreshWindowAnchor()
    this.emitWindowPlacement()
  }

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

    this.windowStatePath = join(
      app.getPath('userData'),
      windowStateFileName
    )
    window.setAlwaysOnTop(true, 'floating')
    if (process.platform === 'darwin') {
      window.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      })
    }

    this.window = window
    window.on('move', this.handleWindowMove)
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
    this.registerSystemListeners()
    this.positionInitialWindow()
    window.once('ready-to-show', () => {
      window.showInactive()
      setTimeout(() => this.emitWindowPlacement(), 100)
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
    const anchor = this.getWindowAnchor(from)
    const nextSize = mode === 'expanded' ? expandedSize : collapsedSize
    const target = this.getTargetBounds(anchor, nextSize)
    this.sizeMode = mode
    await this.animateBounds(from, target.bounds)
    if (!this.dragState && !window.isDestroyed()) {
      // Native macOS bounds animation can finish with a rounded coordinate.
      // Snap to the exact target so a later collapse returns to the original
      // collapsed rectangle without accumulating position drift.
      window.setBounds(target.bounds, false)
    }
    this.saveWindowPosition()
    this.emitWindowPlacement()
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
    const screenX = Math.round(cursor.x)
    const screenY = Math.round(cursor.y)
    const x = drag.windowX + screenX - drag.pointerX
    const y = drag.windowY + screenY - drag.pointerY
    const position = this.keepDragPositionVisible(
      x,
      y,
      bounds.width,
      bounds.height,
      cursor
    )
    window.setPosition(position.x, position.y)
  }

  endDrag(): void {
    this.dragState = null
    this.refreshWindowAnchor()
    this.saveWindowPosition()
    this.emitWindowPlacement()
  }

  getWindowPlacement(): WindowPlacement {
    return {
      arrowPlacement: this.getArrowPlacement()
    }
  }

  destroy(): void {
    this.saveWindowPosition()
    this.unregisterSystemListeners()
    this.cancelPositionRestore()
    this.cancelBoundsAnimation()
    this.dragState = null
    this.window?.removeListener('move', this.handleWindowMove)
    this.window?.destroy()
    this.window = null
  }

  private getTargetBounds(
    anchor: WindowAnchor,
    size: { width: number; height: number }
  ): { bounds: Electron.Rectangle } {
    const x =
      anchor.horizontal === 'left' ? anchor.x : anchor.x - size.width
    const y = anchor.vertical === 'top' ? anchor.y : anchor.y - size.height

    return {
      bounds: {
        x: Math.round(x),
        y: Math.round(y),
        ...size
      }
    }
  }

  private getArrowPlacement(): WindowArrowPlacement {
    const window = this.window
    if (!window || window.isDestroyed()) {
      return 'top'
    }

    const bounds = window.getBounds()
    const anchor = this.getWindowAnchor(bounds)

    // A top anchor means the detail panel grows downward, so the trigger sits
    // below the card. A bottom anchor grows upward, so the trigger sits above.
    return anchor.vertical === 'top' ? 'bottom' : 'top'
  }

  private getWindowAnchor(bounds: Electron.Rectangle): WindowAnchor {
    if (this.windowAnchor) {
      return this.windowAnchor
    }

    this.windowAnchor = this.createWindowAnchor(bounds)
    return this.windowAnchor
  }

  private createWindowAnchor(bounds: Electron.Rectangle): WindowAnchor {
    const display = screen.getDisplayMatching(bounds)
    const direction = this.chooseExpansionAnchor(
      bounds,
      display.workArea
    )

    return {
      ...direction,
      x: direction.horizontal === 'left' ? bounds.x : bounds.x + bounds.width,
      y: direction.vertical === 'top' ? bounds.y : bounds.y + bounds.height
    }
  }

  private refreshWindowAnchor(): void {
    const window = this.window
    if (!window || window.isDestroyed()) {
      return
    }

    this.windowAnchor = this.createWindowAnchor(window.getBounds())
  }

  private emitWindowPlacement(): void {
    const window = this.window
    if (!window || window.isDestroyed()) {
      return
    }

    window.webContents.send(
      'window:placement-changed',
      this.getWindowPlacement()
    )
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

    const saved = this.readSavedPosition()
    if (
      saved &&
      this.isVisibleOnAnyDisplay(
        saved.x,
        saved.y,
        collapsedSize.width,
        collapsedSize.height
      )
    ) {
      window.setPosition(saved.x, saved.y)
      this.refreshWindowAnchor()
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
    this.refreshWindowAnchor()
    if (!saved) {
      this.saveWindowPosition(position)
    }
  }

  private registerSystemListeners(): void {
    screen.on('display-added', this.handleDisplayChange)
    screen.on('display-removed', this.handleDisplayChange)
    screen.on('display-metrics-changed', this.handleDisplayChange)
    powerMonitor.on('resume', this.handlePowerResume)
  }

  private unregisterSystemListeners(): void {
    screen.removeListener('display-added', this.handleDisplayChange)
    screen.removeListener('display-removed', this.handleDisplayChange)
    screen.removeListener(
      'display-metrics-changed',
      this.handleDisplayChange
    )
    powerMonitor.removeListener('resume', this.handlePowerResume)
  }

  private schedulePositionRestore(delay = displayRestoreDelay): void {
    this.cancelPositionRestore()
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = null
      this.restoreSavedPosition()
    }, delay)
  }

  private cancelPositionRestore(): void {
    if (!this.restoreTimer) {
      return
    }
    clearTimeout(this.restoreTimer)
    this.restoreTimer = null
  }

  private restoreSavedPosition(): void {
    const window = this.window
    if (
      !window ||
      window.isDestroyed() ||
      this.dragState ||
      this.animationTimer
    ) {
      return
    }

    const current = window.getBounds()
    const saved = this.readSavedPosition()
    if (
      saved &&
      this.isVisibleOnAnyDisplay(
        saved.x,
        saved.y,
        current.width,
        current.height
      )
    ) {
      if (current.x !== saved.x || current.y !== saved.y) {
        window.setPosition(saved.x, saved.y)
      }
      this.refreshWindowAnchor()
      this.emitWindowPlacement()
      return
    }

    const display = screen.getPrimaryDisplay()
    const position = this.clampPosition(
      display.workArea.x + display.workArea.width - current.width - 24,
      display.workArea.y + display.workArea.height - current.height - 24,
      current.width,
      current.height,
      display.workArea
    )
    window.setPosition(position.x, position.y)
    this.refreshWindowAnchor()
    this.emitWindowPlacement()
    if (!saved) {
      this.saveWindowPosition(position)
    }
  }

  private keepDragPositionVisible(
    x: number,
    y: number,
    width: number,
    height: number,
    cursor: { x: number; y: number }
  ): { x: number; y: number } {
    if (this.isVisibleOnAnyDisplay(x, y, width, height)) {
      return {
        x: Math.round(x),
        y: Math.round(y)
      }
    }

    return this.clampPosition(
      x,
      y,
      width,
      height,
      screen.getDisplayNearestPoint(cursor).bounds,
      0
    )
  }

  private isVisibleOnAnyDisplay(
    x: number,
    y: number,
    width: number,
    height: number
  ): boolean {
    const right = x + width
    const bottom = y + height
    return screen.getAllDisplays().some(({ bounds }) => {
      const visibleWidth = Math.min(right, bounds.x + bounds.width) -
        Math.max(x, bounds.x)
      const visibleHeight = Math.min(bottom, bounds.y + bounds.height) -
        Math.max(y, bounds.y)
      return visibleWidth > 0 && visibleHeight > 0
    })
  }

  private readSavedPosition(): SavedWindowPosition | null {
    if (!this.windowStatePath) {
      return null
    }

    try {
      const parsed = JSON.parse(
        readFileSync(this.windowStatePath, 'utf8')
      ) as Partial<SavedWindowPosition>
      if (
        typeof parsed.x !== 'number' ||
        !Number.isFinite(parsed.x) ||
        typeof parsed.y !== 'number' ||
        !Number.isFinite(parsed.y)
      ) {
        return null
      }
      return {
        x: Math.round(parsed.x),
        y: Math.round(parsed.y)
      }
    } catch {
      return null
    }
  }

  private saveWindowPosition(position?: { x: number; y: number }): void {
    const window = this.window
    if (!window || window.isDestroyed() || !this.windowStatePath) {
      return
    }

    const bounds = window.getBounds()
    const saved = position ?? { x: bounds.x, y: bounds.y }
    try {
      writeFileSync(
        this.windowStatePath,
        JSON.stringify({ x: Math.round(saved.x), y: Math.round(saved.y) }),
        'utf8'
      )
    } catch (error) {
      console.warn('[window-position-save-failed]', error)
    }
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
