import type { PlatformAdapter } from './types'
import { createDarwinAdapter } from './darwin'
import { createWin32Adapter } from './win32'
import { createBasePlatformAdapter } from './base'

export function createPlatformAdapter(): PlatformAdapter {
  switch (process.platform) {
    case 'darwin':
      return createDarwinAdapter()
    case 'win32':
      return createWin32Adapter()
    default:
      return createBasePlatformAdapter()
  }
}
