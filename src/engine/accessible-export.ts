/**
 * Accessible (tagged, PDF/UA) export on top of the LaTeX tagging kernel (#84).
 *
 * The LaTeX kernel (2025-06 and later, TeX Live 2026) produces tagged PDF when the document
 * starts with `\DocumentMetadata{tagging=on}`. Nothing here reimplements tagging: the export
 * is an ordinary compile of the same project whose main file carries that declaration —
 * on a sibling compiler, so the interactive preview keeps its own engine and snapshot.
 * `inspectPdfTagging` reads the result back (structure tree, mark info, language, figure
 * alt-text coverage) so hosts can show a report without a PDF library.
 */

export type PdfStandard = 'ua-2' | 'ua-1'

export interface AccessibleExportOptions {
  /** BCP 47 language of the document; detected from babel/polyglossia/hyperref when omitted. */
  lang?: string
  /** PDF/UA part to declare. UA-2 (PDF 2.0) is what the tagging kernel targets. */
  standard?: PdfStandard
}

/** How well a document class is known to work with the tagging kernel:
 *  `supported` — compiles cleanly, structure tree, only the kernel's own veraPDF gaps;
 *  `partial` — produces a structure tree but logs tagging errors (check the output);
 *  `unsupported` — broken structure or a failed compile; `unknown` — not in the matrix. */
export type ClassSupport = 'supported' | 'partial' | 'unsupported' | 'unknown'

/** Class matrix, TeX Live 2026 (`\DocumentMetadata{tagging=on}` + a title, sections, a list, a
 *  table, two figures, a footnote and a bibliography), checked with veraPDF PDF/UA-2.
 *  Every standard/KOMA class fails only clause 8.2.2 (a few rules the kernel does not yet
 *  mark as artifacts) — the baseline the kernel itself sets. */
export const CLASS_SUPPORT: Readonly<Record<string, ClassSupport>> = {
  article: 'supported',
  report: 'supported',
  book: 'supported',
  scrartcl: 'supported',
  scrreprt: 'supported',
  scrbook: 'supported',
  amsart: 'supported',
  // Structure tree present, but the class logs tagging errors (unclosed Sect, text
  // begin/end mismatch, undefined control sequences); veraPDF is at the kernel baseline.
  llncs: 'partial',
  IEEEtran: 'partial',
  elsarticle: 'partial',
  // Structure violations (parent/child nesting, dozens of untagged content items).
  memoir: 'unsupported',
  acmart: 'unsupported',
  'revtex4-2': 'unsupported',
  beamer: 'unsupported',
}

const BABEL_LANGS: Readonly<Record<string, string>> = {
  english: 'en-US',
  american: 'en-US',
  USenglish: 'en-US',
  british: 'en-GB',
  UKenglish: 'en-GB',
  australian: 'en-AU',
  german: 'de-DE',
  ngerman: 'de-DE',
  austrian: 'de-AT',
  naustrian: 'de-AT',
  french: 'fr-FR',
  frenchb: 'fr-FR',
  spanish: 'es-ES',
  italian: 'it-IT',
  portuguese: 'pt-PT',
  brazil: 'pt-BR',
  brazilian: 'pt-BR',
  dutch: 'nl-NL',
  swedish: 'sv-SE',
  danish: 'da-DK',
  norsk: 'nb-NO',
  finnish: 'fi-FI',
  polish: 'pl-PL',
  czech: 'cs-CZ',
  russian: 'ru-RU',
  greek: 'el-GR',
  turkish: 'tr-TR',
  japanese: 'ja-JP',
  korean: 'ko-KR',
  chinese: 'zh-CN',
  'chinese-simplified': 'zh-CN',
  'chinese-traditional': 'zh-TW',
}

function stripComments(source: string): string {
  return source.replace(/(^|[^\\])(\\\\)*%.*$/gm, (_m, pre, esc) => `${pre}${esc ?? ''}`)
}

/** The `\documentclass` name, or null. */
export function documentClassOf(source: string): string | null {
  const m = /\\documentclass(?:\[[^\]]*\])?\{([^}]*)\}/.exec(stripComments(source))
  return m ? m[1]!.trim() : null
}

/** Language the document declares (hyperref `pdflang`, `\DocumentMetadata{lang=…}`,
 *  babel/polyglossia main language, kotex/CJK packages), as BCP 47; null when none. */
export function detectDocumentLanguage(source: string): string | null {
  const code = stripComments(source)
  let m = /pdflang ?= ?\{? ?([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)/.exec(code)
  if (m) return m[1]!
  m = /\\DocumentMetadata\{[^}]*\blang ?= ?([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)/.exec(code)
  if (m) return m[1]!
  // babel: the last option is the main language (\usepackage[french,english]{babel} → english),
  // unless `main=` says otherwise.
  m = /\\usepackage\[([^\]]*)\]\{babel\}/.exec(code)
  if (m) {
    const opts = m[1]!.split(',').map((o) => o.trim())
    const main = opts.find((o) => o.startsWith('main='))?.slice(5)
    const candidates = main ? [main] : [...opts].reverse()
    for (const opt of candidates) {
      const lang = BABEL_LANGS[opt]
      if (lang) return lang
    }
  }
  m = /\\setmainlanguage(?:\[[^\]]*\])?\{([^}]*)\}/.exec(code)
  if (m) return BABEL_LANGS[m[1]!.trim()] ?? null
  if (/\\usepackage(?:\[[^\]]*\])?\{(?:kotex|xetexko|luatexko)\}/.test(code)) return 'ko-KR'
  if (/\\usepackage\s*(?:\[[^\]]*\])?\s*\{(?:xeCJK|luatexja|luatexja-fontspec)\}/.test(code)) {
    return null
  }
  return null
}

/** True when the main file already declares `\DocumentMetadata`. */
export function hasDocumentMetadata(source: string): boolean {
  return /\\DocumentMetadata\{/.test(stripComments(source))
}

export interface DocumentMetadataInjection {
  source: string
  /** False when the document already carried its own `\DocumentMetadata` (left untouched). */
  injected: boolean
  lang: string
  standard: PdfStandard
}

/**
 * Main-file source for the accessible export: `\DocumentMetadata{…}` prepended on the first
 * line (it must precede `\documentclass`; no line number moves). A document that already
 * declares its own metadata is trusted as written.
 */
export function injectDocumentMetadata(
  source: string,
  options: AccessibleExportOptions = {},
): DocumentMetadataInjection {
  const lang = options.lang ?? detectDocumentLanguage(source) ?? 'en-US'
  const standard = options.standard ?? 'ua-2'
  if (hasDocumentMetadata(source)) return { source, injected: false, lang, standard }
  const pdfversion = standard === 'ua-2' ? '2.0' : '1.7'
  const decl = `\\DocumentMetadata{lang=${lang}, pdfversion=${pdfversion}, pdfstandard=${standard}, tagging=on}`
  return { source: `${decl}${source}`, injected: true, lang, standard }
}

/** Error text the kernel emits when it predates `tagging=on` (TeX Live 2025's 2024-11 kernel). */
export function kernelLacksTagging(log: string): boolean {
  return /key 'document\/metadata\/tagging' is unknown|Undefined document metadata key 'tagging'/.test(
    log,
  )
}

export interface PdfTaggingReport {
  /** A structure tree root exists and the document is marked as tagged. */
  tagged: boolean
  /** `/Lang` of the document catalog, when declared. */
  lang: string | null
  /** PDF/UA part declared in XMP (`pdfuaid:part`), when any. */
  uaPart: number | null
  /** `/Figure` structure elements, and how many of them carry `/Alt`. */
  figures: number
  figuresWithAlt: number
  /** Heading (`/H`, `/H1`…`/H6`) and table structure elements. */
  headings: number
  tables: number
  /** Document title from the catalog/XMP, when any. */
  title: string | null
}

async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null
  try {
    const stream = new Blob([data as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('deflate'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

/** Every byte of the PDF plus its inflated streams (object streams hide the catalog and
 *  structure elements of a PDF 2.0 file from a plain scan). */
async function expandedPdfText(pdf: Uint8Array): Promise<string> {
  const latin1 = (bytes: Uint8Array): string => {
    let s = ''
    for (let i = 0; i < bytes.length; i += 8192) {
      s += String.fromCharCode(...bytes.subarray(i, i + 8192))
    }
    return s
  }
  const raw = latin1(pdf)
  const parts = [raw]
  const re = /\/FlateDecode[^>]*>>[ \r\n]{0,3}stream\r?\n/g
  for (const m of raw.matchAll(re)) {
    const start = (m.index ?? 0) + m[0].length
    let end = raw.indexOf('endstream', start)
    if (end < 0) continue
    // The EOL before `endstream` is not part of the stream data.
    while (end > start && (pdf[end - 1] === 0x0a || pdf[end - 1] === 0x0d)) end--
    const inflated = await inflate(pdf.subarray(start, end))
    if (inflated) parts.push(latin1(inflated))
  }
  return parts.join('\n')
}

/** Structure elements as rough dictionary texts: everything from one `/Type /StructElem`
 *  to the next (or `endobj`). Good enough to read `/S` and `/Alt` without a PDF parser. */
function structElements(text: string): string[] {
  const out: string[] = []
  const re = /\/Type\s*\/StructElem/g
  const starts = [...text.matchAll(re)].map((m) => m.index ?? 0)
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!
    const next = starts[i + 1] ?? text.length
    const endobj = text.indexOf('endobj', start)
    const end = endobj >= 0 && endobj < next ? endobj : next
    out.push(text.slice(start, end))
  }
  return out
}

/** The `/Alt` text of a structure element (literal or UTF-16BE hex string), or null. */
function altTextOf(element: string): string | null {
  const hex = /\/Alt ?<([0-9A-Fa-f\s]*)>/.exec(element)
  if (hex) {
    const digits = hex[1]!.replace(/\s+/g, '')
    const bytes: number[] = []
    for (let i = 0; i + 1 < digits.length; i += 2)
      bytes.push(Number.parseInt(digits.slice(i, i + 2), 16))
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      let text = ''
      for (let i = 2; i + 1 < bytes.length; i += 2) {
        text += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!)
      }
      return text
    }
    return String.fromCharCode(...bytes)
  }
  const literal = /\/Alt ?\(((?:[^()\\]|\\.)*)\)/.exec(element)
  return literal ? literal[1]!.replace(/\\(.)/g, '$1') : null
}

/** tagpdf fills a missing `alt=` with the graphic's file name, so that is not a text
 *  alternative a reader can use. */
function isPlaceholderAlt(alt: string): boolean {
  return /^[\w./-]+\.(?:png|jpe?g|pdf|eps|svg|gif|tiff?|bmp|jbig2|jp2)$/i.test(alt.trim())
}

interface StructureCounts {
  figures: number
  figuresWithAlt: number
  headings: number
  tables: number
}

function countStructure(elements: string[]): StructureCounts {
  const counts: StructureCounts = { figures: 0, figuresWithAlt: 0, headings: 0, tables: 0 }
  for (const element of elements) {
    const tag = /\/S\s*\/([A-Za-z0-9_.-]+)/.exec(element)?.[1] ?? null
    if (tag === 'Figure') {
      counts.figures++
      const alt = altTextOf(element)
      if (alt && !isPlaceholderAlt(alt)) counts.figuresWithAlt++
    } else if (tag && /^(?:H[1-6]?|Title)$/.test(tag)) counts.headings++
    else if (tag === 'Table') counts.tables++
  }
  return counts
}

/** Read back what an exported PDF declares, without a PDF library. */
export async function inspectPdfTagging(pdf: Uint8Array): Promise<PdfTaggingReport> {
  const text = await expandedPdfText(pdf)
  const structRoot = /\/StructTreeRoot\b/.test(text)
  const marked = /\/Marked\s+true\b/.test(text)
  const lang = /\/Lang ?\(([^)]*)\)/.exec(text)?.[1] ?? null
  const ua = /pdfuaid:part\s*=\s*"(\d)"|<pdfuaid:part>\s*(\d)/.exec(text)
  const uaPart = ua ? Number(ua[1] ?? ua[2]) : null
  const titleMatch = /<dc:title>[\s\S]{0,400}?<rdf:li[^>]*>([^<]*)<\/rdf:li>/.exec(text)
  const title = titleMatch?.[1]?.trim() || (/\/Title ?\(([^)]*)\)/.exec(text)?.[1] ?? null)
  return {
    tagged: structRoot && marked,
    lang,
    uaPart,
    ...countStructure(structElements(text)),
    title: title || null,
  }
}
