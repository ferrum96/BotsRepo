import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { initializeTestDatabase } from '../helpers/test-db.js'

describe('Load: health endpoint', () => {
  const app = createApp()

  beforeAll(() => {
    initializeTestDatabase()
  })

  it('serves 200 concurrent health checks reliably', async () => {
    const concurrency = 200
    const started = Date.now()

    const responses = await Promise.all(
      Array.from({ length: concurrency }, () => app.request('/api/health'))
    )

    const elapsedMs = Date.now() - started
    const okCount = responses.filter((response) => response.status === 200).length

    expect(okCount).toBe(concurrency)
    expect(elapsedMs).toBeLessThan(5000)
  })
})
