/**
 * Editor-neutral provider cores (no Monaco import). These hold the actual
 * completion/hover/definition/reference logic; the Monaco adapter and the LSP
 * server are thin wrappers that convert these neutral results.
 */
import type { VirtualFS } from '../fs/virtual-fs'
import { formatReference } from './bib-parser'
import {
  COMMON_PACKAGES,
  getCommandByName,
  getEnvironmentByName,
  LATEX_COMMANDS,
  LATEX_ENVIRONMENTS,
} from './latex-commands'
import { CITE_CMDS, COMMAND_TOKEN, INPUT_CMDS, REF_CMDS, USEPACKAGE_CMDS } from './latex-patterns'
import { formatSignature, getShardEnvironments, parseSignature } from './package-db'
import type { EngineCommandInfo, Occurrence, ProjectIndex } from './project-index'
import type {
  NeutralCompletionItem,
  NeutralDocument,
  NeutralHover,
  NeutralLocation,
  NeutralPosition,
} from './protocol'
import { buildLineStarts, offsetToLineCol } from './source-position'

// --- Completion context ------------------------------------------------------

type CompletionContextType = 'command' | 'ref' | 'cite' | 'begin' | 'end' | 'usepackage' | 'include'

interface CompletionContext {
  type: CompletionContextType
  prefix: string
}

/** Detect what kind of completion the cursor is in (editor-neutral). */
export function detectCompletionContext(
  lineContent: string,
  column: number,
): CompletionContext | null {
  const before = lineContent.slice(0, column - 1)
  // Trim leading whitespace from each braced argument: consumers filter with
  // name.startsWith(prefix), so a stray space after the `{` (e.g. "\ref{ fig") would
  // otherwise yield zero suggestions and an inflated replace range.
  const refMatch = before.match(new RegExp(`\\\\(?:${REF_CMDS})\\{([^}]*)$`))
  if (refMatch) {
    // \cref/\Cref take a comma-separated label list; complete only the segment under the
    // cursor (mirrors the cite/usepackage branches), else "fig:a,fig:" matches no label.
    const inner = refMatch[1]!
    const lastComma = inner.lastIndexOf(',')
    return {
      type: 'ref',
      prefix: lastComma >= 0 ? inner.slice(lastComma + 1).trim() : inner.trimStart(),
    }
  }

  const citeMatch = before.match(new RegExp(`\\\\(?:${CITE_CMDS})(?:\\[.*?\\])?\\{([^}]*)$`))
  if (citeMatch) {
    const inner = citeMatch[1]!
    const lastComma = inner.lastIndexOf(',')
    return {
      type: 'cite',
      prefix: lastComma >= 0 ? inner.slice(lastComma + 1).trim() : inner.trimStart(),
    }
  }
  const beginMatch = before.match(/\\begin\{([^}]*)$/)
  if (beginMatch) return { type: 'begin', prefix: beginMatch[1]!.trimStart() }
  const endMatch = before.match(/\\end\{([^}]*)$/)
  if (endMatch) return { type: 'end', prefix: endMatch[1]!.trimStart() }
  const pkgMatch = before.match(new RegExp(`\\\\(?:${USEPACKAGE_CMDS})(?:\\[.*?\\])?\\{([^}]*)$`))
  if (pkgMatch) {
    // \usepackage takes a comma-separated list; complete only the segment under the cursor
    // (mirrors the cite branch), else "amsmath,amss" matches no package and clobbers the first.
    const inner = pkgMatch[1]!
    const lastComma = inner.lastIndexOf(',')
    return {
      type: 'usepackage',
      prefix: lastComma >= 0 ? inner.slice(lastComma + 1).trim() : inner.trimStart(),
    }
  }
  const includeMatch = before.match(new RegExp(`\\\\(?:${INPUT_CMDS})\\{([^}]*)$`))
  if (includeMatch) return { type: 'include', prefix: includeMatch[1]!.trimStart() }
  const cmdMatch = before.match(/\\(\w*)$/)
  if (cmdMatch) return { type: 'command', prefix: cmdMatch[1]! }
  return null
}

/** Compute completions at a position (editor-neutral). */
export function provideCompletions(
  doc: NeutralDocument,
  pos: NeutralPosition,
  index: ProjectIndex,
  fs: VirtualFS,
): NeutralCompletionItem[] {
  const ctx = detectCompletionContext(doc.lineAt(pos.line), pos.column)
  if (!ctx) return []
  const len = ctx.prefix.length
  switch (ctx.type) {
    case 'command':
      return completeCommands(ctx.prefix, len, index)
    case 'ref':
      return completeRefs(ctx.prefix, len, index)
    case 'cite':
      return completeCites(ctx.prefix, len, index)
    case 'begin':
    case 'end':
      return completeEnvironments(ctx.prefix, len, index, ctx.type === 'begin')
    case 'usepackage':
      return completePackages(ctx.prefix, len)
    case 'include':
      return completeIncludes(ctx.prefix, len, fs)
  }
}

function argSuffix(argCount: number): string {
  if (argCount <= 0) return ''
  return ` (${argCount} arg${argCount !== 1 ? 's' : ''})`
}

function commandDoc(cmd: { documentation?: string; package?: string }, available: boolean): string {
  const parts: string[] = []
  if (cmd.documentation) parts.push(cmd.documentation)
  if (cmd.package) {
    parts.push(
      available ? `Package: \`${cmd.package}\`` : `Requires \`\\usepackage{${cmd.package}}\``,
    )
  }
  return parts.join('\n\n')
}

function completeCommands(
  prefix: string,
  len: number,
  index: ProjectIndex,
): NeutralCompletionItem[] {
  const items: NeutralCompletionItem[] = []
  const loaded = index.getLoadedPackages()
  for (const cmd of LATEX_COMMANDS) {
    if (!cmd.name.startsWith(prefix)) continue
    const available = !cmd.package || loaded.has(cmd.package)
    const item: NeutralCompletionItem = {
      label: `\\${cmd.name}`,
      kind: 'command',
      insertText: cmd.snippet.slice(1),
      snippet: true,
      sortText: `${available ? '0a' : '0b'}_${cmd.name}`,
      replaceLength: len,
    }
    if (cmd.detail) item.detail = cmd.detail
    const doc = commandDoc(cmd, available)
    if (doc) item.documentation = doc
    items.push(item)
  }
  for (const cmd of index.getCommandDefs()) {
    if (!cmd.name.startsWith(prefix)) continue
    items.push({
      label: `\\${cmd.name}`,
      kind: 'variable',
      insertText: cmd.name,
      detail: `User command (${cmd.location.file}:${cmd.location.line})`,
      sortText: `1_${cmd.name}`,
      replaceLength: len,
    })
  }
  appendEngineCommands(items, prefix, len, index)
  return items
}

function engineCommandDetail(category: string, argCount: number): string {
  if (category === 'macro') return `Package macro${argSuffix(argCount)}`
  if (category === 'primitive') return 'TeX primitive'
  return 'Package command'
}

function buildArgSnippet(name: string, argCount: number): string {
  let snippet = name
  for (let i = 1; i <= argCount; i++) snippet += `{$${i}}`
  return snippet
}

function appendEngineCommands(
  items: NeutralCompletionItem[],
  prefix: string,
  len: number,
  index: ProjectIndex,
): void {
  const seen = new Set(items.map((s) => s.label.slice(1)))
  for (const [name, info] of index.getEngineCommands()) {
    if (!name.startsWith(prefix) || seen.has(name)) continue
    const hasArgs = info.argCount > 0
    items.push({
      label: `\\${name}`,
      kind: info.category === 'primitive' ? 'keyword' : 'text',
      insertText: hasArgs ? buildArgSnippet(name, info.argCount) : name,
      snippet: hasArgs,
      detail: engineCommandDetail(info.category, info.argCount),
      sortText: `2_${name}`,
      replaceLength: len,
    })
  }
}

function completeRefs(prefix: string, len: number, index: ProjectIndex): NeutralCompletionItem[] {
  const items: NeutralCompletionItem[] = []
  for (const label of index.getAllLabels()) {
    if (!label.name.startsWith(prefix)) continue
    const resolved = index.resolveLabel(label.name)
    const where = `${label.location.file}:${label.location.line}`
    items.push({
      label: label.name,
      kind: 'reference',
      insertText: label.name,
      detail: resolved ? `[${resolved}] ${where}` : where,
      replaceLength: len,
    })
  }
  return items
}

function completeCites(prefix: string, len: number, index: ProjectIndex): NeutralCompletionItem[] {
  const items: NeutralCompletionItem[] = []
  const seen = new Set<string>()
  for (const key of index.getAuxCitations()) {
    if (!key.startsWith(prefix)) continue
    seen.add(key)
    items.push({
      label: key,
      kind: 'reference',
      insertText: key,
      detail: 'Citation',
      replaceLength: len,
    })
  }
  for (const entry of index.getBibEntries()) {
    if (seen.has(entry.key) || !entry.key.startsWith(prefix)) continue
    const byline = [entry.author, entry.year].filter(Boolean).join(', ')
    items.push({
      label: entry.key,
      kind: 'reference',
      insertText: entry.key,
      detail: byline || (entry.title ?? entry.type),
      replaceLength: len,
    })
  }
  return items
}

function completeEnvironments(
  prefix: string,
  len: number,
  index: ProjectIndex,
  isBegin: boolean,
): NeutralCompletionItem[] {
  const items: NeutralCompletionItem[] = []
  const seen = new Set<string>()
  for (const env of LATEX_ENVIRONMENTS) {
    if (!env.name.startsWith(prefix)) continue
    seen.add(env.name)
    const item: NeutralCompletionItem = {
      label: env.name,
      kind: 'module',
      insertText: env.name,
      replaceLength: len,
    }
    if (env.detail) item.detail = env.detail
    if (isBegin) item.sortText = `0_${env.name}`
    items.push(item)
  }
  for (const name of index.getAllEnvironments()) {
    if (!name.startsWith(prefix) || seen.has(name)) continue
    seen.add(name)
    items.push({
      label: name,
      kind: 'module',
      insertText: name,
      detail: 'Used in project',
      sortText: `1_${name}`,
      replaceLength: len,
    })
  }
  appendEngineEnvironments(items, prefix, len, seen, index)
  return items
}

function appendEngineEnvironments(
  items: NeutralCompletionItem[],
  prefix: string,
  len: number,
  seen: Set<string>,
  index: ProjectIndex,
): void {
  // Engine-hash environments plus any contributed by loaded package shards.
  const envNames = new Set<string>(index.getEngineEnvironments())
  for (const e of getShardEnvironments()) envNames.add(e)
  for (const name of envNames) {
    if (!name.startsWith(prefix) || seen.has(name)) continue
    const argCount = index.getEngineCommands().get(name)?.argCount ?? -1
    items.push({
      label: name,
      kind: 'module',
      insertText: name,
      detail: `Package environment${argSuffix(argCount)}`,
      sortText: `2_${name}`,
      replaceLength: len,
    })
  }
}

function completePackages(prefix: string, len: number): NeutralCompletionItem[] {
  return COMMON_PACKAGES.filter((pkg) => pkg.startsWith(prefix)).map((pkg) => ({
    label: pkg,
    kind: 'module',
    insertText: pkg,
    replaceLength: len,
  }))
}

function completeIncludes(prefix: string, len: number, fs: VirtualFS): NeutralCompletionItem[] {
  return fs
    .listFiles()
    .filter((path) => path.startsWith(prefix))
    .map((path) => ({ label: path, kind: 'file', insertText: path, replaceLength: len }))
}

// --- Hover -------------------------------------------------------------------

const HOVER_ENV_RE = /\\(?:begin|end)\{(\w+\*?)\}/g
const HOVER_REF_RE = new RegExp(`\\\\(?:${REF_CMDS})\\{([^}]+)\\}`, 'g')
const HOVER_CITE_RE = new RegExp(`\\\\(?:${CITE_CMDS})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, 'g')
const HOVER_CMD_RE = new RegExp(COMMAND_TOKEN, 'g')

function findAtCol(line: string, re: RegExp, col: number): RegExpMatchArray | null {
  for (const m of line.matchAll(re)) {
    if (col >= m.index! && col < m.index! + m[0].length) return m
  }
  return null
}

function hoverRange(line: number, start: number, length: number): NeutralHover['range'] {
  return { startLine: line, startColumn: start + 1, endLine: line, endColumn: start + length + 1 }
}

/** Hover info at a position (editor-neutral). */
export function provideHover(
  doc: NeutralDocument,
  pos: NeutralPosition,
  index: ProjectIndex,
): NeutralHover | null {
  const line = doc.lineAt(pos.line)
  const col = pos.column - 1
  const envM = findAtCol(line, HOVER_ENV_RE, col)
  if (envM) return { contents: hoverEnv(envM[1]!, index), range: matchRange(pos.line, envM) }
  const refM = findAtCol(line, HOVER_REF_RE, col)
  if (refM) {
    // \cref{a,b} is a comma list — hover the label under the cursor, not the whole blob.
    const name = commaKeyAtCol(refM, col) ?? refM[1]!.trim()
    return { contents: hoverRef(name, index), range: matchRange(pos.line, refM) }
  }
  const citeM = findAtCol(line, HOVER_CITE_RE, col)
  if (citeM) return { contents: hoverCite(citeM[1]!, index), range: matchRange(pos.line, citeM) }
  const cmdM = findAtCol(line, HOVER_CMD_RE, col)
  if (cmdM) {
    const contents = hoverCommand(cmdM[1]!, index)
    return contents ? { contents, range: matchRange(pos.line, cmdM) } : null
  }
  return null
}

function matchRange(line: number, m: RegExpMatchArray): NeutralHover['range'] {
  return hoverRange(line, m.index!, m[0].length)
}

function hoverEnv(envName: string, index: ProjectIndex): string[] {
  const envInfo = getEnvironmentByName(envName)
  if (envInfo) {
    const contents = [`**${envName}** environment`]
    if (envInfo.detail) contents.push(envInfo.detail)
    if (envInfo.package) contents.push(`Package: \`${envInfo.package}\``)
    appendEngineArgs(contents, index.getEngineCommands().get(envName))
    return contents
  }
  if (index.getEngineEnvironments().has(envName) || getShardEnvironments().has(envName)) {
    const contents = [`**${envName}** — Package environment`]
    appendEngineArgs(contents, index.getEngineCommands().get(envName))
    return contents
  }
  return [`**${envName}** environment`]
}

function hoverRef(name: string, index: ProjectIndex): string[] {
  const resolved = index.resolveLabel(name)
  const def = index.findLabelDef(name)
  const contents = [resolved ? `**\\ref{${name}}** = ${resolved}` : `**\\ref{${name}}**`]
  if (def) contents.push(`Defined at ${def.location.file}:${def.location.line}`)
  return contents
}

function hoverCite(keys: string, index: ProjectIndex): string[] {
  const contents: string[] = []
  for (const key of keys.split(',')) {
    const trimmed = key.trim()
    const entry = index.findBibEntry(trimmed)
    if (entry) {
      const preview = formatReference(entry)
      contents.push(`**[${trimmed}]** ${entry.type}${preview ? `\n\n${preview}` : ''}`)
    } else {
      contents.push(`**[${trimmed}]**`)
    }
  }
  return contents
}

function hoverCommand(name: string, index: ProjectIndex): string[] | null {
  const cmd = getCommandByName(name)
  if (cmd) {
    const contents = [`**\\${name}**${cmd.detail ? ` — ${cmd.detail}` : ''}`]
    const sig = parseSignature(cmd.snippet)
    if (sig.length) contents.push(`\`${formatSignature(name, sig)}\``)
    if (cmd.documentation) contents.push(cmd.documentation)
    if (cmd.package) contents.push(`Package: \`${cmd.package}\``)
    appendEngineArgs(contents, index.getEngineCommands().get(name))
    return contents
  }
  const userCmd = index.findCommandDef(name)
  if (userCmd) {
    return [
      `**\\${name}** — User-defined command`,
      `Defined at ${userCmd.location.file}:${userCmd.location.line}`,
    ]
  }
  const engine = index.getEngineCommands().get(name)
  if (engine) {
    const contents = [`**\\${name}** — ${engineCategoryLabel(engine.category)}`]
    appendEngineArgs(contents, engine)
    return contents
  }
  return null
}

function engineCategoryLabel(category: EngineCommandInfo['category']): string {
  if (category === 'macro') return 'Package macro'
  if (category === 'primitive') return 'TeX primitive'
  return 'Package command'
}

function appendEngineArgs(contents: string[], info: EngineCommandInfo | undefined): void {
  if (!info || info.category !== 'macro') return
  if (info.argCount > 0) contents.push(`Arguments: ${info.argCount}`)
  else if (info.argCount === 0) contents.push('Arguments: none')
}

// --- Definition & references -------------------------------------------------

const DEF_REF_RE = new RegExp(`\\\\(?:${REF_CMDS})\\{([^}]+)\\}`, 'g')
const DEF_CITE_RE = new RegExp(`\\\\(?:${CITE_CMDS})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, 'g')
const DEF_CMD_RE = new RegExp(COMMAND_TOKEN, 'g')

function point(file: string, location: { line: number; column: number }): NeutralLocation {
  return {
    file,
    range: {
      startLine: location.line,
      startColumn: location.column,
      endLine: location.line,
      endColumn: location.column,
    },
  }
}

/** The single citation key under the cursor inside a `\cite{a,b,c}` match. */
/** The comma-separated key/label segment under `col` in a `\cmd{a,b,c}` match (cite keys
 *  or cleveref ref labels). Both `\cite[..]{a,b}` and `\cref{a,b}` carry a comma list whose
 *  group is the LAST brace; resolving the whole blob would key a string no index holds. */
function commaKeyAtCol(m: RegExpMatchArray, col: number): string | null {
  const keys = m[1]!
  // The key group's `{` is the LAST brace in the match — using the first one would
  // land inside a braced optional arg (e.g. `\cite[{prenote}]{a,b}`).
  let cursor = m.index! + m[0].lastIndexOf('{') + 1
  for (const key of keys.split(',')) {
    if (col >= cursor && col <= cursor + key.length) return key.trim() || null
    cursor += key.length + 1 // +1 for the comma
  }
  return keys.split(',')[0]?.trim() || null // cursor on the command name → first key
}

/** Go-to-definition target at a position (editor-neutral). */
export function provideDefinition(
  doc: NeutralDocument,
  pos: NeutralPosition,
  index: ProjectIndex,
): NeutralLocation | null {
  const line = doc.lineAt(pos.line)
  const col = pos.column - 1

  const refM = findAtCol(line, DEF_REF_RE, col)
  if (refM) {
    const name = commaKeyAtCol(refM, col)
    const def = name ? index.findLabelDef(name) : null
    return def ? point(def.location.file, def.location) : null
  }
  const citeM = findAtCol(line, DEF_CITE_RE, col)
  if (citeM) {
    const key = commaKeyAtCol(citeM, col)
    if (!key) return null
    const entry = index.findBibEntry(key)
    if (entry) return point(entry.location.file, entry.location)
    const item = index.findBibitemDef(key)
    return item ? point(item.location.file, item.location) : null
  }
  const cmdM = findAtCol(line, DEF_CMD_RE, col)
  if (cmdM) {
    const def = index.findCommandDef(cmdM[1]!)
    return def ? point(def.location.file, def.location) : null
  }
  return null
}

/** Find-all-references at a position (editor-neutral). */
export function provideReferences(
  doc: NeutralDocument,
  pos: NeutralPosition,
  index: ProjectIndex,
): NeutralLocation[] {
  const line = doc.lineAt(pos.line)
  const col = pos.column - 1

  const labelM = findAtCol(line, /\\label\{([^}]+)\}/g, col)
  if (labelM) {
    return index.getAllLabelRefs(labelM[1]!.trim()).map((r) => point(r.location.file, r.location))
  }
  const refM = findAtCol(line, DEF_REF_RE, col)
  if (refM) {
    const name = commaKeyAtCol(refM, col) // resolve the label under the cursor in \cref{a,b}
    if (!name) return []
    const out: NeutralLocation[] = []
    const def = index.findLabelDef(name)
    if (def) out.push(point(def.location.file, def.location))
    for (const r of index.getAllLabelRefs(name)) out.push(point(r.location.file, r.location))
    return out
  }
  // A citation key: every `\cite` occurrence plus the bib entry/bibitem — symmetric
  // with provideDefinition and rename, which both resolve the key under the cursor.
  const citeM = findAtCol(line, DEF_CITE_RE, col)
  if (citeM) {
    const key = commaKeyAtCol(citeM, col)
    if (!key) return []
    return occurrencesToReferences(index.findAllOccurrences(key, 'citation'))
  }
  // A user-defined command: every `\name` token (definition + call sites). Gated on a
  // definition so builtins (\textbf, \section, …) and \label/\ref are not treated as renamable.
  const cmdM = findAtCol(line, DEF_CMD_RE, col)
  if (cmdM && index.findCommandDef(cmdM[1]!)) {
    return occurrencesToReferences(index.findAllOccurrences(cmdM[1]!, 'command'))
  }
  return []
}

/** Map symbol occurrences to editor-neutral reference locations. */
function occurrencesToReferences(occurrences: Occurrence[]): NeutralLocation[] {
  return occurrences.map((o) => ({
    file: o.filePath,
    range: {
      startLine: o.line,
      startColumn: o.column,
      endLine: o.line,
      endColumn: o.column + o.length,
    },
  }))
}

/** Offset → 1-based line/column (re-exported for adapters). */
export function positionAt(text: string, offset: number): NeutralPosition {
  return offsetToLineCol(buildLineStarts(text), offset)
}
