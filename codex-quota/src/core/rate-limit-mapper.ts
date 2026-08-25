import type {
  QuotaSnapshot,
  QuotaWindow
} from '../shared/types'

export type RateLimitWindowDTO = {
  usedPercent?: number | null
  windowDurationMins?: number | null
  resetsAt?: number | null
}

export type RateLimitBucketDTO = {
  limitId?: string | null
  primary?: RateLimitWindowDTO | null
  secondary?: RateLimitWindowDTO | null
  rateLimitReachedType?: string | null
}

export type RateLimitsReadResultDTO = {
  rateLimits?: RateLimitBucketDTO | null
  rateLimitsByLimitId?: Record<string, RateLimitBucketDTO | null> | null
}

function remainingPercent(usedPercent: number | null | undefined): number | null {
  if (typeof usedPercent !== 'number' || !Number.isFinite(usedPercent)) {
    return null
  }
  return Math.min(100, Math.max(0, 100 - usedPercent))
}

function mapWindow(
  windows: RateLimitWindowDTO[],
  durationMins: number
): QuotaWindow | null {
  const source = windows.find(
    (window) => window.windowDurationMins === durationMins
  )
  if (!source) {
    return null
  }

  const remaining = remainingPercent(source.usedPercent)
  if (remaining === null) {
    return null
  }

  return {
    remainingPercent: remaining,
    resetsAt:
      typeof source.resetsAt === 'number' && Number.isFinite(source.resetsAt)
        ? source.resetsAt * 1000
        : null
  }
}

export function mapRateLimits(
  result: RateLimitsReadResultDTO,
  fetchedAt = new Date()
): QuotaSnapshot {
  const buckets = [
    result.rateLimitsByLimitId?.codex ?? result.rateLimits ?? null,
    ...Object.entries(result.rateLimitsByLimitId ?? {})
      .filter(([limitId]) => limitId !== 'codex')
      .map(([, bucket]) => bucket)
  ].filter(
    (bucket): bucket is RateLimitBucketDTO => Boolean(bucket)
  )
  const windows = buckets.flatMap((bucket) =>
    [bucket.primary, bucket.secondary].filter(
      (window): window is RateLimitWindowDTO => Boolean(window)
    )
  )

  return {
    fiveHour: mapWindow(windows, 300),
    weekly: mapWindow(windows, 10_080),
    fetchedAt: fetchedAt.toISOString()
  }
}
