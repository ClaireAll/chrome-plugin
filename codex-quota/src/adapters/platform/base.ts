import { app, shell } from 'electron'
import type { LaunchAtLoginStatus } from '../../shared/types'
import type { PlatformAdapter } from './types'

const usageUrl = 'https://chatgpt.com/codex/settings/usage'

function getLaunchAtLogin(): LaunchAtLoginStatus {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return { enabled: false, supported: false }
  }

  try {
    return {
      enabled: app.getLoginItemSettings().openAtLogin,
      supported: true
    }
  } catch {
    return { enabled: false, supported: false }
  }
}

function setLaunchAtLogin(enabled: boolean): LaunchAtLoginStatus {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return { enabled: false, supported: false }
  }

  try {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return getLaunchAtLogin()
  } catch {
    return { enabled: false, supported: false }
  }
}

export function createBasePlatformAdapter(): PlatformAdapter {
  return {
    openUsagePage: () => shell.openExternal(usageUrl),
    getLaunchAtLogin,
    setLaunchAtLogin
  }
}
