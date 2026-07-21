/**
 * Editor-neutral language feature providers.
 *
 * Each function is a pure query over the source (and the {@link ProjectIndex})
 * returning editor-agnostic results. The Monaco adapter
 * (`register-providers.ts`) binds these to monaco APIs; the same cores can back
 * a standalone LSP server (see the editor-agnostic-core architecture work).
 */
import { maskSpans } from './latex-parser'
import { CITE_CMDS, INPUT_CMDS, REF_CMDS } from './latex-patterns'
import { tokenize } from './latex-tokenizer'
import { getCommandPackage, getCommandSignature } from './package-db'
import type { ProjectIndex } from './project-index'
import { buildLineStarts, offsetToLineCol } from './source-position'

/** Predicate: is the given offset inside a non-code span (comment, inline verb,
 *  verbatim body, false conditional)? Built once per call from {@link maskSpans},
 *  mirroring the linter's flag-array approach. */
function buildIsMasked(content: string): (offset: number) => boolean {
  const spans = maskSpans(content)
  if (spans.length === 0) return () => false
  const flags = new Uint8Array(content.length)
  for (const [start, end] of spans) {
    for (let i = start; i < end && i < flags.length; i++) flags[i] = 1
  }
  return (offset: number) => flags[offset] === 1
}

/** 1-based, end-exclusive source range. */
export interface LFRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

// --- Signature help ----------------------------------------------------------

export interface SignatureHelp {
  /** Rendered signature, e.g. `\href{url}{text}`. */
  label: string
  parameters: string[]
  activeParameter: number
}

const COMMAND_CALL_RE = /\\([a-zA-Z@]+)\s*[[{]/g

/** Argument hints for the command whose argument list contains the cursor. */
export function getSignatureHelp(
  content: string,
  line: number,
  column: number,
): SignatureHelp | null {
  // Scan the whole prefix up to the cursor so multi-line argument lists work.
  const lineStart = buildLineStarts(content)[line - 1]
  if (lineStart === undefined) return null
  const upto = content.slice(0, lineStart + (column - 1))

  // Find the nearest command call whose argument list still encloses the cursor.
  let best: { name: string; argStart: number } | null = null
  for (const m of upto.matchAll(COMMAND_CALL_RE)) {
    best = { name: m[1]!, argStart: m.index + m[0].length - 1 }
  }
  if (!best) return null

  const sig = getCommandSignature(best.name)
  if (!sig || sig.length === 0) return null

  // Count opened argument groups between the call and the cursor → active param.
  const { opened, depth } = countOpenGroups(upto, best.argStart)
  if (depth === 0) return null // cursor is outside the argument list

  const parameters = sig.map((a) =>
    a.kind === 'required' ? `{${a.placeholder || 'arg'}}` : `[${a.placeholder || 'opt'}]`,
  )
  return {
    label: `\\${best.name}${parameters.join('')}`,
    parameters,
    activeParameter: Math.min(opened - 1, sig.length - 1),
  }
}

/** Count top-level groups opened (and current nesting depth) from `from` onward. */
function countOpenGroups(text: string, from: number): { opened: number; depth: number } {
  let depth = 0
  let opened = 0
  for (let i = from; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{' || ch === '[') {
      if (depth === 0) opened++
      depth++
    } else if (ch === '}' || ch === ']') {
      depth = Math.max(0, depth - 1)
    }
  }
  return { opened, depth }
}

// --- Folding ranges ----------------------------------------------------------

export interface FoldingRange {
  startLine: number
  endLine: number
  kind?: 'comment' | 'region'
}

/** Foldable ranges: environments, `% region`/`% endregion`, and section blocks. */
export function getFoldingRanges(content: string): FoldingRange[] {
  const lines = content.split('\n')
  const lineStarts = buildLineStarts(content)
  const isMasked = buildIsMasked(content)
  const ranges: FoldingRange[] = []
  const envStack: number[] = []
  const regionStack: number[] = []

  for (let i = 0; i < lines.length; i++) {
    foldEnvLine(lines[i]!, i, lineStarts[i]!, isMasked, envStack, ranges)
    foldRegionLine(lines[i]!, i, regionStack, ranges)
  }
  ranges.push(...sectionFoldingRanges(lines, lineStarts, isMasked))
  return ranges
}

const BEGIN_RE = /\\begin\{/g
const END_RE = /\\end\{/g

function foldEnvLine(
  text: string,
  i: number,
  lineStart: number,
  isMasked: (offset: number) => boolean,
  stack: number[],
  ranges: FoldingRange[],
): void {
  // Push/pop once per \begin/\end occurrence so a line opening (or closing) more than one
  // environment stays balanced. \begin/\end inside a comment or verbatim body are inert —
  // counting them would desync the stack and swallow real folds. A one-line
  // `\begin{x}...\end{x}` still produces no fold (its pop has i + 1 === start).
  // Walk the begins and ends in a single SOURCE-ORDER pass. Two sequential loops
  // (all begins, then all ends) mis-handle `\end{a}\begin{b}` on one line: the begin
  // would be pushed before the end pops, so the end consumes b's just-pushed start and
  // a later \end{b} closes a — yielding one wrong spanning fold instead of two.
  const events: { index: number; open: boolean }[] = []
  for (const m of text.matchAll(BEGIN_RE)) events.push({ index: m.index, open: true })
  for (const m of text.matchAll(END_RE)) events.push({ index: m.index, open: false })
  events.sort((a, b) => a.index - b.index)
  for (const ev of events) {
    if (isMasked(lineStart + ev.index)) continue
    if (ev.open) {
      stack.push(i + 1)
    } else {
      const start = stack.pop()
      if (start !== undefined && i + 1 > start) ranges.push({ startLine: start, endLine: i + 1 })
    }
  }
}

function foldRegionLine(text: string, i: number, stack: number[], ranges: FoldingRange[]): void {
  if (/^\s*%\s*region\b/i.test(text)) stack.push(i + 1)
  else if (/^\s*%\s*endregion\b/i.test(text)) {
    const start = stack.pop()
    if (start !== undefined) ranges.push({ startLine: start, endLine: i + 1, kind: 'region' })
  }
}

const SECTION_LEVELS = ['part', 'chapter', 'section', 'subsection', 'subsubsection']

function sectionLevel(text: string): { level: number; index: number } {
  const m = text.match(/\\(part|chapter|section|subsection|subsubsection)\b/)
  return m ? { level: SECTION_LEVELS.indexOf(m[1]!), index: m.index! } : { level: -1, index: -1 }
}

function sectionFoldingRanges(
  lines: string[],
  lineStarts: number[],
  isMasked: (offset: number) => boolean,
): FoldingRange[] {
  const ranges: FoldingRange[] = []
  const open: Array<{ level: number; line: number }> = []
  const close = (downTo: number, end: number): void => {
    while (open.length && open[open.length - 1]!.level >= downTo) {
      const s = open.pop()!
      if (end > s.line) ranges.push({ startLine: s.line, endLine: end })
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const { level, index } = sectionLevel(lines[i]!)
    // A \section inside a comment/verbatim/false-conditional is inert — skip it so it
    // neither anchors a fold nor closes a real outer section, mirroring foldEnvLine.
    if (level < 0 || isMasked(lineStarts[i]! + index)) continue
    close(level, i)
    open.push({ level, line: i + 1 })
  }
  close(0, lines.length)
  return ranges
}

// --- Document highlight ------------------------------------------------------

/** Ranges of every occurrence (in `file`) of the symbol under the cursor. */
export function getDocumentHighlights(
  file: string,
  line: number,
  column: number,
  index: ProjectIndex,
): LFRange[] {
  const symbol = index.findSymbolAt(file, line, column)
  if (!symbol) return []
  return index
    .findAllOccurrences(symbol.name, symbol.type)
    .filter((o) => o.filePath === file)
    .map((o) => ({
      startLine: o.line,
      startColumn: o.column,
      endLine: o.line,
      endColumn: o.column + o.length,
    }))
}

// --- Workspace symbols -------------------------------------------------------

export interface WorkspaceSymbol {
  name: string
  kind: 'label' | 'section' | 'command'
  file: string
  line: number
  column: number
}

/** Search labels, sections, and command definitions across the project. */
export function getWorkspaceSymbols(query: string, index: ProjectIndex): WorkspaceSymbol[] {
  const q = query.toLowerCase()
  const match = (name: string): boolean => !q || name.toLowerCase().includes(q)
  const out: WorkspaceSymbol[] = []
  for (const label of index.getAllLabels()) {
    if (match(label.name)) {
      out.push({ name: label.name, kind: 'label', ...locOf(label.location) })
    }
  }
  for (const file of index.getFiles()) {
    for (const sec of index.getFileSymbols(file)?.sections ?? []) {
      if (match(sec.title)) out.push({ name: sec.title, kind: 'section', ...locOf(sec.location) })
    }
  }
  for (const cmd of index.getCommandDefs()) {
    if (match(cmd.name)) out.push({ name: cmd.name, kind: 'command', ...locOf(cmd.location) })
  }
  return out
}

function locOf(loc: { file: string; line: number; column: number }): {
  file: string
  line: number
  column: number
} {
  return { file: loc.file, line: loc.line, column: loc.column }
}

// --- Inlay hints -------------------------------------------------------------

export interface InlayHint {
  line: number
  column: number
  label: string
}

const REF_RESOLVE_RE = new RegExp(`\\\\(?:${REF_CMDS})\\{([^}]+)\\}`, 'g')

/** Inline resolved `.aux` numbers next to `\ref` (e.g. `\ref{fig:x}` → "(3.2)"). */
export function getInlayHints(content: string, index: ProjectIndex): InlayHint[] {
  const aux = index.getAuxLabels()
  if (aux.size === 0) return []
  const lineStarts = buildLineStarts(content)
  const isMasked = buildIsMasked(content)
  const hints: InlayHint[] = []
  for (const m of content.matchAll(REF_RESOLVE_RE)) {
    if (isMasked(m.index)) continue
    const resolved = aux.get(m[1]!.trim())
    if (!resolved) continue
    const { line, column } = offsetToLineCol(lineStarts, m.index + m[0].length)
    hints.push({ line, column, label: ` (${resolved})` })
  }
  return hints
}

// --- Document links ----------------------------------------------------------

export interface DocumentLink {
  range: LFRange
  target: string
  /** A project file path, or an external URL. */
  kind: 'file' | 'url'
}

const FILE_LINK_RE = new RegExp(`\\\\(?:${INPUT_CMDS})\\{([^}]+)\\}`, 'g')
const URL_LINK_RE = /\\(?:url|href)\{([^}]+)\}/g

/** Clickable `\input`/`\include`/`\subfile` files and `\url`/`\href` URLs. */
export function getDocumentLinks(content: string): DocumentLink[] {
  const lineStarts = buildLineStarts(content)
  const isMasked = buildIsMasked(content)
  const links: DocumentLink[] = []
  collectLinks(content, FILE_LINK_RE, 'file', lineStarts, isMasked, links)
  collectLinks(content, URL_LINK_RE, 'url', lineStarts, isMasked, links)
  return links
}

function collectLinks(
  content: string,
  re: RegExp,
  kind: 'file' | 'url',
  lineStarts: number[],
  isMasked: (offset: number) => boolean,
  out: DocumentLink[],
): void {
  for (const m of content.matchAll(re)) {
    if (isMasked(m.index)) continue
    const target = m[1]!.trim()
    if (!target) continue
    const argStart = m.index + m[0].indexOf('{') + 1
    const start = offsetToLineCol(lineStarts, argStart)
    const end = offsetToLineCol(lineStarts, argStart + m[1]!.length)
    out.push({
      range: {
        startLine: start.line,
        startColumn: start.column,
        endLine: end.line,
        endColumn: end.column,
      },
      target,
      kind,
    })
  }
}

// --- Semantic tokens ---------------------------------------------------------

export type SemanticTokenType = 'command' | 'math' | 'comment' | 'verbatim'

export interface SemanticToken {
  line: number
  startColumn: number
  length: number
  type: SemanticTokenType
}

/** Classify tokens for accurate highlighting (commands, math, comments, verbatim). */
export function getSemanticTokens(content: string): SemanticToken[] {
  const tokens = tokenize(content)
  const out: SemanticToken[] = []
  let inMath = false
  for (const t of tokens) {
    if (t.type === 'math') {
      inMath = !inMath // $ / $$
      continue
    }
    // `\(`/`\[` open math and `\)`/`\]` close it — the tokenizer emits these as
    // command tokens, so toggle math mode here rather than miss it.
    if (t.type === 'command' && (t.value === '(' || t.value === '[')) {
      inMath = true
      continue
    }
    if (t.type === 'command' && (t.value === ')' || t.value === ']')) {
      inMath = false
      continue
    }
    const type = semanticType(t.type, inMath)
    if (type) out.push({ line: t.line, startColumn: t.column, length: t.end - t.start, type })
  }
  return out
}

function semanticType(tokenType: string, inMath: boolean): SemanticTokenType | null {
  if (tokenType === 'comment') return 'comment'
  if (tokenType === 'verb') return 'verbatim'
  if (tokenType === 'command') return inMath ? 'math' : 'command'
  return null
}

// --- Code actions / quick-fixes ---------------------------------------------

export interface TextEdit {
  range: LFRange
  newText: string
}

export interface CodeAction {
  title: string
  kind: 'quickfix'
  edits: Array<{ file: string; edit: TextEdit }>
}

/** Quick-fixes for the diagnostics/commands intersecting the given line. */
export function getCodeActions(
  content: string,
  file: string,
  line: number,
  index: ProjectIndex,
): CodeAction[] {
  const actions: CodeAction[] = []
  const lineText = content.split('\n')[line - 1] ?? ''
  addNbspFix(lineText, file, line, actions)
  addUsepackageFix(lineText, content, file, index, actions)
  addCreateLabelFix(lineText, file, line, index, actions)
  return actions
}

function addNbspFix(lineText: string, file: string, line: number, out: CodeAction[]): void {
  const m = lineText.match(new RegExp(`(?<=\\S)( )\\\\(?:${REF_CMDS}|${CITE_CMDS})\\b`))
  if (!m || m.index === undefined) return
  const col = m.index + 1 // 1-based column of the space (match starts at the space)
  out.push({
    title: "Use a non-breaking space '~'",
    kind: 'quickfix',
    edits: [
      {
        file,
        edit: {
          range: { startLine: line, startColumn: col, endLine: line, endColumn: col + 1 },
          newText: '~',
        },
      },
    ],
  })
}

function addUsepackageFix(
  lineText: string,
  content: string,
  file: string,
  index: ProjectIndex,
  out: CodeAction[],
): void {
  const loaded = index.getLoadedPackages()
  for (const m of lineText.matchAll(/\\([a-zA-Z@]+)/g)) {
    const pkg = getCommandPackage(m[1]!)
    if (pkg && !loaded.has(pkg)) {
      out.push(makeUsepackageAction(content, file, pkg))
      return
    }
  }
}

function makeUsepackageAction(content: string, file: string, pkg: string): CodeAction {
  // Insert after \documentclass, else at the top of the file.
  const lines = content.split('\n')
  let insertLine = 1
  for (let i = 0; i < lines.length; i++) {
    if (/\\documentclass/.test(lines[i]!)) {
      insertLine = i + 2
      break
    }
  }
  return {
    title: `Add \\usepackage{${pkg}}`,
    kind: 'quickfix',
    edits: [
      {
        file,
        edit: {
          range: { startLine: insertLine, startColumn: 1, endLine: insertLine, endColumn: 1 },
          newText: `\\usepackage{${pkg}}\n`,
        },
      },
    ],
  }
}

function addCreateLabelFix(
  lineText: string,
  file: string,
  line: number,
  index: ProjectIndex,
  out: CodeAction[],
): void {
  const m = lineText.match(new RegExp(`\\\\(?:${REF_CMDS})\\{([^}]+)\\}`))
  if (!m) return
  const name = m[1]!.trim()
  if (index.findLabelDef(name) || index.resolveLabel(name)) return
  out.push({
    title: `Create \\label{${name}}`,
    kind: 'quickfix',
    edits: [
      {
        file,
        edit: {
          range: { startLine: line, startColumn: 1, endLine: line, endColumn: 1 },
          newText: `\\label{${name}}\n`,
        },
      },
    ],
  })
}
