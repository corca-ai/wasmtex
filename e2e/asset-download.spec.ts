import { expect, test } from '@playwright/test'

test('asset sessions call native browser fetch without an illegal receiver', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { AssetDownloadSession } = await import('/src/engine/asset-download.ts')
    const phases: string[] = []
    const session = new AssetDownloadSession(event => phases.push(event.phase))
    const bytes = await session.read('data:application/octet-stream;base64,AQID', { asset: 'data' })
    return { bytes: [...(bytes ?? [])], phases }
  })
  expect(result.bytes).toEqual([1, 2, 3])
  expect(result.phases).toEqual(['start', 'bytes', 'end'])
})
