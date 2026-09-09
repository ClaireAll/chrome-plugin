import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  app,
  Menu,
  nativeImage,
  Tray,
  type NativeImage
} from 'electron'
import type { LaunchAtLoginStatus } from '../shared/types'

export type TrayActions = {
  getLaunchAtLogin: () => LaunchAtLoginStatus
  setLaunchAtLogin: (enabled: boolean) => LaunchAtLoginStatus
  onQuit: () => void
}

function createTrayImage(): NativeImage | null {
  const iconPaths = [
    join(process.resourcesPath, 'tray.png'),
    join(app.getAppPath(), 'assets', 'tray', 'tray.png'),
    join(process.resourcesPath, 'icon.icns'),
    join(app.getAppPath(), 'assets', 'icon.icns'),
    join(process.resourcesPath, 'icon.ico'),
    join(app.getAppPath(), 'assets', 'icon.ico')
  ]

  for (const iconPath of iconPaths) {
    if (!existsSync(iconPath)) {
      continue
    }

    const image = nativeImage.createFromPath(iconPath)
    if (image.isEmpty()) {
      continue
    }
    if (process.platform === 'darwin') {
      image.setTemplateImage(true)
    }
    return image
  }

  return null
}

export function createTray(actions: TrayActions): Tray | null {
  const image = createTrayImage()
  if (!image) {
    console.error('[tray-icon-missing]')
    return null
  }

  const tray = new Tray(image)
  tray.setToolTip('Codex Quota')

  const buildMenu = () => {
    const launchAtLogin = actions.getLaunchAtLogin()
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: '登录时启动',
          type: 'checkbox',
          checked: launchAtLogin.enabled,
          enabled: launchAtLogin.supported,
          click: (item) => {
            actions.setLaunchAtLogin(item.checked)
          }
        },
        { type: 'separator' },
        {
          label: '退出 Codex Quota',
          click: actions.onQuit
        }
      ])
    )
  }

  buildMenu()
  tray.on('click', () => {
    buildMenu()
    tray.popUpContextMenu()
  })
  tray.on('right-click', buildMenu)

  return tray
}
