import { expect, test } from '@playwright/test'

test('real IndexedDB isolates mirrors and clears a whole year including legacy records', async ({
  page,
}) => {
  await page.route('**/cache-test', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Cache test</title>' }),
  )
  await page.goto('/cache-test')
  const result = await page.evaluate(async () => {
    // @ts-ignore — Vite serves the source module in this browser harness.
    const { PersistentCache, IndexedDbBinaryStore, clearTexliveCache } = await import(
      '/src/engine/persistent-cache.ts'
    )
    const a = new PersistentCache({ texliveUrl: 'https://mirror.example/a/2025/' })
    const b = new PersistentCache({ texliveUrl: 'https://mirror.example/b/2025/' })
    const next = new PersistentCache({ version: '2026' })
    const payload = {
      files: [{ format: 26, filename: 'same.sty', data: new Uint8Array([7, 8]).buffer }],
      notFound: [{ format: 26, filename: 'missing.sty' }],
      bloomFilter: new Uint8Array([9]).buffer,
    }
    await a.save(payload)
    const isolated = (await b.load()) === null
    await b.save(payload)
    await a.clear()
    const bLoaded = await b.load()
    const aCleared = (await a.load()) === null
    await next.save(payload)
    const store = new IndexedDbBinaryStore()
    await store.set('tl:2025:meta', new ArrayBuffer(1))
    await store.set('tl:2025:f:26/legacy.sty', new ArrayBuffer(1))
    await clearTexliveCache({ version: '2025' })
    return {
      isolated,
      aCleared,
      file: Array.from(new Uint8Array(bLoaded.files[0].data)),
      negative: bLoaded.notFound,
      bloom: Array.from(new Uint8Array(bLoaded.bloomFilter)),
      bCleared: (await b.load()) === null,
      legacyCleared: !(await store.keys()).some((key: string) => key.startsWith('tl:2025:')),
      nextYearRetained: (await next.load()).files.length === 1,
    }
  })
  expect(result).toEqual({
    isolated: true,
    aCleared: true,
    file: [7, 8],
    negative: [{ format: 26, filename: 'missing.sty' }],
    bloom: [9],
    bCleared: true,
    legacyCleared: true,
    nextYearRetained: true,
  })
})
