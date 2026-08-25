import { app, ipcMain } from 'electron'
import type { PlatformAdapter } from '../adapters/platform/types'
import type { QuotaManager } from './quota-manager'
import type { FloatingWindowManager } from './window-manager'

export function registerIpcHandlers(
  quotaManager: QuotaManager,
  windowManager: FloatingWindowManager,
  platform: PlatformAdapter
): () => void {
  ipcMain.handle('quota:get-state', () => quotaManager.getState())
  ipcMain.handle('quota:refresh', () => quotaManager.refresh())
  ipcMain.handle('platform:get-launch-at-login', () =>
    platform.getLaunchAtLogin()
  )
  ipcMain.handle('platform:set-launch-at-login', (_event, enabled: boolean) =>
    platform.setLaunchAtLogin(Boolean(enabled))
  )
  ipcMain.handle('platform:open-usage-page', () =>
    platform.openUsagePage()
  )
  ipcMain.handle('window:set-size', (_event, mode) =>
    windowManager.setSize(mode)
  )
  ipcMain.handle('window:hide', () => {
    windowManager.hide()
  })
  ipcMain.on('window:drag-begin', () => {
    windowManager.beginDrag()
  })
  ipcMain.on('window:drag-move', () => {
    windowManager.moveDrag()
  })
  ipcMain.on('window:drag-end', () => {
    windowManager.endDrag()
  })
  ipcMain.handle('app:quit', () => {
    app.quit()
    return undefined
  })

  const unsubscribe = quotaManager.onStateChanged((state) => {
    windowManager.getWindow()?.webContents.send('quota:state-changed', state)
  })

  return () => {
    unsubscribe()
    ipcMain.removeHandler('quota:get-state')
    ipcMain.removeHandler('quota:refresh')
    ipcMain.removeHandler('platform:get-launch-at-login')
    ipcMain.removeHandler('platform:set-launch-at-login')
    ipcMain.removeHandler('platform:open-usage-page')
    ipcMain.removeHandler('window:set-size')
    ipcMain.removeHandler('window:hide')
    ipcMain.removeHandler('app:quit')
    ipcMain.removeAllListeners('window:drag-begin')
    ipcMain.removeAllListeners('window:drag-move')
    ipcMain.removeAllListeners('window:drag-end')
  }
}
