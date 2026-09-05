import {
  CITE_CMDS,
  COMMAND_TOKEN,
  INPUT_CMDS,
  NEWCMD_CMDS,
  REF_CMDS,
  SECTION_CMDS,
  USEPACKAGE_CMDS,
} from './latex-patterns'
import { type Token, tokenize, VERBATIM_ENVIRONMENTS } from './latex-tokenizer'
import { buildLineStarts, offsetToLineCol } from './source-position'
import type { CommandDef, FileSymbols, SectionLevel, SourceLocation } from './types'

// --- Masking -----------------------------------------------------------------

/** TeX primitive conditional openers (excluding iffalse/iftrue, handled directly). */
const IF_OPENERS = new Set([
  'if',
  'ifx',
  'ifnum',
  'ifdim',
  'ifodd',
  'ifvmode',
  'ifhmode',
  'ifmmode',
  'ifinner',
  'ifvoid',
  'ifhbox',
  'ifvbox',
  'ifeof',
  'ifcase',
  'ifdefined',
  'ifcsname',
  'ifincsname',
  'iffontchar',
])

interface CondFrame {
  kind: 'false' | 'true' | 'other'
  falseStart: number
  elseSeen: boolean
}

/** Argument-taking conditional macros (ifthen, etoolbox) that are FULLY EXPANDABLE and
 *  take NO matching `\fi` — e.g. `\ifthenelse{c}{t}{f}`, `\ifdefempty{m}{t}{f}`. Treating
 *  these as openers pushes a phantom frame that steals the enclosing real conditional's
 *  `\else`/`\fi`, leaking its masked branch. They must NOT open a conditional frame. */
const ARG_CONDITIONAL_MACROS = new Set([
  'ifthenelse',
  'ifoddpage',
  'ifdef',
  'ifcsdef',
  'ifundef',
  'ifcsundef',
  'ifdefmacro',
  'ifdefparam',
  'ifdefempty',
  'ifcsempty',
  'ifdefvoid',
  'ifdefstring',
  'ifcsstring',
  'ifdefstrequal',
  'ifdefcounter',
  'ifcscounter',
  'ifdefdimen',
  'ifcsdimen',
  'ifboolexpr',
  'ifblank',
  'ifstrequal',
  'ifstrempty',
  'ifnumcomp',
  'ifnumequal',
  'ifnumgreater',
  'ifnumless',
  'ifdimcomp',
  'ifdimequal',
  'ifdimgreater',
  'ifdimless',
  'ifbool',
  'iftoggle',
  'ifnumodd',
  'ifnumparity',
])

/** A user-defined conditional made with `\newif\ifX` (e.g. `\ifdraft`). TeX's true
 *  conditional set is unbounded, so any unrecognized `\if…` control word is treated as an
 *  opaque opener whose `\fi`/`\else` pairs off — otherwise its `\fi` would pop an enclosing
 *  `\iffalse`/`\iftrue` frame and end a mask span early. `\iff` is the math biconditional
 *  (not a conditional) and must be excluded so it never consumes a later `\fi`, as must the
 *  argument-taking `\if…{}{}` macros (ifthen/etoolbox) which carry no `\fi` at all. */
function isUserConditional(n: string): boolean {
  return n.length > 2 && n.startsWith('if') && n !== 'iff' && !ARG_CONDITIONAL_MACROS.has(n)
}

/** Spans of false conditional branches (`\iffalse`…`\else`/`\fi`, `\iftrue`…`\else`…`\fi`).
 *  Conditional tokens inside a verbatim body are inert (it's raw text, not code), so they
 *  must neither open, close, nor pair — otherwise an `\iffalse` in a code listing would
 *  mask real LaTeX after the listing. */
function conditionalMaskSpans(
  tokens: Token[],
  verbSpans: Array<[number, number]> = [],
): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  const stack: CondFrame[] = []
  const inVerbatim = (offset: number) => verbSpans.some(([s, e]) => offset >= s && offset < e)
  for (const t of tokens) {
    if (t.type === 'command' && !inVerbatim(t.start)) handleConditionalToken(t, stack, spans)
  }
  return spans
}

function handleConditionalToken(
  t: Token,
  stack: CondFrame[],
  spans: Array<[number, number]>,
): void {
  const n = t.value
  if (n === 'iffalse') stack.push({ kind: 'false', falseStart: t.end, elseSeen: false })
  else if (n === 'iftrue') stack.push({ kind: 'true', falseStart: -1, elseSeen: false })
  else if (n === 'if' || IF_OPENERS.has(n) || isUserConditional(n))
    stack.push({ kind: 'other', falseStart: -1, elseSeen: false })
  else if (n === 'else') handleElse(stack[stack.length - 1], t, spans)
  else if (n === 'fi') handleFi(stack.pop(), t, spans)
}

function handleElse(frame: CondFrame | undefined, t: Token, spans: Array<[number, number]>): void {
  if (!frame || frame.elseSeen) return
  frame.elseSeen = true
  if (frame.kind === 'false') spans.push([frame.falseStart, t.start])
  else if (frame.kind === 'true') frame.falseStart = t.end
}

function handleFi(frame: CondFrame | undefined, t: Token, spans: Array<[number, number]>): void {
  if (!frame) return
  if (frame.kind === 'false' && !frame.elseSeen) spans.push([frame.falseStart, t.start])
  else if (frame.kind === 'true' && frame.elseSeen) spans.push([frame.falseStart, t.start])
}

/** Body spans of verbatim-like environments (`\begin{verbatim}` … `\end{verbatim}`). */
function verbatimEnvMaskSpans(tokens: Token[]): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t.type !== 'command' || t.value !== 'begin') continue
    const name = readEnvName(tokens, i)
    if (!name || !VERBATIM_ENVIRONMENTS.has(name.name)) continue
    // Mask from the end of `}` after the begin name to the start of the matching \end.
    const end = findMatchingEnd(tokens, name.closeIndex + 1, name.name)
    const bodyEnd = end?.start ?? tokens[tokens.length - 1]!.end
    if (bodyEnd > name.closeEnd) spans.push([name.closeEnd, bodyEnd])
    if (end) i = end.index
  }
  return spans
}

/** Find `\end{name}` after index `from`; returns its start offset + token index. */
function findMatchingEnd(
  tokens: Token[],
  from: number,
  name: string,
): { start: number; index: number } | null {
  for (let j = from; j < tokens.length; j++) {
    const e = tokens[j]!
    if (e.type !== 'command' || e.value !== 'end') continue
    const endName = readEnvName(tokens, j)
    if (endName && endName.name === name) return { start: e.start, index: j }
  }
  return null
}

/** Read `{name}` immediately following a `\begin`/`\end` command token at index i. */
function readEnvName(
  tokens: Token[],
  i: number,
): { name: string; closeIndex: number; closeEnd: number } | null {
  let j = i + 1
  // skip whitespace-only text tokens
  while (j < tokens.length && tokens[j]!.type === 'text' && tokens[j]!.value.trim() === '') j++
  if (j >= tokens.length || tokens[j]!.type !== 'open') return null
  const nameTok = tokens[j + 1]
  if (!nameTok || nameTok.type !== 'text') return null
  const closeTok = tokens[j + 2]
  if (!closeTok || closeTok.type !== 'close') return null
  return { name: nameTok.value.trim(), closeIndex: j + 2, closeEnd: closeTok.end }
}

/**
 * Spans of source that are not interpretable LaTeX code: comments, inline
 * `\verb`, verbatim environment bodies, and false conditional branches. Other
 * consumers (e.g. the linter) use these to skip non-code regions.
 */
export function maskSpans(content: string): Array<[number, number]> {
  return collectMaskSpans(tokenize(content))
}

/** Like {@link maskSpans} but reuses already-computed tokens — so a caller that already
 *  tokenized (e.g. the linter) doesn't tokenize the same source a second time. */
export function maskSpansFromTokens(tokens: Token[]): Array<[number, number]> {
  return collectMaskSpans(tokens)
}

/** Collect every non-code span: comments, inline verb, verbatim bodies, false conditionals. */
function collectMaskSpans(tokens: Token[]): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  for (const t of tokens) {
    if (t.type === 'comment' || t.type === 'verb') spans.push([t.start, t.end])
  }
  const verbSpans = verbatimEnvMaskSpans(tokens)
  spans.push(...verbSpans)
  // Conditionals inside verbatim bodies are raw text — don't let them pair.
  spans.push(...conditionalMaskSpans(tokens, verbSpans))
  return spans
}

/**
 * Replace masked spans with spaces, preserving newlines (so line/column of the
 * surrounding code is unchanged). Comments and inline verb are masked from
 * their tokens; verbatim env bodies and false conditional branches from scans.
 */
function maskContent(content: string, tokens: Token[]): string {
  return blankSpans(content, collectMaskSpans(tokens))
}

/**
 * Blank the given spans (replace with spaces, keeping newlines so line/column of
 * surrounding code is unchanged). Copies unmasked regions verbatim and blanks only
 * the masked spans — avoids splitting the whole document into a per-character array,
 * since masked spans are usually a small fraction of the text. Spans may come from
 * several sources and overlap, so sort by start and clip against a cursor.
 */
function blankSpans(content: string, spans: Array<[number, number]>): string {
  if (spans.length === 0) return content
  const sorted = spans.length > 1 ? [...spans].sort((a, b) => a[0] - b[0]) : spans
  const parts: string[] = []
  let cursor = 0
  for (const [start, end] of sorted) {
    const s = start > cursor ? start : cursor
    const e = end < content.length ? end : content.length
    if (e <= s) continue
    if (s > cursor) parts.push(content.slice(cursor, s))
    parts.push(content.slice(s, e).replace(/[^\n]/g, ' '))
    cursor = e
  }
  if (cursor < content.length) parts.push(content.slice(cursor))
  return parts.join('')
}

// --- Brace helpers -----------------------------------------------------------

type GroupEndIndex = ReadonlyMap<number, number>

/**
 * Index matching braces/brackets once. Extractors consult this index instead
 * of rescanning to the end of the document for every malformed invocation.
 * Curly and square delimiters intentionally use independent stacks, matching
 * the previous per-delimiter nesting behavior.
 */
function indexGroupEnds(text: string): GroupEndIndex {
  const ends = new Map<number, number>()
  const braces: number[] = []
  const brackets: number[] = []
  const opening: Record<string, number[] | undefined> = { '{': braces, '[': brackets }
  const closing: Record<string, number[] | undefined> = { '}': braces, ']': brackets }
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    if (ch === '\\') {
      i++
      continue
    }
    const openStack = opening[ch]
    if (openStack) {
      openStack.push(i)
      continue
    }
    const closeStack = closing[ch]
    const start = closeStack?.pop()
    if (start !== undefined) ends.set(start, i)
  }
  return ends
}

/** Extract the content of a balanced brace group whose `{` is at startIndex. */
function extractBraceContent(
  text: string,
  startIndex: number,
  groupEnds?: GroupEndIndex,
): string | null {
  if (text[startIndex] !== '{') return null
  if (groupEnds) {
    const end = groupEnds.get(startIndex)
    return end === undefined ? null : text.slice(startIndex + 1, end)
  }
  let depth = 0
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === '\\') {
      i++ // skip the escaped char so `\{` / `\}` don't shift the brace depth
      continue
    }
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return text.slice(startIndex + 1, i)
    }
  }
  return null
}

// --- Extractors (operate on the whole masked string) -------------------------

const LABEL_RE = /\\label\{/g
const REF_RE = new RegExp(`\\\\(?:${REF_CMDS})\\{`, 'g')
const CITE_RE = new RegExp(`\\\\(?:${CITE_CMDS})(?:\\[[^\\]]*\\])*\\{`, 'g')
// Sectioning commands accept an optional short-title arg: `\section[TOC]{Full}`.
const SECTION_RE = new RegExp(`\\\\(${SECTION_CMDS})\\*?(?:\\[[^\\]]*\\])?\\{`, 'g')
const NEWCOMMAND_RE = new RegExp(`\\\\(?:${NEWCMD_CMDS})\\*?\\{\\\\(\\w+)\\}(?:\\[(\\d+)\\])?`, 'g')
const DEF_RE = /\\def\\(\w+)/g
const DECLARE_MATH_RE = /\\DeclareMathOperator\*?\{\\(\w+)\}/g
const BEGIN_RE = /\\begin\{/g
const INPUT_RE = new RegExp(`\\\\(${INPUT_CMDS})\\{`, 'g')
const USEPACKAGE_RE = new RegExp(`\\\\(?:${USEPACKAGE_CMDS})(?:\\[([^\\]]*)\\])?\\{`, 'g')
const COLOR_DECL_RE =
  /\\(definecolorset|providecolorset|preparecolorset|DefineNamedColor|definecolor|xdefinecolor|providecolor|colorlet)\*?(?![A-Za-z@:_])/g
const COLOR_ACTIVATION_RE = /\\(definecolors|providecolors)(?!et)\*?\s*\{/g
const COUNTER_RE =
  /\\(newcounter|providecounter|newaliascnt|setcounter|addtocounter|stepcounter|refstepcounter|value|counterwithin|counterwithout)\*?\s*\{/g
const LENGTH_USE_RE =
  /\\(setlength|addtolength|settowidth|settoheight|settodepth)\*?\s*\{\s*(\\[A-Za-z@]+)\s*\}/g
const LENGTH_DEF_RE =
  /\\(newlength|newdimen|newskip)\s*(?:\{\s*(\\[A-Za-z@]+)\s*\}|(\\[A-Za-z@]+))/g
const PGF_KEYS_RE = /\\pgfkeys\s*\{/g

const BIBITEM_COMMANDS = new Set(['bibitem'])
const ENVIRONMENT_DEF_COMMANDS = new Set([
  'newenvironment',
  'renewenvironment',
  'NewDocumentEnvironment',
  'RenewDocumentEnvironment',
  'ProvideDocumentEnvironment',
  'DeclareDocumentEnvironment',
  'newtheorem',
])
const CLASS_COMMANDS = new Set(['documentclass', 'LoadClass', 'LoadClassWithOptions'])
const BIB_RESOURCE_COMMANDS = new Set([
  'bibliography',
  'addbibresource',
  'addglobalbib',
  'addsectionbib',
])
const GLOSSARY_DEF_COMMANDS = new Set(['longnewglossaryentry', 'newglossaryentry'])
const GLOSSARY_USE_COMMANDS = new Set([
  'gls',
  'Gls',
  'glspl',
  'Glspl',
  'glsdisp',
  'Glsdisp',
  'glslink',
  'Glslink',
  'glsentryname',
  'Glsentryname',
  'glsentrytext',
  'Glsentrytext',
  'glsentryplural',
  'Glsentryplural',
  'glsentrydesc',
  'Glsentrydesc',
  'glsentrydescplural',
  'Glsentrydescplural',
  'glsentrysymbol',
  'Glsentrysymbol',
  'glsentrysymbolplural',
  'Glsentrysymbolplural',
  'glsadd',
])
const ACRONYM_DEF_COMMANDS = new Set(['newacronym'])
const ACRONYM_USE_COMMANDS = new Set([
  'acrshort',
  'Acrshort',
  'ACRshort',
  'acrlong',
  'Acrlong',
  'ACRlong',
  'acrfull',
  'Acrfull',
  'ACRfull',
  'ac',
  'Ac',
  'acf',
  'Acf',
  'acl',
  'Acl',
  'acs',
  'Acs',
  'acp',
  'Acp',
])
const FONT_USE_COMMANDS = new Set(['setmainfont', 'setsansfont', 'setmonofont', 'fontspec'])
const FONT_ALIAS_COMMANDS = new Set(['newfontfamily', 'newfontface'])
const FONT_FAMILY_COMMANDS = new Set(['DeclareFontFamily'])
const XKEYVAL_DECL_COMMANDS = new Set([
  'definekey',
  'define@key',
  'defineboolkey',
  'definechoicekey',
  'define@choicekey',
])
const DECLARE_KEYS_COMMANDS = new Set(['DeclareKeys'])

interface CommandOccurrence {
  name: string
  start: number
  end: number
}

function isCommandNameChar(ch: string | undefined): boolean {
  if (!ch) return false
  const code = ch.charCodeAt(0)
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    ch === '@' ||
    ch === ':' ||
    ch === '_'
  )
}

function scanCommandOccurrences(text: string): CommandOccurrence[] {
  const occurrences: CommandOccurrence[] = []
  let cursor = 0
  while (cursor < text.length) {
    const start = text.indexOf('\\', cursor)
    if (start < 0) break
    let end = start + 1
    while (isCommandNameChar(text[end])) end++
    if (end > start + 1) occurrences.push({ name: text.slice(start + 1, end), start, end })
    cursor = Math.max(start + 2, end)
  }
  return occurrences
}

interface Ctx {
  masked: string
  lineStarts: number[]
  file: string
  groupEnds: GroupEndIndex
  commandOccurrences: CommandOccurrence[]
}

function* commandsNamed(ctx: Ctx, names: ReadonlySet<string>): Generator<CommandOccurrence> {
  for (const occurrence of ctx.commandOccurrences) {
    if (names.has(occurrence.name)) yield occurrence
  }
}

function groupsAfterCommand(ctx: Ctx, command: CommandOccurrence): ParsedInvocationGroup[] {
  const cursor = ctx.masked[command.end] === '*' ? command.end + 1 : command.end
  return invocationGroups(ctx.masked, cursor, ctx.groupEnds)
}

function firstRequired(groups: ParsedInvocationGroup[]): ParsedInvocationGroup | undefined {
  return groups.find((group) => group.delimiter === 'required')
}

function groupValueStart(group: ParsedInvocationGroup): number {
  return group.contentStart + (group.value.length - group.value.trimStart().length)
}

function locAt(ctx: Ctx, offset: number): SourceLocation {
  const { line, column } = offsetToLineCol(ctx.lineStarts, offset)
  return { file: ctx.file, line, column }
}

/** Offset of the first non-space char in a brace group's content (for name start). */
function nameStartOffset(braceIdx: number, content: string): number {
  const trimmed = content.trimStart()
  return braceIdx + 1 + (content.length - trimmed.length)
}

/** Shared shape: for each match of `re`, take the first balanced brace group's content,
 *  trim it, and (unless it's empty or — when `skipHash` — a parameter-only `#1` token)
 *  emit the name with a location at its first non-space char. Backs labels/refs/bibitems. */
function extractBracedName(
  ctx: Ctx,
  re: RegExp,
  skipHash: boolean,
  emit: (name: string, location: SourceLocation) => void,
): void {
  for (const m of ctx.masked.matchAll(re)) {
    const braceIdx = m.index + m[0].length - 1
    const content = extractBraceContent(ctx.masked, braceIdx, ctx.groupEnds)
    if (!content) continue
    const trimmed = content.trim()
    if (!trimmed || (skipHash && trimmed.includes('#'))) continue
    emit(trimmed, locAt(ctx, nameStartOffset(braceIdx, content)))
  }
}

function extractLabels(ctx: Ctx, symbols: FileSymbols): void {
  extractBracedName(ctx, LABEL_RE, true, (name, location) =>
    symbols.labels.push({ name, location }),
  )
}

function extractRefs(ctx: Ctx, symbols: FileSymbols): void {
  extractBracedName(ctx, REF_RE, true, (name, location) =>
    symbols.labelRefs.push({ name, location }),
  )
}

function extractCitations(ctx: Ctx, symbols: FileSymbols): void {
  for (const m of ctx.masked.matchAll(CITE_RE)) {
    const braceIdx = m.index + m[0].length - 1
    const keys = extractBraceContent(ctx.masked, braceIdx, ctx.groupEnds)
    if (!keys) continue
    let cursor = braceIdx + 1
    for (const key of keys.split(',')) {
      const trimmed = key.trim()
      if (trimmed && !trimmed.includes('#')) {
        symbols.citations.push({
          key: trimmed,
          location: locAt(ctx, cursor + key.indexOf(trimmed)),
        })
      }
      cursor += key.length + 1 // +1 for the comma
    }
  }
}

function extractSections(ctx: Ctx, symbols: FileSymbols): void {
  const definitions = macroDefinitionSpans(ctx.masked)
  for (const m of ctx.masked.matchAll(SECTION_RE)) {
    if (definitions.some(([start, end]) => start <= m.index && m.index < end)) continue
    const title = extractBraceContent(ctx.masked, m.index + m[0].length - 1, ctx.groupEnds)
    if (title) {
      symbols.sections.push({ level: m[1] as SectionLevel, title, location: locAt(ctx, m.index) })
    }
  }
}

function pushCommandDef(
  ctx: Ctx,
  name: string,
  backslashOffset: number,
  symbols: FileSymbols,
  argCount?: string,
): void {
  const def: CommandDef = { name, location: locAt(ctx, backslashOffset + 1) }
  if (argCount) def.argCount = Number.parseInt(argCount, 10)
  symbols.commands.push(def)
}

function extractNewCommands(ctx: Ctx, symbols: FileSymbols): void {
  for (const m of ctx.masked.matchAll(NEWCOMMAND_RE)) {
    const name = m[1]!
    // Search past the defining keyword's own backslash (m.index) so a defined name that is
    // a prefix of that keyword (`\r` ⊂ `\renewcommand`) resolves to the macro, not the keyword.
    const nameIdx = ctx.masked.indexOf(`\\${name}`, m.index + 1)
    pushCommandDef(ctx, name, nameIdx, symbols, m[2])
  }
}

function extractDefs(ctx: Ctx, symbols: FileSymbols): void {
  for (const m of ctx.masked.matchAll(DEF_RE)) {
    const name = m[1]!
    pushCommandDef(ctx, name, ctx.masked.indexOf(`\\${name}`, m.index + 1), symbols)
  }
}

// Every `\command` token (records all call sites plus the name token inside a
// `\newcommand{\foo}` definition — the full set needed to rename / find-references a user
// command). Queries filter by name, so builtin tokens are harmless.
const COMMAND_USE_RE = new RegExp(COMMAND_TOKEN, 'g')
function extractCommandUses(ctx: Ctx, symbols: FileSymbols): void {
  for (const m of ctx.masked.matchAll(COMMAND_USE_RE)) {
    symbols.commandUses.push({ name: m[1]!, location: locAt(ctx, m.index + 1) })
  }
}

function extractDeclareMath(ctx: Ctx, symbols: FileSymbols): void {
  for (const m of ctx.masked.matchAll(DECLARE_MATH_RE)) {
    const name = m[1]!
    pushCommandDef(ctx, name, ctx.masked.indexOf(`\\${name}`, m.index + 1), symbols)
  }
}

function extractBibItems(ctx: Ctx, symbols: FileSymbols): void {
  for (const command of commandsNamed(ctx, BIBITEM_COMMANDS)) {
    const group = firstRequired(groupsAfterCommand(ctx, command))
    const key = group?.value.trim()
    if (group && key) {
      symbols.bibItems.push({
        key,
        location: locAt(ctx, group.contentStart + group.value.indexOf(key)),
      })
    }
  }
}

function extractEnvironments(ctx: Ctx, symbols: FileSymbols): void {
  for (const m of ctx.masked.matchAll(BEGIN_RE)) {
    const name = extractBraceContent(ctx.masked, m.index + m[0].length - 1, ctx.groupEnds)
    if (name) symbols.environments.push({ name, location: locAt(ctx, m.index) })
  }
}

function extractEnvironmentDefs(ctx: Ctx, symbols: FileSymbols): void {
  for (const command of commandsNamed(ctx, ENVIRONMENT_DEF_COMMANDS)) {
    const name = firstRequired(groupsAfterCommand(ctx, command))?.value.trim()
    if (name) symbols.environmentDefs.push({ name, location: locAt(ctx, command.start) })
  }
}

function extractIncludes(ctx: Ctx, symbols: FileSymbols): void {
  for (const m of ctx.masked.matchAll(INPUT_RE)) {
    const braceIdx = ctx.masked.indexOf('{', m.index + m[1]!.length + 1)
    if (braceIdx < 0) continue
    const path = extractBraceContent(ctx.masked, braceIdx, ctx.groupEnds)
    if (path) {
      symbols.includes.push({
        path,
        location: locAt(ctx, m.index),
        type: m[1] as 'input' | 'include' | 'subfile',
      })
    }
  }
}

function extractPackages(ctx: Ctx, symbols: FileSymbols): void {
  for (const m of ctx.masked.matchAll(USEPACKAGE_RE)) {
    const braceIdx = ctx.masked.indexOf('{', m.index + m[0].length - 1)
    if (braceIdx < 0) continue
    const names = extractBraceContent(ctx.masked, braceIdx, ctx.groupEnds)
    if (!names) continue
    const location = locAt(ctx, m.index)
    for (const pkg of names.split(',')) {
      const trimmed = pkg.trim()
      if (trimmed) symbols.packages.push({ name: trimmed, options: m[1] ?? '', location })
    }
  }
}

function extractClasses(ctx: Ctx, symbols: FileSymbols): void {
  for (const command of commandsNamed(ctx, CLASS_COMMANDS)) {
    const groups = groupsAfterCommand(ctx, command)
    const name = firstRequired(groups)?.value.trim()
    if (name) {
      const options =
        command.name === 'LoadClassWithOptions'
          ? ''
          : (groups.find((group) => group.delimiter === 'optional')?.value ?? '')
      symbols.classes.push({ name, options, location: locAt(ctx, command.start) })
    }
  }
}

function pushProjectValue(
  values: import('./types').ProjectValue[],
  ctx: Ctx,
  name: string,
  offset: number,
  role: import('./types').ProjectValueRole,
  target?: string,
): void {
  const trimmed = name.trim()
  if (!trimmed || /[#{}]/.test(trimmed)) return
  values.push({
    name: trimmed,
    role,
    location: locAt(ctx, offset),
    ...(target ? { target } : {}),
  })
}

function extractBibliographies(ctx: Ctx, symbols: FileSymbols): void {
  for (const command of commandsNamed(ctx, BIB_RESOURCE_COMMANDS)) {
    const group = firstRequired(groupsAfterCommand(ctx, command))
    if (!group) continue
    let cursor = group.contentStart
    for (const raw of command.name === 'bibliography' ? group.value.split(',') : [group.value]) {
      const path = raw.trim()
      if (path && !/[\\#{}]/.test(path)) {
        symbols.bibliographies.push({
          path,
          location: locAt(ctx, cursor + raw.indexOf(path)),
        })
      }
      cursor += raw.length + 1
    }
  }
}

function extractCounters(ctx: Ctx, symbols: FileSymbols): void {
  for (const match of ctx.masked.matchAll(COUNTER_RE)) {
    const brace = match.index + match[0].length - 1
    const name = extractBraceContent(ctx.masked, brace, ctx.groupEnds)
    if (name === null) continue
    pushProjectValue(
      symbols.counters,
      ctx,
      name,
      nameStartOffset(brace, name),
      match[1] === 'newcounter' || match[1] === 'providecounter' || match[1] === 'newaliascnt'
        ? 'definition'
        : 'usage',
    )
  }
}

function extractLengths(ctx: Ctx, symbols: FileSymbols): void {
  for (const match of ctx.masked.matchAll(LENGTH_DEF_RE)) {
    const name = match[2] ?? match[3]
    if (name)
      pushProjectValue(
        symbols.lengths,
        ctx,
        name,
        match.index + match[0].indexOf(name),
        'definition',
      )
  }
  for (const match of ctx.masked.matchAll(LENGTH_USE_RE)) {
    const name = match[2]
    if (name)
      pushProjectValue(symbols.lengths, ctx, name, match.index + match[0].indexOf(name), 'usage')
  }
}

function extractNamedBracedValues(
  ctx: Ctx,
  commands: ReadonlySet<string>,
  values: import('./types').ProjectValue[],
  role: import('./types').ProjectValueRole,
): void {
  for (const command of commandsNamed(ctx, commands)) {
    const group = firstRequired(groupsAfterCommand(ctx, command))
    if (group) pushProjectValue(values, ctx, group.value, groupValueStart(group), role)
  }
}

function extractGlossaryEntries(ctx: Ctx, symbols: FileSymbols): void {
  extractNamedBracedValues(ctx, GLOSSARY_DEF_COMMANDS, symbols.glossaryEntries, 'definition')
  extractNamedBracedValues(ctx, GLOSSARY_USE_COMMANDS, symbols.glossaryEntries, 'usage')
  extractNamedBracedValues(ctx, ACRONYM_DEF_COMMANDS, symbols.acronymEntries, 'definition')
  extractNamedBracedValues(ctx, ACRONYM_USE_COMMANDS, symbols.acronymEntries, 'usage')
}

function readControlSequence(
  text: string,
  start: number,
): { value: string; start: number; end: number } | null {
  if (text[start] !== '\\') return null
  let end = start + 1
  while (isCommandNameChar(text[end])) end++
  return end === start + 1 ? null : { value: text.slice(start, end), start, end }
}

function readFontAlias(
  ctx: Ctx,
  command: CommandOccurrence,
): { value: string; end: number } | null {
  const afterStar = ctx.masked[command.end] === '*' ? command.end + 1 : command.end
  const cursor = skipSpace(ctx.masked, afterStar)
  if (ctx.masked[cursor] !== '{') return readControlSequence(ctx.masked, cursor)
  const end = ctx.groupEnds.get(cursor)
  if (end === undefined) return null
  const value = ctx.masked.slice(cursor + 1, end).trim()
  return value ? { value, end: end + 1 } : null
}

function extractFontAliases(ctx: Ctx, symbols: FileSymbols): void {
  for (const command of commandsNamed(ctx, FONT_ALIAS_COMMANDS)) {
    const alias = readFontAlias(ctx, command)
    if (!alias) continue
    const family = firstRequired(invocationGroups(ctx.masked, alias.end, ctx.groupEnds))
    if (!family) continue
    pushProjectValue(
      symbols.fontFamilies,
      ctx,
      family.value,
      groupValueStart(family),
      'alias',
      alias.value,
    )
  }
}

function extractDeclaredFontFamilies(ctx: Ctx, symbols: FileSymbols): void {
  for (const command of commandsNamed(ctx, FONT_FAMILY_COMMANDS)) {
    const required = groupsAfterCommand(ctx, command).filter(
      (group) => group.delimiter === 'required',
    )
    const family = required[1]
    if (family)
      pushProjectValue(
        symbols.fontFamilies,
        ctx,
        family.value,
        groupValueStart(family),
        'definition',
      )
  }
}

function extractFontFamilies(ctx: Ctx, symbols: FileSymbols): void {
  extractNamedBracedValues(ctx, FONT_USE_COMMANDS, symbols.fontFamilies, 'usage')
  extractFontAliases(ctx, symbols)
  extractDeclaredFontFamilies(ctx, symbols)
}

interface ParsedInvocationGroup {
  delimiter: 'required' | 'optional'
  value: string
  contentStart: number
  end: number
}

function indexedInvocationGroup(
  text: string,
  start: number,
  groupEnds: GroupEndIndex,
): ParsedInvocationGroup | null {
  const open = text[start]
  if (open !== '{' && open !== '[') return null
  const end = groupEnds.get(start)
  return end === undefined
    ? null
    : {
        delimiter: open === '{' ? 'required' : 'optional',
        value: text.slice(start + 1, end),
        contentStart: start + 1,
        end: end + 1,
      }
}

function scanInvocationGroup(text: string, start: number): ParsedInvocationGroup | null {
  const open = text[start]
  if (open !== '{' && open !== '[') return null
  const close = open === '{' ? '}' : ']'
  let depth = 1
  for (let cursor = start + 1; cursor < text.length; cursor++) {
    if (text[cursor] === '\\') {
      cursor++
      continue
    }
    if (text[cursor] === open) depth++
    else if (text[cursor] === close && --depth === 0) {
      return {
        delimiter: open === '{' ? 'required' : 'optional',
        value: text.slice(start + 1, cursor),
        contentStart: start + 1,
        end: cursor + 1,
      }
    }
  }
  return null
}

function readInvocationGroup(
  text: string,
  start: number,
  groupEnds?: GroupEndIndex,
): ParsedInvocationGroup | null {
  return groupEnds
    ? indexedInvocationGroup(text, start, groupEnds)
    : scanInvocationGroup(text, start)
}

function invocationGroups(
  text: string,
  start: number,
  groupEnds?: GroupEndIndex,
): ParsedInvocationGroup[] {
  const groups: ParsedInvocationGroup[] = []
  let cursor = start
  while (groups.length < 6) {
    cursor = skipSpace(text, cursor)
    const group = readInvocationGroup(text, cursor, groupEnds)
    if (!group) break
    groups.push(group)
    cursor = group.end
  }
  return groups
}

function splitColorSet(value: string): string[] {
  const result: string[] = []
  let depth = 0
  let start = 0
  for (let cursor = 0; cursor < value.length; cursor++) {
    if (value[cursor] === '\\') cursor++
    else if (value[cursor] === '{') depth++
    else if (value[cursor] === '}') depth = Math.max(0, depth - 1)
    else if (value[cursor] === ';' && depth === 0) {
      result.push(value.slice(start, cursor))
      start = cursor + 1
    }
  }
  result.push(value.slice(start))
  return result
}

function splitTopLevel(value: string, separator = ','): string[] {
  const result: string[] = []
  const stack: string[] = []
  let start = 0
  for (let cursor = 0; cursor < value.length; cursor++) {
    const ch = value[cursor]!
    if (ch === '\\') cursor++
    else if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === stack[stack.length - 1]) stack.pop()
    else if (stack.length === 0 && ch === separator) {
      result.push(value.slice(start, cursor))
      start = cursor + 1
    }
  }
  result.push(value.slice(start))
  return result
}

function pushColor(
  symbols: FileSymbols,
  ctx: Ctx,
  name: string,
  offset: number,
  definition: Omit<import('./types').ColorDefinition, 'name' | 'location'>,
): void {
  const trimmed = name.trim()
  if (!trimmed || /[\\#{}]/.test(trimmed)) return
  symbols.colors.push({ name: trimmed, location: locAt(ctx, offset), ...definition })
}

function extractColorSet(
  ctx: Ctx,
  symbols: FileSymbols,
  groups: ParsedInvocationGroup[],
  kind: 'define' | 'provide',
): void {
  const required = groups.filter((group) => group.delimiter === 'required')
  if (required.length < 4) return
  const models = required[0]!.value.split('/')
  const prefix = required[1]!.value
  const suffix = required[2]!.value
  for (const entry of splitColorSet(required[3]!.value)) {
    const comma = entry.indexOf(',')
    if (comma < 0) continue
    const specs = entry
      .slice(comma + 1)
      .trim()
      .split('/')
    const model = models[0]?.trim()
    const colorValue = specs[0]?.trim()
    pushColor(
      symbols,
      ctx,
      `${prefix}${entry.slice(0, comma).trim()}${suffix}`,
      required[3]!.contentStart,
      {
        kind,
        ...(model ? { model } : {}),
        ...(colorValue ? { value: colorValue } : {}),
      },
    )
  }
}

function extractNamedColor(
  ctx: Ctx,
  symbols: FileSymbols,
  required: ParsedInvocationGroup[],
): void {
  if (required.length < 4) return
  pushColor(symbols, ctx, required[1]!.value, required[1]!.contentStart, {
    kind: 'define',
    model: required[2]!.value.trim(),
    value: required[3]!.value.trim(),
  })
}

function extractColorAlias(
  ctx: Ctx,
  symbols: FileSymbols,
  required: ParsedInvocationGroup[],
): void {
  if (required.length < 2) return
  pushColor(symbols, ctx, required[0]!.value, required[0]!.contentStart, {
    kind: 'alias',
    alias: required[1]!.value.trim(),
  })
}

function extractDirectColor(
  ctx: Ctx,
  symbols: FileSymbols,
  command: string,
  required: ParsedInvocationGroup[],
): void {
  if (required.length < 3) return
  pushColor(symbols, ctx, required[0]!.value, required[0]!.contentStart, {
    kind: command === 'providecolor' ? 'provide' : 'define',
    model: required[1]!.value.trim(),
    value: required[2]!.value.trim(),
  })
}

function extractColors(ctx: Ctx, symbols: FileSymbols): void {
  for (const match of ctx.masked.matchAll(COLOR_DECL_RE)) {
    const command = match[1]!
    const groups = invocationGroups(ctx.masked, match.index + match[0].length, ctx.groupEnds)
    const required = groups.filter((group) => group.delimiter === 'required')
    if (command.endsWith('colorset')) {
      extractColorSet(ctx, symbols, groups, command === 'providecolorset' ? 'provide' : 'define')
    } else if (command === 'DefineNamedColor') {
      extractNamedColor(ctx, symbols, required)
    } else if (command === 'colorlet') {
      extractColorAlias(ctx, symbols, required)
    } else {
      extractDirectColor(ctx, symbols, command, required)
    }
  }
}

function extractColorActivations(ctx: Ctx, symbols: FileSymbols): void {
  for (const match of ctx.masked.matchAll(COLOR_ACTIVATION_RE)) {
    const brace = match.index + match[0].length - 1
    const value = extractBraceContent(ctx.masked, brace, ctx.groupEnds)
    if (value === null) continue
    const names = value
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0 && !/[\\#{}]/.test(name))
    if (names.length > 0) {
      symbols.colorActivations.push({
        names,
        kind: match[1] === 'providecolors' ? 'provide' : 'define',
        location: locAt(ctx, match.index),
      })
    }
  }
}

function stripOuterSlashes(value: string): string {
  const trimmed = value.trim()
  let start = 0
  let end = trimmed.length
  while (trimmed[start] === '/') start++
  while (end > start && trimmed[end - 1] === '/') end--
  return trimmed.slice(start, end)
}

function normalizeKeyFamily(value: string): string {
  return stripOuterSlashes(value) || 'document'
}

function pushProjectKey(
  symbols: FileSymbols,
  ctx: Ctx,
  family: string,
  name: string,
  valueType: import('./types').ProjectKeyValueType,
  offset: number,
  values?: string[],
): void {
  const normalizedName = stripOuterSlashes(name)
  if (!normalizedName || /[\\#{}]/.test(normalizedName)) return
  symbols.keys.push({
    family: normalizeKeyFamily(family),
    name: normalizedName,
    valueType,
    location: locAt(ctx, offset),
    ...(values?.length ? { values: [...new Set(values)] } : {}),
  })
}

function extractXkeyvalKeys(ctx: Ctx, symbols: FileSymbols): void {
  for (const command of commandsNamed(ctx, XKEYVAL_DECL_COMMANDS)) {
    const groups = groupsAfterCommand(ctx, command)
    const required = groups.filter((group) => group.delimiter === 'required')
    if (required.length < 2) continue
    const family = required[0]!.value
    const key = required[1]!.value
    const type = command.name.includes('choice')
      ? 'enum'
      : command.name === 'defineboolkey'
        ? 'boolean'
        : 'free-text'
    const values =
      type === 'enum'
        ? required
            .slice(2)
            .map((group) =>
              splitTopLevel(group.value)
                .map((value) => value.trim())
                .filter(Boolean),
            )
            .find((candidate) => candidate.length > 0)
        : undefined
    pushProjectKey(symbols, ctx, family, key, type, required[1]!.contentStart, values)
  }
}

function declaredKeyType(property: string): import('./types').ProjectKeyValueType {
  if (/choice|choices/.test(property)) return 'enum'
  if (/bool/.test(property)) return 'boolean'
  if (/(?:int|fp)_set/.test(property)) return 'number'
  if (/dim_set/.test(property)) return 'dimension'
  if (/code|meta|store|tl_set|initial/.test(property)) return 'free-text'
  return 'flag'
}

interface KeyDeclaration {
  family: string
  name: string
  type: import('./types').ProjectKeyValueType
  offset: number
}

function declarationHead(segment: string): { name: string; property: string } | null {
  const equals = segment.indexOf('=')
  const lhs = segment.slice(0, equals < 0 ? segment.length : equals).trim()
  const match = lhs.match(/^(.+?)\s+\.([A-Za-z0-9_:]+)\s*$/)
  return match ? { name: match[1]!.trim(), property: match[2]! } : null
}

function collectDeclareKey(
  declarations: KeyDeclaration[],
  choices: Map<string, string[]>,
  segment: string,
  family: string,
  offset: number,
): void {
  const head = declarationHead(segment)
  if (!head) return
  declarations.push({ family, name: head.name, type: declaredKeyType(head.property), offset })
  const slash = head.name.lastIndexOf('/')
  if (slash <= 0) return
  const parent = head.name.slice(0, slash).trim()
  const values = choices.get(parent) ?? []
  values.push(head.name.slice(slash + 1).trim())
  choices.set(parent, values)
}

function indexKeyDeclarations(
  ctx: Ctx,
  symbols: FileSymbols,
  declarations: KeyDeclaration[],
  choices: Map<string, string[]>,
): void {
  for (const declaration of declarations) {
    pushProjectKey(
      symbols,
      ctx,
      declaration.family,
      declaration.name,
      declaration.type,
      declaration.offset,
      declaration.type === 'enum'
        ? (choices.get(`${declaration.family}\u0000${declaration.name}`) ??
            choices.get(declaration.name))
        : undefined,
    )
  }
}

function extractDeclareKeys(ctx: Ctx, symbols: FileSymbols): void {
  for (const command of commandsNamed(ctx, DECLARE_KEYS_COMMANDS)) {
    const groups = groupsAfterCommand(ctx, command)
    const contentGroup = firstRequired(groups)
    if (!contentGroup) continue
    const family = normalizeKeyFamily(
      groups.find((group) => group.delimiter === 'optional')?.value ?? 'document',
    )
    const declarations: KeyDeclaration[] = []
    const choices = new Map<string, string[]>()
    let cursor = 0
    for (const segment of splitTopLevel(contentGroup.value)) {
      collectDeclareKey(declarations, choices, segment, family, contentGroup.contentStart + cursor)
      cursor += segment.length + 1
    }
    indexKeyDeclarations(ctx, symbols, declarations, choices)
  }
}

interface PgfKeyState {
  family: string
  declarations: KeyDeclaration[]
  choices: Map<string, string[]>
  enumKeys: Set<string>
}

function pgfKeyId(family: string, name: string): string {
  return `${normalizeKeyFamily(family)}\u0000${name}`
}

function addPgfChoiceValue(state: PgfKeyState, family: string, name: string): boolean {
  const slash = family.lastIndexOf('/')
  if (slash < 0) return false
  const parentFamily = family.slice(0, slash)
  const parentName = family.slice(slash + 1)
  const id = pgfKeyId(parentFamily, parentName)
  if (!state.enumKeys.has(id)) return false
  const values = state.choices.get(id) ?? []
  values.push(name)
  state.choices.set(id, values)
  return true
}

function collectPgfKey(state: PgfKeyState, segment: string, offset: number): void {
  const equals = segment.indexOf('=')
  const lhs = segment.slice(0, equals < 0 ? segment.length : equals).trim()
  const property = lhs.lastIndexOf('/.')
  if (property < 0) return
  const rawPathWithRoot = lhs.slice(0, property)
  const absolute = rawPathWithRoot.startsWith('/')
  const rawPath = stripOuterSlashes(rawPathWithRoot)
  const prop = lhs.slice(property + 2)
  if (prop === 'cd' || prop === 'is family') {
    state.family = normalizeKeyFamily(rawPath)
    return
  }
  const slash = rawPath.lastIndexOf('/')
  const nestedFamily = slash < 0 ? '' : normalizeKeyFamily(rawPath.slice(0, slash))
  const family =
    slash < 0
      ? state.family
      : normalizeKeyFamily(absolute ? nestedFamily : `${state.family}/${nestedFamily}`)
  const name = slash < 0 ? rawPath : rawPath.slice(slash + 1)
  if (!name) return
  if (/is choice/.test(prop)) {
    state.enumKeys.add(pgfKeyId(family, name))
    state.declarations.push({ family, name, type: 'enum', offset })
  } else if (!addPgfChoiceValue(state, family, name)) {
    state.declarations.push({ family, name, type: declaredKeyType(prop), offset })
  }
}

function extractPgfKeys(ctx: Ctx, symbols: FileSymbols): void {
  for (const match of ctx.masked.matchAll(PGF_KEYS_RE)) {
    const brace = match.index + match[0].length - 1
    const content = extractBraceContent(ctx.masked, brace, ctx.groupEnds)
    if (content === null) continue
    const state: PgfKeyState = {
      family: 'pgfkeys',
      declarations: [],
      choices: new Map(),
      enumKeys: new Set(),
    }
    let cursor = 0
    for (const segment of splitTopLevel(content)) {
      collectPgfKey(state, segment.trim(), brace + 1 + cursor)
      cursor += segment.length + 1
    }
    indexKeyDeclarations(ctx, symbols, state.declarations, state.choices)
  }
}

function extractProjectKeys(ctx: Ctx, symbols: FileSymbols): void {
  extractXkeyvalKeys(ctx, symbols)
  extractDeclareKeys(ctx, symbols)
  extractPgfKeys(ctx, symbols)
}

// --- Macro shallow expansion -------------------------------------------------

export interface UserMacroDefinition {
  argCount: number
  body: string
  /** Default value of the leading optional argument (`\newcommand{\m}[n][default]{…}`),
   *  or undefined when the macro has no optional argument. When set, `#1` is optional. */
  optional?: string | undefined
}

export interface UserMacroArgument {
  index: number
  kind: 'required' | 'optional'
  value: string
  inputStart: number
  inputEnd: number
}

const MACRO_NEWCMD_RE = new RegExp(
  `\\\\(?:${NEWCMD_CMDS})\\*?\\{\\\\(\\w+)\\}(?:\\[(\\d+)\\])?(?:\\[([^\\]]*)\\])?\\s*\\{`,
  'g',
)
const MACRO_DEF_RE = /\\def\\(\w+)((?:#\d)*)\s*\{/g
const MACRO_OPERATOR_RE = /\\DeclareMathOperator(\*)?\{\\(\w+)\}\s*\{/g

// A definition's name and replacement text are templates, not executed structure.
// Keep this separate from calledMacroBodySpans: section/environment scopes must
// exclude uncalled templates too, while label navigation has its own call policy.
const MACRO_SCOPE_RE = new RegExp(
  String.raw`\\(?:${NEWCMD_CMDS})\*?\s*(?:\{\s*\\[\w@]+\s*\}|\\[\w@]+)\s*(?:\[\d+\]\s*)?(?:\[[^\]]*\]\s*)?\{`,
  'g',
)
const DEF_SCOPE_RE = /\\(?:def|gdef|edef|xdef)\s*\\[\w@]+[^{}]*\{/g

function macroDefinitionSpans(masked: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  const ends = indexGroupEnds(masked)
  for (const pattern of [MACRO_SCOPE_RE, DEF_SCOPE_RE]) {
    for (const match of masked.matchAll(pattern)) {
      const open = match.index + match[0].length - 1
      const body = extractBraceContent(masked, open, ends)
      spans.push([match.index, body === null ? masked.length : open + body.length + 2])
    }
  }
  return spans
}

/** Reuses the owning token stream to ignore comments and verbatim text. */
export function macroDefinitionSpansFromTokens(
  content: string,
  tokens: readonly Token[],
): Array<[number, number]> {
  return macroDefinitionSpans(maskContent(content, [...tokens]))
}

/** Collect user macro definitions (\newcommand / \def / \DeclareMathOperator). */
function collectMacros(masked: string): Map<string, UserMacroDefinition> {
  const macros = new Map<string, UserMacroDefinition>()
  for (const m of masked.matchAll(MACRO_NEWCMD_RE)) {
    const braceIdx = m.index + m[0].length - 1
    const body = extractBraceContent(masked, braceIdx)
    if (body !== null)
      macros.set(m[1]!, {
        argCount: m[2] ? Number.parseInt(m[2], 10) : 0,
        body,
        optional: m[3],
      })
  }
  for (const m of masked.matchAll(MACRO_DEF_RE)) {
    const braceIdx = m.index + m[0].length - 1
    const body = extractBraceContent(masked, braceIdx)
    if (body !== null) {
      macros.set(m[1]!, { argCount: (m[2]!.match(/#/g) || []).length, body })
    }
  }
  for (const m of masked.matchAll(MACRO_OPERATOR_RE)) {
    const braceIdx = m.index + m[0].length - 1
    const surface = extractBraceContent(masked, braceIdx)
    if (surface !== null) {
      macros.set(m[2]!, {
        argCount: 0,
        body: `\\operatorname${m[1] ?? ''}{${surface}}`,
      })
    }
  }
  return macros
}

// Derived from the canonical REF_CMDS/CITE_CMDS alternation strings (the single source of
// truth in latex-patterns.ts) so this gate cannot drift from the downstream collectExpanded
// extractors (which use the full REF_RE/CITE_RE). Hardcoding here previously dropped biblatex
// cite families (parencite/textcite/autocite/nocite) wrapped by user macros.
const EXPANDABLE_RE = new RegExp(`\\\\(?:label|${REF_CMDS}|${CITE_CMDS})\\b`)

/** Macros whose (transitively expanded) body can produce a label/ref/cite. */
function interestingMacros(macros: Map<string, UserMacroDefinition>): Set<string> {
  const interesting = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const [name, def] of macros) {
      if (interesting.has(name)) continue
      if (EXPANDABLE_RE.test(def.body) || callsInteresting(def.body, macros, interesting)) {
        interesting.add(name)
        changed = true
      }
    }
  }
  return interesting
}

function callsInteresting(
  body: string,
  macros: Map<string, UserMacroDefinition>,
  interesting: Set<string>,
): boolean {
  for (const m of body.matchAll(/\\(\w+)/g)) {
    if (interesting.has(m[1]!) && macros.has(m[1]!)) return true
  }
  return false
}

const skipSpace = (text: string, i: number): number => {
  while (i < text.length && /\s/.test(text[i]!)) i++
  return i
}

/** Consume the leading optional `[..]` argument for `#1` if present, else fill it with the
 *  declared `default`. Returns the arg value and the offset just past it. */
function readOptionalArg(
  text: string,
  pos: number,
  def: string,
): { value: string; end: number; argument?: UserMacroArgument } {
  const j = skipSpace(text, pos)
  const close = text[j] === '[' ? text.indexOf(']', j) : -1
  return close !== -1
    ? {
        value: text.slice(j + 1, close),
        end: close + 1,
        argument: {
          index: 0,
          kind: 'optional',
          value: text.slice(j + 1, close),
          inputStart: j,
          inputEnd: close + 1,
        },
      }
    : { value: def, end: pos }
}

/** Read up to `n` arguments starting at `pos`; returns args + end offset. When `optional`
 *  is set (a `\newcommand` optional-argument default), `#1` is consumed from a leading
 *  `[..]` group if present, otherwise filled with the default — so the remaining `{..}`
 *  groups map to `#2..#n` instead of shifting onto `#1`. */
function readArgs(
  text: string,
  pos: number,
  n: number,
  optional?: string,
): { args: string[]; arguments: UserMacroArgument[]; end: number } {
  const args: string[] = []
  const arguments_: UserMacroArgument[] = []
  let i = pos
  if (optional !== undefined && n > 0) {
    const opt = readOptionalArg(text, i, optional)
    args.push(opt.value)
    if (opt.argument) arguments_.push(opt.argument)
    i = opt.end
  }
  while (args.length < n) {
    i = skipSpace(text, i)
    if (text[i] !== '{') break
    const inputStart = i
    const content = extractBraceContent(text, i)
    if (content === null) break
    const index = args.length
    args.push(content)
    i += content.length + 2 // skip { content }
    arguments_.push({
      index,
      kind: 'required',
      value: content,
      inputStart,
      inputEnd: i,
    })
  }
  return { args, arguments: arguments_, end: i }
}

const MAX_EXPANSION_DEPTH = 4

/** Expand a macro call into its body with arguments substituted (bounded, cycle-guarded). */
function expandCall(
  name: string,
  args: string[],
  macros: Map<string, UserMacroDefinition>,
  depth: number,
  seen: Set<string>,
): string {
  const def = macros.get(name)
  if (!def || depth > MAX_EXPANSION_DEPTH || seen.has(name)) return ''
  const body = def.body.replace(/#(\d)/g, (_, d) => args[Number(d) - 1] ?? '')
  return expandMacroSurface(body, macros, depth, new Set([...seen, name]))
}

function expandMacroSurface(
  surface: string,
  macros: Map<string, UserMacroDefinition>,
  depth: number,
  seen: ReadonlySet<string>,
): string {
  let cursor = 0
  let expanded = ''
  for (const match of surface.matchAll(/\\(\w+)/g)) {
    const callName = match[1]!
    const nestedDef = macros.get(callName)
    if (!nestedDef) continue
    const { args: nestedArgs } = readArgs(
      surface,
      match.index + match[0].length,
      nestedDef.argCount,
      nestedDef.optional,
    )
    const replacement = expandCall(callName, nestedArgs, macros, depth + 1, new Set(seen))
    expanded += surface.slice(cursor, match.index)
    expanded += replacement || surface.slice(match.index, match.index + match[0].length)
    cursor = readArgs(
      surface,
      match.index + match[0].length,
      nestedDef.argCount,
      nestedDef.optional,
    ).end
  }
  return expanded + surface.slice(cursor)
}

/** Extract labels/refs/cites that user macros generate, attributed to call sites. */
/** The `\name` token at its own `\newcommand{\name}…` / `\def\name…` definition. */
const MACRO_DEF_PREFIX_RE = new RegExp(
  `(?:\\\\(?:${NEWCMD_CMDS}|DeclareMathOperator)\\*?\\{|\\\\def)$`,
)
function isMacroDefinitionSite(masked: string, idx: number): boolean {
  return MACRO_DEF_PREFIX_RE.test(masked.slice(Math.max(0, idx - 24), idx))
}

/**
 * Body spans of interesting user macros that are actually *called* somewhere.
 *
 * Such a body is a template: when the macro is invoked, {@link extractMacroExpansions}
 * emits its label/ref/cite symbols at each call site. The literal extractors would
 * *also* pick the symbol up at the definition, double-counting it (e.g. a duplicate
 * `\label` → false "duplicate label" diagnostics). Blanking the called macros' bodies
 * before the literal extractors run leaves the call-site expansions as the sole source.
 * A macro that is defined but never called is left intact, so its body literal is still
 * indexed once (there is no call site to attribute it to).
 */
function calledMacroBodySpans(masked: string): Array<[number, number]> {
  const macros = collectMacros(masked)
  if (macros.size === 0) return []
  const interesting = interestingMacros(macros)
  if (interesting.size === 0) return []

  const called = new Set<string>()
  for (const m of masked.matchAll(/\\(\w+)/g)) {
    const name = m[1]!
    if (interesting.has(name) && !isMacroDefinitionSite(masked, m.index)) called.add(name)
  }
  if (called.size === 0) return []

  const spans: Array<[number, number]> = []
  const scan = (re: RegExp) => {
    for (const m of masked.matchAll(re)) {
      if (!called.has(m[1]!)) continue
      const braceIdx = m.index + m[0].length - 1
      const body = extractBraceContent(masked, braceIdx)
      if (body === null) continue
      spans.push([braceIdx + 1, braceIdx + 1 + body.length])
    }
  }
  scan(MACRO_NEWCMD_RE)
  scan(MACRO_DEF_RE)
  return spans
}

function extractMacroExpansions(ctx: Ctx, symbols: FileSymbols): void {
  const macros = collectMacros(ctx.masked)
  if (macros.size === 0) return
  const interesting = interestingMacros(macros)
  if (interesting.size === 0) return

  const callRe = /\\(\w+)/g
  for (const m of ctx.masked.matchAll(callRe)) {
    const name = m[1]!
    if (!interesting.has(name)) continue
    // Skip the macro token sitting inside its own definition — that's the
    // template, not a call; only real call sites should generate symbols.
    if (isMacroDefinitionSite(ctx.masked, m.index)) continue
    const def = macros.get(name)!
    const { args } = readArgs(ctx.masked, m.index + m[0].length, def.argCount, def.optional)
    const expanded = expandCall(name, args, macros, 0, new Set())
    if (!expanded) continue
    const location = locAt(ctx, m.index)
    collectExpanded(expanded, location, symbols)
  }
}

export interface UserMacroExpansion {
  name: string
  inputStart: number
  inputEnd: number
  surface: string
  arguments: readonly UserMacroArgument[]
}

export function collectUserMacroDefinitions(
  sources: readonly string[],
): ReadonlyMap<string, UserMacroDefinition> {
  const definitions = new Map<string, UserMacroDefinition>()
  for (const source of sources) {
    for (const [name, definition] of collectMacros(source)) definitions.set(name, definition)
  }
  return definitions
}

/**
 * Expand every concrete user-macro invocation in a document.
 *
 * This is the structural handoff used by semantic consumers. It deliberately
 * returns source ranges alongside generated text: diagnostics and edits remain
 * anchored to the invocation, never to synthetic expansion text.
 */
export function expandUserMacroCalls(
  source: string,
  projectDefinitions: ReadonlyMap<string, UserMacroDefinition> = new Map(),
): readonly UserMacroExpansion[] {
  const macros = new Map(projectDefinitions)
  for (const [name, definition] of collectMacros(source)) macros.set(name, definition)
  if (macros.size === 0) return []

  const expansions: UserMacroExpansion[] = []
  for (const match of source.matchAll(/\\(\w+)/g)) {
    const name = match[1]!
    const definition = macros.get(name)
    if (!definition || isMacroDefinitionSite(source, match.index)) continue
    const invocation = readArgs(
      source,
      match.index + match[0].length,
      definition.argCount,
      definition.optional,
    )
    if (invocation.args.length !== definition.argCount) continue
    const surface = expandCall(name, invocation.args, macros, 0, new Set())
    if (!surface) continue
    expansions.push({
      name,
      inputStart: match.index,
      inputEnd: invocation.end,
      surface,
      arguments: invocation.arguments,
    })
  }
  return expansions
}

/** A non-empty symbol name that is not a bare parameter placeholder. */
function indexableName(content: string | null | undefined): string | null {
  const trimmed = content?.trim()
  return trimmed && !trimmed.includes('#') ? trimmed : null
}

function collectExpanded(expanded: string, location: SourceLocation, symbols: FileSymbols): void {
  for (const lm of expanded.matchAll(LABEL_RE)) {
    const name = indexableName(extractBraceContent(expanded, lm.index + lm[0].length - 1))
    if (name) symbols.labels.push({ name, location })
  }
  // REF_RE/CITE_RE are global and `matchAll` reads from a clone, so reusing them here is
  // safe — no per-call-site RegExp construction (LABEL_RE above is reused the same way).
  for (const rm of expanded.matchAll(REF_RE)) {
    const name = indexableName(extractBraceContent(expanded, rm.index + rm[0].length - 1))
    if (name) symbols.labelRefs.push({ name, location })
  }
  for (const cm of expanded.matchAll(CITE_RE)) {
    const keys = extractBraceContent(expanded, cm.index + cm[0].length - 1)
    for (const key of keys?.split(',') ?? []) {
      const trimmed = indexableName(key)
      if (trimmed) symbols.citations.push({ key: trimmed, location })
    }
  }
}

// --- Entry point -------------------------------------------------------------

/**
 * Parse a LaTeX file into a flat {@link FileSymbols} record.
 *
 * Tokenizes the source, masks regions that must not be interpreted (comments,
 * inline `\verb`, verbatim environments, false `\iffalse`/`\iftrue` branches),
 * then extracts labels, refs, citations, sections, command/environment
 * definitions, includes, packages, and bib items over the whole (masked) text —
 * so multi-line arguments work and commented/verbatim content is ignored.
 * User macros that wrap `\label`/`\ref`/`\cite` are shallow-expanded so the
 * symbols they generate are indexed at their call sites.
 */
export function parseLatexFile(
  content: string,
  filePath: string,
  tokens: readonly Token[] = tokenize(content),
): FileSymbols {
  const symbols: FileSymbols = {
    labels: [],
    labelRefs: [],
    citations: [],
    sections: [],
    commands: [],
    commandUses: [],
    environments: [],
    environmentDefs: [],
    includes: [],
    classes: [],
    packages: [],
    colors: [],
    colorActivations: [],
    counters: [],
    lengths: [],
    glossaryEntries: [],
    acronymEntries: [],
    fontFamilies: [],
    keys: [],
    bibliographies: [],
    bibItems: [],
  }

  const masked = maskContent(content, [...tokens])
  const ctx: Ctx = {
    masked,
    lineStarts: buildLineStarts(masked),
    file: filePath,
    groupEnds: indexGroupEnds(masked),
    commandOccurrences: scanCommandOccurrences(masked),
  }

  // The literal label/ref/cite extractors must not see symbols inside the body of a
  // *called* user macro — those are emitted at call sites by extractMacroExpansions.
  // Blanking preserves length/newlines, so lineStarts stays valid for the same ctx.
  const literalMasked = blankSpans(masked, calledMacroBodySpans(masked))
  const literalCtx: Ctx = {
    ...ctx,
    masked: literalMasked,
    groupEnds: indexGroupEnds(literalMasked),
    commandOccurrences: scanCommandOccurrences(literalMasked),
  }

  extractLabels(literalCtx, symbols)
  extractRefs(literalCtx, symbols)
  extractCitations(literalCtx, symbols)
  extractSections(ctx, symbols)
  extractNewCommands(ctx, symbols)
  extractDefs(ctx, symbols)
  extractDeclareMath(ctx, symbols)
  extractCommandUses(ctx, symbols)
  extractBibItems(ctx, symbols)
  extractEnvironments(ctx, symbols)
  extractEnvironmentDefs(ctx, symbols)
  extractIncludes(ctx, symbols)
  extractClasses(ctx, symbols)
  extractPackages(ctx, symbols)
  extractColors(ctx, symbols)
  extractColorActivations(ctx, symbols)
  extractCounters(ctx, symbols)
  extractLengths(ctx, symbols)
  extractGlossaryEntries(ctx, symbols)
  extractFontFamilies(ctx, symbols)
  extractProjectKeys(ctx, symbols)
  extractBibliographies(ctx, symbols)
  extractMacroExpansions(ctx, symbols)

  return symbols
}
