import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { pdfPageCount, splicePdfs } from './pdf-splice'

/** Make a valid PDF with `n` blank pages. */
async function makePdf(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < n; i++) doc.addPage([200, 200])
  return doc.save()
}

describe('splicePdfs (#55)', () => {
  it('concatenates page counts in order', async () => {
    const head = await makePdf(3)
    const tail = await makePdf(2)
    const out = await splicePdfs([head, tail])
    expect(await pdfPageCount(out)).toBe(5)
  })

  it('returns the single part unchanged when given one', async () => {
    const only = await makePdf(2)
    const out = await splicePdfs([only])
    expect(out).toBe(only)
  })

  it('ignores empty parts', async () => {
    const head = await makePdf(1)
    const out = await splicePdfs([head, new Uint8Array(0)])
    expect(await pdfPageCount(out)).toBe(1)
  })

  it('throws when there is nothing to splice', async () => {
    await expect(splicePdfs([new Uint8Array(0)])).rejects.toThrow(/no PDF parts/)
  })
})
