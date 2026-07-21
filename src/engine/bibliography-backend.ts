/**
 * Pluggable bibliography backend.
 *
 * The document determines which bibliography processor a project needs. Classic
 * `\bibliography` + `\bibliographystyle` (and `thebibliography`) is handled by
 * the bundled BibTeX WASM engine (the legacy path, unchanged). `biblatex`
 * documents are handled by a registered {@link BibliographyBackend} — wasmtex
 * ships a TypeScript "biblatex-lite" backend covering the common numeric/sorted
 * subset, and a high-fidelity Biber backend can be slotted in later (see the
 * decision spike in `docs/bibliography.md`).
 */
import type { BibEntry } from '../lsp/types'
import type { BackendRegistry } from './backend-registry'
import { stripTexComments } from './tex-comments'

export type BibliographyMode = 'biblatex' | 'bibtex' | 'none'

/** Detect which bibliography toolchain a LaTeX source needs. */
export function detectBibliographyMode(source: string): BibliographyMode {
  // Strip comments so commented-out directives don't trigger detection.
  const code = stripTexComments(source)
  if (/\\usepackage(?:\[[^\]]*\])?\{[^}]*\bbiblatex\b[^}]*\}/.test(code)) return 'biblatex'
  if (
    /\\bibliography\b/.test(code) ||
    /\\bibliographystyle\b/.test(code) ||
    /\\begin\{thebibliography\}/.test(code)
  ) {
    return 'bibtex'
  }
  return 'none'
}

// --- Pluggable bibliography stage (execution-model principle 3) --------------

/** The per-stage backend name the compiler resolves the bibliography pass through.
 *  Matches the stage used by the server biber backend (`biber-backend.ts`). */
export const BIBLIOGRAPHY_STAGE = 'bibliography'

/** What {@link WasmTexCompiler} sends to a **server** bibliography backend for the
 *  classic BibTeX flow: the `.aux` emitted by the first LaTeX pass plus the project's
 *  `.bib` databases. The backend runs BibTeX off-device and returns the `.bbl`. (Biber's
 *  biblatex flow uses the `.bcf`-based `BiberRequest` in `biber-backend.ts`, which the
 *  headless compiler drives via `runRemoteBiber` — see `maybeRunBiblatex` in `headless.ts`.) */
export interface BibliographyStageRequest {
  aux: string
  bibFiles: Record<string, string>
  /** Project-local custom `.bst` styles referenced by `\bibliographystyle{...}` (path →
   *  content), so a backend that can't read the project FS still finds a non-bundled style. */
  bstFiles?: Record<string, string>
}

/**
 * Resolve the project-local `.bst` referenced by `\bibliographystyle{name}` (recorded in the
 * `.aux` as `\bibstyle{name}`). Returns the file path + content to hand BibTeX, or null when
 * there's no `\bibstyle` or the style is a bundled one not present in the project. `read`
 * looks a path up in the project FS. Extracted as a pure seam so the bst-wiring is unit-tested
 * without a WASM BibTeX engine — the client path silently dropped custom styles without it.
 */
export function resolveBstFile(
  auxContent: string,
  read: (path: string) => string | null,
): { path: string; content: string } | null {
  const m = auxContent.match(/\\bibstyle\{([^}]+)\}/)
  if (!m) return null
  const name = m[1]!
  const path = name.endsWith('.bst') ? name : `${name}.bst`
  const content = read(path)
  return content != null ? { path, content } : null
}

/**
 * Route the bibliography stage through the backend registry: if the integrator registered
 * a **server** backend for {@link BIBLIOGRAPHY_STAGE}, run it and return the `.bbl`;
 * otherwise return `null` so the caller falls back to the built-in client BibTeX engine.
 *
 * This is what keeps the client-first default non-negotiable — a remote backend runs only
 * when the integrator explicitly wired one (and only sees what is routed to it). Extracted
 * from the compiler so the routing is unit-testable without a WASM engine.
 */
export async function runRemoteBibliography(
  registry: BackendRegistry | undefined,
  request: BibliographyStageRequest,
): Promise<string | null> {
  const backend = registry?.resolve<BibliographyStageRequest, string>(BIBLIOGRAPHY_STAGE)
  if (!backend || backend.location !== 'server') return null
  return backend.run(request)
}

/** Parse the `backend=...` option of `\usepackage[...]{biblatex}` (default `biber`). */
export function detectBiblatexBackend(source: string): 'biber' | 'bibtex' {
  // Strip comments first (mirroring detectBibliographyMode) so a commented-out directive
  // isn't read ahead of the live \usepackage{biblatex}.
  const code = stripTexComments(source)
  const m = code.match(/\\usepackage\[([^\]]*)\]\{[^}]*\bbiblatex\b[^}]*\}/)
  return m && /\bbackend\s*=\s*bibtex\b/.test(m[1]!) ? 'bibtex' : 'biber'
}

/** Map the biblatex `sorting=` option to the lite backend's supported schemes: `none` (cite
 *  order) or `nty` (name/title/year, the biblatex default). Any other scheme (`nyt`, `ynt`,
 *  …) falls back to `nty` — the documented-subset behavior. Comments are stripped first so a
 *  commented-out `sorting=none` doesn't win over the live option. */
export function detectBiblatexSort(source: string): 'nty' | 'none' {
  return /\bsorting\s*=\s*none\b/.test(stripTexComments(source)) ? 'none' : 'nty'
}

/**
 * Extract the cited keys (in citation order) from a biblatex `.bcf` control file. A biblatex
 * document records its citations as `<bcf:citekey>…</bcf:citekey>` entries in the `.bcf` (not
 * `\bibdata{}`/`\citation{}` in the `.aux`), so this is how the lite backend learns what to
 * emit. A `*` key (from `\nocite{*}`) is returned verbatim for the caller to expand to every
 * entry. Duplicate-key de-duplication is left to {@link generateBiblatexBbl}.
 */
export function parseBcfCitedKeys(bcf: string): string[] {
  return [...bcf.matchAll(/<bcf:citekey\b[^>]*>([^<]*)<\/bcf:citekey>/g)]
    .map((m) => m[1]!.trim())
    .filter(Boolean)
}

export interface BblInput {
  entries: BibEntry[]
  /** Citation keys actually used in the document (in first-cite order). */
  citedKeys: string[]
  /** biblatex sorting scheme. `nty` = name/title/year; `none` = cite order. */
  sort?: 'nty' | 'none'
}

/** A pluggable bibliography backend: turns cited entries into a `.bbl`. */
export interface BibliographyBackend {
  id: string
  /** Generate the `.bbl` contents for the cited entries. */
  generateBbl(input: BblInput): string
}

// --- biblatex-lite -----------------------------------------------------------

function sortKey(entry: BibEntry): string {
  const author = (entry.author ?? '').toLowerCase()
  const title = (entry.title ?? '').toLowerCase()
  const year = entry.year ?? ''
  return `${author} ${title} ${year}`
}

/** Split a biblatex name list ("Last, First and ...") into {family, given} parts. */
function parseNames(raw: string): Array<{ family: string; given: string }> {
  return raw
    .split(/\s+and\s+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const comma = name.indexOf(',')
      if (comma >= 0) {
        return { family: name.slice(0, comma).trim(), given: name.slice(comma + 1).trim() }
      }
      const lastSpace = name.lastIndexOf(' ')
      return lastSpace >= 0
        ? { family: name.slice(lastSpace + 1).trim(), given: name.slice(0, lastSpace).trim() }
        : { family: name, given: '' }
    })
}

/** Drop only UNBALANCED braces (stray opens/closes), preserving balanced groups so a
 *  brace-delimited command like `\emph{Hard}` survives intact. Unbalanced-stripping all
 *  braces fused `\emph{Hard}` → `\emphHard`, an undefined control sequence. */
/** True when value[i] is preceded by an ODD run of backslashes — i.e. it's escaped. Same
 *  even/odd parity safe()'s special-escape regex uses. */
function isEscaped(value: string, i: number): boolean {
  let bs = 0
  while (i - 1 - bs >= 0 && value[i - 1 - bs] === '\\') bs++
  return bs % 2 === 1
}

function dropUnbalancedBraces(value: string): string {
  const remove = new Set<number>()
  const opens: number[] = []
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    // Only unescaped braces are grouping delimiters. A non-brace, or an escaped `\{` / `\}`
    // (a literal brace control sequence), is skipped (`\\{`, an even run, stays a real group).
    if ((ch !== '{' && ch !== '}') || isEscaped(value, i)) continue
    if (ch === '{') opens.push(i)
    else if (opens.length > 0) opens.pop()
    else remove.add(i) // stray close
  }
  for (const i of opens) remove.add(i) // unmatched opens
  if (remove.size === 0) return value
  let out = ''
  for (let i = 0; i < value.length; i++) if (!remove.has(i)) out += value[i]
  return out
}

/** Make a bib field value safe to interpolate into a `{…}` group: drop stray (unbalanced)
 *  braces so the group stays balanced, and escape the LaTeX specials that hard-error or
 *  silently corrupt the typeset bibliography (`&` alignment-tab, `%` comment, `#` macro
 *  param). A special is escaped only when preceded by an EVEN backslash run (0,2,…), so a
 *  user's `\&` is left intact but a `\\&` (escaped backslash + live `&`) IS escaped.
 *  Backslash commands / accents / math (`\LaTeX`, `\"o`, `$x^2$`) and balanced
 *  brace-delimited commands are preserved (biblatex-lite is a documented subset). */
function safe(value: string): string {
  return dropUnbalancedBraces(value).replace(/(\\*)([&%#])/g, (_m, bs: string, sp: string) =>
    bs.length % 2 === 0 ? `${bs}\\${sp}` : `${bs}${sp}`,
  )
}

function nameField(raw: string): string {
  const names = parseNames(raw)
  const blocks = names
    .map((n) => `    {{family={${safe(n.family)}},given={${safe(n.given)}}}}%`)
    .join('\n')
  return `  \\name{author}{${names.length}}{}{%\n${blocks}\n  }`
}

function entryBlock(entry: BibEntry): string {
  const lines = [`\\entry{${safe(entry.key)}}{${safe(entry.type)}}{}{}`]
  if (entry.author) lines.push(nameField(entry.author))
  for (const field of ['title', 'year', 'journal'] as const) {
    const value = entry[field]
    if (value) lines.push(`  \\field{${field}}{${safe(value)}}`)
  }
  lines.push('\\endentry')
  return lines.join('\n')
}

/**
 * biblatex-lite: generate a `.bbl` for the cited entries covering the common
 * numeric/author-year subset (sorting + the core author/title/year/journal
 * fields). Documented subset — full biblatex fidelity is the Biber backend's job.
 */
export function generateBiblatexBbl(input: BblInput): string {
  const byKey = new Map(input.entries.map((e) => [e.key, e]))
  // De-duplicate cited keys (a key cited twice must appear once) preserving
  // first-cite order; a repeated `\entry` makes biblatex reject the .bbl.
  const cited = [...new Set(input.citedKeys)]
    .map((k) => byKey.get(k))
    .filter((e): e is BibEntry => !!e)
  // Code-point comparator, NOT localeCompare: the .bbl is a content-addressed artifact
  // reused across hosts, and locale-dependent collation of accented chars would make its
  // byte order host-dependent, breaking cross-host parity.
  if (input.sort !== 'none')
    cited.sort((a, b) => {
      const ka = sortKey(a)
      const kb = sortKey(b)
      return ka < kb ? -1 : ka > kb ? 1 : 0
    })

  const datalist =
    input.sort === 'none' ? 'none/global//global/global' : 'nty/global//global/global'
  const body = cited.map(entryBlock).join('\n')
  return [
    '\\begin{refsection}',
    `\\datalist[entry]{${datalist}}`,
    body,
    '\\enddatalist',
    '\\end{refsection}',
    '',
  ].join('\n')
}

/** The bundled biblatex-lite backend. */
export const biblatexLiteBackend: BibliographyBackend = {
  id: 'biblatex-lite',
  generateBbl: generateBiblatexBbl,
}

/**
 * Choose a backend for a biblatex document. Hosts may pass their own backends
 * (e.g. a future Biber-WASM backend) — the first whose id matches the requested
 * preference wins, otherwise the bundled biblatex-lite backend is used.
 */
export function selectBiblatexBackend(
  backends: BibliographyBackend[] = [],
  preferredId?: string,
): BibliographyBackend {
  return backends.find((b) => b.id === preferredId) ?? backends[0] ?? biblatexLiteBackend
}
