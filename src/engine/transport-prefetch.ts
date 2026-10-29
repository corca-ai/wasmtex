import type { TexliveFileEntry } from '../types'
import { PRELOAD_FILES } from './texlive-manifest'

/** A response candidate, not a resolved TeX file. Installation must not create MEMFS aliases. */
export interface PrefetchedResponse extends TexliveFileEntry {
  data: ArrayBuffer
  fileId: string | null
}

const MAX_REQUESTS = 128
const MAX_BYTES = 8 * 1024 * 1024
const MAX_FILE_BYTES = 1024 * 1024
const CONCURRENCY = 8
// Predict the common 10pt math/text outlines; other sizes and font families remain
// demand-loaded. Fetching every outline in the general warmup manifest doubles
// transfer bytes for a typical paper without shortening its critical path.
const COMMON_OUTLINE = /^(?:cm(?:r|mi|sy)(?:5|7|10)|cmex10|cmbx(?:10|12)|cmti10|msbm10)\.pfb$/
const MATH_HINTS = PRELOAD_FILES.filter((entry) =>
  entry.format === 32
    ? COMMON_OUTLINE.test(entry.filename)
    : entry.format !== 26 || !/^(?:article\.cls|ams.*\.sty)$/.test(entry.filename),
)

/** Literal declarations are hints only: TeX still chooses all branches and lookup candidates. */
export function declaredTexFiles(source: string): TexliveFileEntry[] {
  const code = source.replace(/(^|[^\\])(?:\\\\)*%[^\n]*/g, '$1')
  const files: TexliveFileEntry[] = []
  const declarations =
    /\\(documentclass|LoadClass(?:WithOptions)?|usepackage|RequirePackage(?:WithOptions)?)\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)\}/g
  for (const match of code.matchAll(declarations)) {
    const extension = /class/i.test(match[1]!) ? '.cls' : '.sty'
    for (const name of match[2]!.split(',').map((name) => name.trim())) {
      if (/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name))
        files.push({ format: 26, filename: name + extension })
    }
  }
  const inputs =
    /\\(?:input|InputIfFileExists|@input)\s*\{?([A-Za-z0-9][A-Za-z0-9_.-]*\.(?:sty|cls|def|clo|fd|cfg))(?=[\s}])/g
  for (const match of code.matchAll(inputs)) files.push({ format: 26, filename: match[1]! })
  return files
}

/** Bounded first-compile speculation. Failures never become negative resolver entries. */
export async function prefetchTexliveResponses(
  sources: Iterable<string>,
  baseUrl: string,
  signal: AbortSignal,
  resolved: ReadonlySet<string> = new Set(),
): Promise<PrefetchedResponse[]> {
  const queue: TexliveFileEntry[] = []
  const seen = new Set<string>()
  const enqueue = (entries: Iterable<TexliveFileEntry>) => {
    for (const entry of entries) {
      const key = `${entry.format}/${entry.filename}`
      if (seen.size >= MAX_REQUESTS || seen.has(key) || resolved.has(key)) continue
      seen.add(key)
      queue.push(entry)
    }
  }
  let math = false
  for (const source of sources) {
    enqueue(declaredTexFiles(source))
    math ||=
      /\$|\\(?:\[|\(|begin\s*\{(?:equation|align|gather)|(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{[^}]*ams)/.test(
        source,
      )
  }
  if (resolved.size === 0)
    enqueue(
      math
        ? MATH_HINTS
        : PRELOAD_FILES.filter((entry) =>
            ['l3backend-pdftex.def', 'size10.clo', 'cmr10.pfb'].includes(entry.filename),
          ),
    )
  const responses: PrefetchedResponse[] = []
  let bytes = 0
  const accepting = () => !signal.aborted && bytes < MAX_BYTES
  async function fetchEntry(entry: TexliveFileEntry): Promise<void> {
    const response = await fetch(`${baseUrl}pdftex/${entry.format}/${entry.filename}`, { signal })
    if (response.status !== 200) return
    const data = await response.arrayBuffer()
    if (!accepting() || data.byteLength > MAX_FILE_BYTES || bytes + data.byteLength > MAX_BYTES)
      return
    bytes += data.byteLength
    responses.push({ ...entry, data, fileId: response.headers.get('fileid') })
    if (entry.format === 26) enqueue(declaredTexFiles(new TextDecoder().decode(data)))
  }
  async function consume(): Promise<void> {
    while (queue.length && accepting()) {
      const entry = queue.shift()!
      try {
        await fetchEntry(entry)
      } catch {
        // Demand lookup owns failures and retries; speculative failure changes no TeX state.
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => consume()))
  return responses
}
