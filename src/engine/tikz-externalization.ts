/**
 * TikZ/pgfplots figure externalization on top of the upstream `external` library (#82).
 *
 * Nothing here patches the engine or reimplements TikZ. The document's own
 * `\tikzexternalize` is honoured exactly the way `pdflatex -shell-escape` would honour it
 * on a desktop, except that the per-figure jobs run on a pool of sibling compilers instead
 * of being spawned through `system()` (which the WASM engine has no shell for):
 *
 * 1. The **main job** runs in `mode=list and make`. The library writes `<realjob>.figlist`
 *    (every figure name), includes the figures whose PDF already exists, and keeps an
 *    MD5 of each picture's source in `<figure>.md5` (its own up-to-date check).
 * 2. For every figure whose MD5 changed (or that has no PDF yet), a **figure job** compiles
 *    the same document with the same preamble and the library's grab mode selecting just
 *    that picture — the library's `optimize` path skips every other picture. Because the
 *    preamble is identical across figures, a sibling compiler reuses its preamble snapshot
 *    for all of them, so a figure job costs about the picture alone.
 * 3. The figure PDFs are written into the main engine and the main job runs once more.
 *
 * A text-only edit therefore recompiles no picture at all, and a single-picture edit
 * recompiles just that one. Measured on a 15-figure document: 1108 ms → 137 ms warm.
 */

export type TikzExternalizationMode = 'document' | 'auto' | 'off'

export interface TikzExternalizationOptions {
  /** `'document'` (default): externalize only when the document itself calls
   *  `\tikzexternalize` (such documents otherwise fail every figure with a shell-escape
   *  error and fall back to inline typesetting). `'auto'`: additionally externalize
   *  documents that load TikZ/pgfplots but never call `\tikzexternalize`, by activating
   *  the library at the end of the preamble. `'off'`: never. */
  mode?: TikzExternalizationMode
  /** Maximum number of sibling compilers rendering figures concurrently. Each one is a
   *  full engine worker with its own preamble snapshot. Defaults to
   *  `min(3, hardwareConcurrency - 1)`, at least 1. */
  workers?: number
}

/** How externalization is switched on for a given main source. */
export type TikzExternalizationKind = 'document' | 'inject'

/** `\jobname` the figure jobs run under; must differ from the real job's name so the
 *  library enters figure (grab) mode. Never a file the project could own. */
export const FIGURE_JOBNAME = 'wasmtex-figure'

/** Jobname of the pdfLaTeX preamble snapshot: `\tikzexternalize` executed inside the
 *  snapshot records it as the real job, so figure names derive from it. */
export const PREAMBLE_SNAPSHOT_JOBNAME = '_preamble'

const BEGIN_DOCUMENT = '\\begin{document}'

/** Strip `%` comments (respecting `\%`) so detection ignores commented-out commands. */
function stripComments(source: string): string {
  return source.replace(/(^|[^\\])(\\\\)*%.*$/gm, (_m, pre, esc) => `${pre}${esc ?? ''}`)
}

/** Offset of the first uncommented `\begin{document}`, or -1. */
export function findBeginDocument(source: string): number {
  const re = /\\begin\{document\}/g
  for (const m of source.matchAll(re)) {
    const lineStart = source.lastIndexOf('\n', m.index) + 1
    const before = source.slice(lineStart, m.index)
    if (!/(^|[^\\])(\\\\)*%/.test(before)) return m.index
  }
  return -1
}

/** True when the preamble calls `\tikzexternalize` outside a comment. */
export function documentExternalizes(source: string): boolean {
  const at = findBeginDocument(source)
  const preamble = stripComments(at >= 0 ? source.slice(0, at) : source)
  return /\\tikzexternalize\b/.test(preamble)
}

/** True when the preamble loads tikz or pgfplots (directly). */
export function loadsTikz(source: string): boolean {
  const at = findBeginDocument(source)
  const preamble = stripComments(at >= 0 ? source.slice(0, at) : source)
  return /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{[^}]*\b(?:tikz|pgfplots)\b[^}]*\}/.test(
    preamble,
  )
}

/** A per-document override in the main file's magic comments, next to `% !TEX program`:
 *  `% !WASMTEX tikz-externalization = off | document | auto`. Lets an author (or a host
 *  that defaults to `'auto'`) switch one project without a host setting. */
export function documentExternalizationMode(source: string): TikzExternalizationMode | null {
  const m = /^\s*%\s*!WASMTEX\s+tikz-externali[sz]ation\s*[=:]\s*(off|document|auto)\b/im.exec(
    source,
  )
  return m ? (m[1]!.toLowerCase() as TikzExternalizationMode) : null
}

/** Decide whether (and how) a main source gets externalized under `mode` (the document's
 *  own magic comment wins over the host's mode). */
export function detectTikzExternalization(
  source: string,
  hostMode: TikzExternalizationMode = 'document',
): TikzExternalizationKind | null {
  const mode = documentExternalizationMode(source) ?? hostMode
  if (mode === 'off') return null
  if (findBeginDocument(source) < 0) return null
  if (documentExternalizes(source)) return 'document'
  if (mode === 'auto' && loadsTikz(source)) return 'inject'
  return null
}

/** Main-job source: the document as written, with the library switched to
 *  `list and make` (and, for `'inject'`, activated) on the `\begin{document}` line so
 *  no line number moves. */
export function mainJobSource(source: string, kind: TikzExternalizationKind): string {
  const at = findBeginDocument(source)
  if (at < 0) return source
  const head = source.slice(0, at)
  const tail = source.slice(at + BEGIN_DOCUMENT.length)
  if (kind === 'inject') {
    return `${head}\\usetikzlibrary{external}\\tikzexternalize[mode=list and make]${BEGIN_DOCUMENT}${tail}`
  }
  return `${head}${BEGIN_DOCUMENT}\\tikzset{external/mode=list and make}${tail}`
}

/** Figure-job source for `figure`: the main-job source with the real job name pinned
 *  (so figure names match), `\jobname` redefined so the library enters grab mode
 *  (decided at `\tikzexternalize` time, inside the shared preamble), and the picture to
 *  grab selected right after `\begin{document}` (outside the preamble, so the sibling
 *  compiler's preamble snapshot is reused across figures). No line number moves. */
export function figureJobSource(
  source: string,
  kind: TikzExternalizationKind,
  realJob: string,
  figure: string,
): string {
  const main = mainJobSource(source, kind)
  const at = findBeginDocument(main)
  if (at < 0) return main
  const head = main.slice(0, at)
  const tail = main.slice(at + BEGIN_DOCUMENT.length)
  return (
    `\\def\\tikzexternalrealjob{${realJob}}\\def\\jobname{${FIGURE_JOBNAME}}` +
    `${head}${BEGIN_DOCUMENT}\\def\\pgfactualjobname{${figure}}${tail}`
  )
}

/** Figure names listed in a `.figlist` (one per line, in document order, deduplicated). */
export function parseFigureList(text: string | null | undefined): string[] {
  if (!text) return []
  const seen = new Set<string>()
  const names: string[] = []
  for (const raw of text.split('\n')) {
    const name = raw.trim()
    if (!name || seen.has(name) || /[\s\\{}]/.test(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

/** The picture hash recorded in a `<figure>.md5` file (`\tikzexternallastkey{…}%`). */
export function parseFigureMd5(text: string | null | undefined): string | null {
  if (!text) return null
  const m = /\\tikzexternallastkey\s*\{([^}]*)\}/.exec(text)
  return m ? m[1]!.trim() || null : null
}

/** Default figure-worker count: leave a core for the main engine, cap at three, one on
 *  low-memory devices (`navigator.deviceMemory` ≤ 4 GiB). */
export function defaultFigureWorkers(
  hardwareConcurrency: number | undefined,
  deviceMemoryGiB?: number,
): number {
  const cores = Math.max(2, hardwareConcurrency ?? 2)
  const byCores = Math.max(1, Math.min(3, cores - 1))
  // Every worker is a full engine heap; on a small device keep it to one.
  if (deviceMemoryGiB !== undefined && deviceMemoryGiB <= 4) return 1
  return byCores
}

/** Why `mode: 'auto'` leaves a document alone (the upstream library's documented limits). */
export type AutoExternalizationBlocker =
  | 'beamer'
  | 'remember-picture'
  | 'wrapped-environment'
  | 'too-few-pictures'

/** Minimum `tikzpicture` count for `'auto'`: below it, spawning a figure worker (its own
 *  preamble snapshot) costs more than the pictures save. */
export const AUTO_MIN_PICTURES = 3

/** Count picture starts (`\begin{tikzpicture}` and the `\tikz` short form) outside comments
 *  across the given sources. A static count: pictures produced by loops count once. */
export function countPictures(sources: Iterable<string>): number {
  let n = 0
  for (const source of sources) {
    const code = stripComments(source)
    n += code.match(/\\begin\s*\{tikzpicture\}|\\tikz\s*[[{]/g)?.length ?? 0
  }
  return n
}

/** True when a loop may multiply the static picture count (`\foreach`, `\pgfplotsforeachungrouped`, …). */
export function hasPictureLoops(sources: Iterable<string>): boolean {
  for (const source of sources) {
    if (
      /\\(?:foreach|pgfplotsforeachungrouped|pgfplotsinvokeforeach)\b/.test(stripComments(source))
    )
      return true
  }
  return false
}

/**
 * Patterns the `external` library cannot externalize faithfully without the author's
 * cooperation (each picture becomes an isolated PDF, so nothing may reach across pictures
 * or onto the page): page-anchored/overlay pictures (`remember picture`, `overlay`,
 * `current page`, `\tikzmark`), beamer overlays, and pictures hidden inside user-defined
 * environments (the library's picture skipping looks for a literal `\end{tikzpicture}`).
 * `'document'` mode never consults this — an author who wrote `\tikzexternalize` opted in.
 */
export function detectAutoBlocker(
  mainSource: string,
  sources: Iterable<string>,
): AutoExternalizationBlocker | null {
  const all = [...sources]
  const mainCode = stripComments(mainSource)
  if (/\\documentclass\s*(?:\[[^\]]*\])?\s*\{beamer\}/.test(mainCode)) return 'beamer'
  for (const source of all) {
    const code = stripComments(source)
    if (
      /remember\s+picture|(?:\[|,)\s*overlay\s*(?:,|\]|=)|current\s+page|\\tikzmark\b|\\usetikzlibrary\s*\{[^}]*\btikzmark\b/.test(
        code,
      )
    ) {
      return 'remember-picture'
    }
    if (
      /\\(?:re)?newenvironment\s*\*?\s*\{[^}]*\}(?:\s*\[[^\]]*\])*\s*\{[^{}]*\\begin\s*\{tikzpicture\}/.test(
        code,
      ) ||
      /\\NewDocumentEnvironment\s*\{[^}]*\}\s*\{[^}]*\}\s*\{[^{}]*\\begin\s*\{tikzpicture\}/.test(
        code,
      ) ||
      /\\(?:re)?newcommand\s*\*?\s*\{?\\[A-Za-z@]+\}?(?:\s*\[[^\]]*\])*\s*\{[^{}]*\\begin\s*\{tikzpicture\}/.test(
        code,
      )
    ) {
      return 'wrapped-environment'
    }
  }
  // The figure list from the first compile is the authority on the count (loops); the
  // static count only rules out the obvious cases up front.
  if (countPictures(all) < AUTO_MIN_PICTURES && !hasPictureLoops(all)) return 'too-few-pictures'
  return null
}
