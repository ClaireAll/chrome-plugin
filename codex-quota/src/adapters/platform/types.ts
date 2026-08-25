import type { LaunchAtLoginStatus } from '../../shared/types'

export type PlatformAdapter = {
  openUsagePage: () => Promise<void>
  getLaunchAtLogin: () => LaunchAtLoginStatus
  setLaunchAtLogin: (enabled: boolean) => LaunchAtLoginStatus
}
