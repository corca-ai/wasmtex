import { describe, expect, it } from 'vitest'
import { type PersistState, persistIfNeeded } from './persist-watermark'

const state = (over: Partial<PersistState> = {}): PersistState => ({
  downloadCount: 0,
  lastPersisted: -1,
  inFlight: false,
  ...over,
})

describe('persistIfNeeded', () => {
  it('saves and advances the watermark when new files were fetched', async () => {
    const s = state({ downloadCount: 3 })
    let saved = 0
    await persistIfNeeded(s, async () => {
      saved++
    })
    expect(saved).toBe(1)
    expect(s.lastPersisted).toBe(3)
  })

  it('does nothing when nothing new was fetched since the last persist', async () => {
    const s = state({ downloadCount: 2, lastPersisted: 2 })
    let saved = 0
    await persistIfNeeded(s, async () => {
      saved++
    })
    expect(saved).toBe(0)
  })

  it('does NOT advance the watermark when save rejects, and retries on the next call', async () => {
    const s = state({ downloadCount: 3 })
    await persistIfNeeded(s, () => Promise.reject(new Error('quota')))
    expect(s.lastPersisted).toBe(-1) // unchanged — the files were NOT persisted

    let saved = 0
    await persistIfNeeded(s, async () => {
      saved++
    })
    expect(saved).toBe(1) // retried because the watermark stayed behind
    expect(s.lastPersisted).toBe(3) // committed only on success
  })

  it('skips when a save is already in flight', async () => {
    const s = state({ downloadCount: 1, inFlight: true })
    let saved = 0
    await persistIfNeeded(s, async () => {
      saved++
    })
    expect(saved).toBe(0)
  })
})
