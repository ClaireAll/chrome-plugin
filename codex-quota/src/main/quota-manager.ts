import { join } from 'node:path'
import { app } from 'electron'
import type {
  QuotaSnapshot,
  QuotaState
} from '../shared/types'
import { userFacingError } from '../core/error-message'
import { CodexAppServerClient } from '../adapters/quota/codex-app-server'
import { QuotaCache } from '../adapters/storage/quota-cache'

type StateListener = (state: QuotaState) => void

export class QuotaManager {
  private readonly client = new CodexAppServerClient()
  private readonly cache = new QuotaCache(
    join(app.getPath('userData'), 'quota-cache.json')
  )
  private readonly listeners = new Set<StateListener>()
  private refreshPromise: Promise<QuotaState> | null = null
  private refreshTimer: NodeJS.Timeout | null = null
  private lastSnapshot: QuotaSnapshot | null = null
  private state: QuotaState = {
    status: 'loading',
    snapshot: null,
    message: '正在读取额度…'
  }

  async start(): Promise<void> {
    const cached = await this.cache.load()
    if (cached) {
      this.lastSnapshot = cached
      this.setState({
        status: 'stale',
        snapshot: cached,
        message: '正在使用缓存，等待刷新'
      })
    }

    this.refreshTimer = setInterval(() => {
      void this.refresh()
    }, 60_000)
    await this.refresh()
  }

  getState(): QuotaState {
    return this.state
  }

  onStateChanged(listener: StateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async refresh(): Promise<QuotaState> {
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    this.refreshPromise = this.refreshInternal().finally(() => {
      this.refreshPromise = null
    })
    return this.refreshPromise
  }

  async dispose(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
    await this.client.stop()
  }

  private async refreshInternal(): Promise<QuotaState> {
    if (!this.lastSnapshot) {
      this.setState({
        status: 'loading',
        snapshot: null,
        message: '正在读取额度…'
      })
    }

    try {
      const snapshot = await this.client.readSnapshot()
      this.lastSnapshot = snapshot
      await this.cache.save(snapshot)
      this.setState({
        status: 'fresh',
        snapshot,
        message: '已更新'
      })
    } catch (error) {
      const message = userFacingError(error)
      this.setState(
        this.lastSnapshot
          ? {
              status: 'stale',
              snapshot: this.lastSnapshot,
              message
            }
          : {
              status: 'unavailable',
              snapshot: null,
              message
            }
      )
    }

    return this.state
  }

  private setState(state: QuotaState): void {
    this.state = state
    for (const listener of this.listeners) {
      listener(state)
    }
  }
}
