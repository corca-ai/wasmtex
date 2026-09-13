import { describe, expect, it } from 'vitest'
import { CompilerOperations } from './compiler-operation'

describe('compiler continuation cancellation', () => {
  it('rejects a continuation even if its I/O completed before cancellation', async () => {
    const operations = new CompilerOperations()
    let ready!: () => void
    const completed = new Promise<void>((resolve) => {
      ready = resolve
    })
    let resume!: () => void
    const continuation = new Promise<void>((resolve) => {
      resume = resolve
    })
    let committed = false
    const pending = operations.run(async () => {
      const observed = await operations.observe(Promise.resolve('old'))
      ready()
      await continuation
      observed.resume()
      committed = true
    })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await completed
    void operations.cancel()
    resume()
    await rejected
    expect(committed).toBe(false)
    await expect(operations.run(async () => 'new')).resolves.toBe('new')
  })
})
