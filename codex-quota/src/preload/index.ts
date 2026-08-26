import { contextBridge, ipcRenderer } from 'electron'
import type {
  DesktopApi,
  LaunchAtLoginStatus,
  QuotaState,
  WindowPlacement,
  WindowSizeMode
} from '../shared/types'

const desktopApi: DesktopApi = {
  getQuotaState: () => ipcRenderer.invoke('quota:get-state'),
  refreshQuota: () => ipcRenderer.invoke('quota:refresh'),
  onQuotaStateChanged: (listener: (state: QuotaState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: QuotaState) => {
      listener(state)
    }
    ipcRenderer.on('quota:state-changed', handler)
    return () => ipcRenderer.removeListener('quota:state-changed', handler)
  },
  getLaunchAtLogin: (): Promise<LaunchAtLoginStatus> =>
    ipcRenderer.invoke('platform:get-launch-at-login'),
  setLaunchAtLogin: (enabled: boolean): Promise<LaunchAtLoginStatus> =>
    ipcRenderer.invoke('platform:set-launch-at-login', enabled),
  getWindowPlacement: (): Promise<WindowPlacement> =>
    ipcRenderer.invoke('window:get-placement'),
  onWindowPlacementChanged: (listener: (placement: WindowPlacement) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      placement: WindowPlacement
    ) => {
      listener(placement)
    }
    ipcRenderer.on('window:placement-changed', handler)
    return () => ipcRenderer.removeListener('window:placement-changed', handler)
  },
  setWindowSize: (mode: WindowSizeMode) =>
    ipcRenderer.invoke('window:set-size', mode),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  beginWindowDrag: () => {
    ipcRenderer.send('window:drag-begin')
  },
  moveWindowDrag: () => {
    ipcRenderer.send('window:drag-move')
  },
  endWindowDrag: () => {
    ipcRenderer.send('window:drag-end')
  },
  openUsagePage: () => ipcRenderer.invoke('platform:open-usage-page'),
  quit: () => ipcRenderer.invoke('app:quit')
}

contextBridge.exposeInMainWorld('desktop', desktopApi)
