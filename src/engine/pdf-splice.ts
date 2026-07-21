/**
 * Concatenate PDF parts (head pages, then tail pages) into one document for
 * incremental compilation (#55). The engine emits PDF 1.7 with object/xref streams,
 * so a robust merge needs a real PDF library — we use `pdf-lib`, an OPTIONAL peer
 * dependency loaded via dynamic import. It has zero impact unless incremental
 * compilation is actually used; if the host hasn't installed it, {@link splicePdfs}
 * throws {@link PdfLibUnavailableError} and the caller falls back to a full compile.
 *
 * Note: cross-part links/outline destinations (e.g. a hyperref dest spanning the
 * checkpoint boundary) are not preserved by page copy; a full compile reconciles them.
 */

export class PdfLibUnavailableError extends Error {
  constructor() {
    super(
      'Incremental compile needs the optional peer dependency "pdf-lib" to splice ' +
        'head+tail PDFs. Install it (npm i pdf-lib) or disable incremental compilation.',
    )
    this.name = 'PdfLibUnavailableError'
  }
}

type PdfLibModule = typeof import('pdf-lib')

let pdfLibPromise: Promise<PdfLibModule> | null = null

async function loadPdfLib(): Promise<PdfLibModule> {
  if (!pdfLibPromise) {
    // Indirect specifier so bundlers keep this an optional runtime import.
    pdfLibPromise = import(/* @vite-ignore */ 'pdf-lib').catch(() => {
      pdfLibPromise = null
      throw new PdfLibUnavailableError()
    })
  }
  return pdfLibPromise
}

/** Merge PDF byte arrays into one (pages in order). Needs ≥1 part. */
export async function splicePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const nonEmpty = parts.filter((p) => p && p.length > 0)
  if (nonEmpty.length === 0) throw new Error('splicePdfs: no PDF parts')
  if (nonEmpty.length === 1) return nonEmpty[0]!
  const { PDFDocument } = await loadPdfLib()
  const out = await PDFDocument.create()
  for (const part of nonEmpty) {
    const doc = await PDFDocument.load(part, { ignoreEncryption: true })
    const pages = await out.copyPages(doc, doc.getPageIndices())
    for (const page of pages) out.addPage(page)
  }
  return out.save()
}

/** Page count of a PDF (via pdf-lib). */
export async function pdfPageCount(pdf: Uint8Array): Promise<number> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true })
  return doc.getPageCount()
}
