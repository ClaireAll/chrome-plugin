export type QuotaErrorCode =
  | 'codex-not-found'
  | 'unauthenticated'
  | 'unsupported-account'
  | 'request-timeout'
  | 'server-unavailable'
  | 'protocol-error'
  | 'unknown'

export class QuotaError extends Error {
  readonly code: QuotaErrorCode

  constructor(code: QuotaErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'QuotaError'
    this.code = code
  }
}

export function userFacingError(error: unknown): string {
  if (error instanceof QuotaError) {
    switch (error.code) {
      case 'codex-not-found':
        return '未找到 Codex'
      case 'unauthenticated':
        return '请先登录 Codex'
      case 'unsupported-account':
        return '当前账户不支持额度查询'
      case 'request-timeout':
        return '请求超时'
      case 'server-unavailable':
        return 'Codex 服务暂时不可用'
      case 'protocol-error':
        return '额度接口返回格式异常'
      case 'unknown':
        return '暂时无法读取额度'
    }
  }
  return '暂时无法读取额度'
}
