import { app, type Tray } from 'electron'
import { createPlatformAdapter } from '../adapters/platform'
import { registerIpcHandlers } from './ipc'
import { QuotaManager } from './quota-manager'
import { createTray } from './tray-manager'
import { FloatingWindowManager } from './window-manager'

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  let quotaManager: QuotaManager | null = null
  let removeIpcHandlers: (() => void) | null = null
  let tray: Tray | null = null

  app.on('second-instance', () => {
    windowManager.show()
  })

  const windowManager = new FloatingWindowManager()

  app.whenReady().then(async () => {
    app.setName('Codex Quota')
    if (process.platform === 'darwin') {
      app.dock?.hide()
    }

    windowManager.create()
    const platform = createPlatformAdapter()
    quotaManager = new QuotaManager()
    removeIpcHandlers = registerIpcHandlers(
      quotaManager,
      windowManager,
      platform
    )
    tray = createTray({
      getLaunchAtLogin: () => platform.getLaunchAtLogin(),
      setLaunchAtLogin: (enabled) => platform.setLaunchAtLogin(enabled),
      onQuit: () => app.quit()
    })
    await quotaManager.start()
  })

  app.on('activate', () => {
    windowManager.show()
  })

  app.on('before-quit', () => {
    tray?.destroy()
    tray = null
    removeIpcHandlers?.()
    void quotaManager?.dispose()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
