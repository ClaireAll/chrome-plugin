export type QuotaWindow = {
  remainingPercent: number
  resetsAt: number | null
}

export type QuotaSnapshot = {
  fiveHour: QuotaWindow | null
  weekly: QuotaWindow | null
  fetchedAt: string
}

export type QuotaState =
  | {
      status: 'loading'
      snapshot: QuotaSnapshot | null
      message: string
    }
  | {
      status: 'fresh'
      snapshot: QuotaSnapshot
      message: string
    }
  | {
      status: 'stale'
      snapshot: QuotaSnapshot
      message: string
    }
  | {
      status: 'unavailable'
      snapshot: null
      message: string
    }

export type LaunchAtLoginStatus = {
  enabled: boolean
  supported: boolean
}

export type WindowSizeMode = 'collapsed' | 'expanded'

export type WindowArrowPlacement = 'top' | 'bottom'

export type WindowPlacement = {
  arrowPlacement: WindowArrowPlacement
}

export type ThemeKey = 'light' | 'midnight' | 'sand' | 'aurora'

export type DesktopApi = {
  getQuotaState: () => Promise<QuotaState>
  refreshQuota: () => Promise<QuotaState>
  onQuotaStateChanged: (listener: (state: QuotaState) => void) => () => void
  getLaunchAtLogin: () => Promise<LaunchAtLoginStatus>
  setLaunchAtLogin: (enabled: boolean) => Promise<LaunchAtLoginStatus>
  getWindowPlacement: () => Promise<WindowPlacement>
  onWindowPlacementChanged: (
    listener: (placement: WindowPlacement) => void
  ) => () => void
  setWindowSize: (mode: WindowSizeMode) => Promise<void>
  hideWindow: () => Promise<void>
  beginWindowDrag: () => void
  moveWindowDrag: () => void
  endWindowDrag: () => void
  openUsagePage: () => Promise<void>
  quit: () => Promise<void>
}
