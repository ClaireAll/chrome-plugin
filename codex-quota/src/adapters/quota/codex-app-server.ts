import { existsSync, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { QuotaSnapshot } from '../../shared/types'
import {
  mapRateLimits,
  type RateLimitsReadResultDTO
} from '../../core/rate-limit-mapper'
import { QuotaError } from '../../core/error-message'

type AccountReadResult = {
  account?: {
    type?: string
  } | null
  requiresOpenaiAuth?: boolean
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  timer: NodeJS.Timeout
}

type JsonRpcMessage = {
  id?: number
  result?: unknown
  error?: {
    code?: number
    message?: string
  }
  method?: string
}

function isExecutableFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function findInPath(names: string[]): string | null {
  const paths = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  for (const directory of paths) {
    for (const name of names) {
      const candidate = join(directory, name)
      if (existsSync(candidate) && isExecutableFile(candidate)) {
        return candidate
      }
    }
  }
  return null
}

export function locateCodexExecutable(): string | null {
  const override = process.env.CODEX_EXECUTABLE
  if (override && isExecutableFile(override)) {
    return override
  }

  if (process.platform === 'darwin') {
    const bundled = '/Applications/ChatGPT.app/Contents/Resources/codex'
    if (isExecutableFile(bundled)) {
      return bundled
    }
  }

  const names =
    process.platform === 'win32'
      ? ['codex.exe', 'codex.cmd', 'codex']
      : ['codex']
  return findInPath(names)
}

export class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private startPromise: Promise<void> | null = null
  private initialized = false
  private nextRequestId = 0
  private stdoutBuffer = ''
  private readonly pending = new Map<number, PendingRequest>()

  constructor(private readonly clientVersion = '0.1.0') {}

  async readSnapshot(): Promise<QuotaSnapshot> {
    try {
      await this.ensureInitialized()

      const account = await this.request<AccountReadResult>('account/read', {
        refreshToken: false
      })
      if (!account.account) {
        throw new QuotaError('unauthenticated')
      }
      if (account.account.type !== 'chatgpt') {
        throw new QuotaError('unsupported-account')
      }

      const result = await this.request<RateLimitsReadResultDTO>(
        'account/rateLimits/read',
        {}
      )
      return mapRateLimits(result)
    } catch (error) {
      if (error instanceof QuotaError) {
        throw error
      }
      throw new QuotaError('server-unavailable', String(error))
    }
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = null
    this.initialized = false
    this.stdoutBuffer = ''
    this.rejectPending(new QuotaError('server-unavailable', 'Codex stopped'))

    if (!child) {
      return
    }

    try {
      child.stdin.end()
    } catch {
      // The process may already have closed its stdin.
    }
    if (!child.killed) {
      child.kill()
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.child && this.initialized) {
      return
    }
    if (this.startPromise) {
      return this.startPromise
    }

    this.startPromise = this.startConnection().finally(() => {
      this.startPromise = null
    })
    return this.startPromise
  }

  private async startConnection(): Promise<void> {
    const executable = locateCodexExecutable()
    if (!executable) {
      throw new QuotaError('codex-not-found')
    }

    const child = spawn(executable, ['app-server'], {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && executable.endsWith('.cmd'),
      windowsHide: true
    })
    this.child = child
    this.stdoutBuffer = ''

    child.stdout.on('data', (chunk: Buffer) => {
      this.handleStdout(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      // Drain stderr continuously but do not retain credentials or raw logs.
      void chunk
    })
    child.once('error', (error: NodeJS.ErrnoException) => {
      const quotaError =
        error.code === 'ENOENT'
          ? new QuotaError('codex-not-found')
          : new QuotaError('server-unavailable', error.message)
      this.failConnection(quotaError)
    })
    child.once('close', () => {
      if (this.child === child) {
        this.failConnection(new QuotaError('server-unavailable'))
      }
    })

    await this.request('initialize', {
      clientInfo: {
        name: 'codex_quota_widget',
        title: 'Codex Quota',
        version: this.clientVersion
      }
    })
    this.sendNotification('initialized', {})
    this.initialized = true
  }

  private request<T>(method: string, params: unknown): Promise<T> {
    const child = this.child
    if (!child || child.killed) {
      return Promise.reject(new QuotaError('server-unavailable'))
    }

    const id = this.nextRequestId++
    const payload = JSON.stringify({ method, id, params }) + '\n'

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new QuotaError('request-timeout'))
      }, 10_000)

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      })

      try {
        child.stdin.write(payload)
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new QuotaError('server-unavailable', String(error)))
      }
    })
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.child || this.child.killed) {
      throw new QuotaError('server-unavailable')
    }
    this.child.stdin.write(JSON.stringify({ method, params }) + '\n')
  }

  private handleStdout(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString('utf8')
    if (this.stdoutBuffer.length > 1_048_576) {
      this.failConnection(new QuotaError('protocol-error', 'JSONL line too long'))
      return
    }

    let newlineIndex = this.stdoutBuffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1)
      if (line) {
        this.handleMessage(line)
      }
      newlineIndex = this.stdoutBuffer.indexOf('\n')
    }
  }

  private handleMessage(line: string): void {
    let message: JsonRpcMessage
    try {
      message = JSON.parse(line) as JsonRpcMessage
    } catch {
      this.failConnection(new QuotaError('protocol-error', 'Invalid JSONL'))
      return
    }

    if (typeof message.id !== 'number') {
      return
    }

    const pending = this.pending.get(message.id)
    if (!pending) {
      return
    }
    this.pending.delete(message.id)
    clearTimeout(pending.timer)

    if (message.error) {
      pending.reject(
        new QuotaError(
          'server-unavailable',
          message.error.message ?? 'Codex app-server request failed'
        )
      )
      return
    }
    pending.resolve(message.result)
  }

  private failConnection(error: QuotaError): void {
    if (this.child) {
      const child = this.child
      this.child = null
      this.initialized = false
      if (!child.killed) {
        child.kill()
      }
    }
    this.rejectPending(error)
  }

  private rejectPending(error: QuotaError): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pending.delete(id)
    }
  }
}
