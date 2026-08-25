import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import type { QuotaSnapshot } from '../../shared/types'

type CacheFile = {
  snapshot: QuotaSnapshot
}

export class QuotaCache {
  constructor(private readonly filePath: string) {}

  async load(): Promise<QuotaSnapshot | null> {
    try {
      const content = await fs.readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(content) as Partial<CacheFile>
      if (!parsed.snapshot || typeof parsed.snapshot.fetchedAt !== 'string') {
        return null
      }
      return parsed.snapshot
    } catch {
      return null
    }
  }

  async save(snapshot: QuotaSnapshot): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true })
    const content: CacheFile = { snapshot }
    await fs.writeFile(this.filePath, JSON.stringify(content, null, 2), 'utf8')
  }
}
