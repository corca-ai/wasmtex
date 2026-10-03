import type { DiagnosticRepairSource } from './diagnostic-repair'
import { consumeRepairArguments } from './diagnostic-repair-arguments'
import { packagePreambleEdit, topLevel } from './diagnostic-repair-preamble'
import type { LatexPdfMetadataRepairProposal } from './diagnostic-repair-types'
import { getStructuralSelectionIndex } from './structural-selection'

type SourceIndex = NonNullable<ReturnType<typeof getStructuralSelectionIndex>>
const METADATA_COMMANDS = new Set(['title', 'author', 'hypersetup', 'documentclass'])

/** A conservative source-backed proposal, never a write or an expansion of user macros. */
export function getPdfMetadataRepairs(
  source: DiagnosticRepairSource,
  path: string,
  offset: number,
): LatexPdfMetadataRepairProposal[] {
  if (path !== source.root) return []
  const text = source.fs.readFile(path)
  const symbols = source.index.getFileSymbols(path)
  const index = getStructuralSelectionIndex(symbols)
  if (typeof text !== 'string' || !symbols || !index || text.length > 1_000_000) return []
  const anchor = index.commands.find((token) => token.start <= offset && offset < token.end)
  if (!anchor || !METADATA_COMMANDS.has(anchor.value) || !topLevel(index, anchor.start)) return []
  // Reuse the reviewed preamble's class, document-boundary and control-scope proof.
  if (!packagePreambleEdit(text, symbols, path, 'hyperref')) return []
  const start = documentStart(index)
  if (start === null || anchor.start >= start) return []
  const evidence = metadataEvidence(source)
  if (!evidence) return []
  const metadata = missingMetadata(text, index, start, evidence.code)
  if (!Object.keys(metadata).length) return []
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const keys = Object.entries(metadata)
    .map(([key, value]) => `${key}={${value}}`)
    .join(', ')
  const prefix = start > 0 && text[start - 1] !== '\n' ? newline : ''
  const packageLine = evidence.hyperref ? '' : `\\usepackage{hyperref}${newline}`
  return [
    {
      kind: 'pdf-metadata',
      root: source.root,
      revision: source.revision,
      contextRevision: source.contextRevision,
      anchor: {
        file: path,
        range: { startOffset: anchor.start, endOffset: anchor.end },
        expectedText: text.slice(anchor.start, anchor.end),
      },
      command: anchor.value,
      diagnostic: {
        code: 'a11y-pdf-metadata',
        file: path,
        line: anchor.line,
        column: anchor.column,
        endColumn: anchor.column + anchor.end - anchor.start,
        severity: 'info',
        message: 'Review copying the source title and author into explicit PDF metadata.',
      },
      metadata,
      edits: [
        {
          file: path,
          range: { startOffset: start, endOffset: start },
          expectedText: '',
          newText: `${prefix}${packageLine}\\hypersetup{${keys}}${newline}`,
        },
      ],
    },
  ]
}

function documentStart(index: SourceIndex): number | null {
  const begin = index.commands.find(
    (token) => token.value === 'begin' && /^\s*\{document\}/.test(index.masked.slice(token.end)),
  )
  return begin?.start ?? null
}

function metadataEvidence(source: DiagnosticRepairSource) {
  const files = source.index.getRootFiles(source.root)
  if (files.length > 1024) return null
  const code: string[] = []
  let length = 0
  let hyperref = false
  for (const path of files) {
    const symbols = source.index.getFileSymbols(path)
    const index = getStructuralSelectionIndex(symbols)
    if (!symbols || !index) return null
    if (
      symbols.commands.some(
        (command) => METADATA_COMMANDS.has(command.name) || command.name === 'usepackage',
      )
    )
      return null
    length += index.masked.length
    if (length > 4_000_000) return null
    if (!metadataSettingsAreLiteral(index)) return null
    code.push(index.masked)
    if (path === source.root) hyperref = symbols.packages.some((pkg) => pkg.name === 'hyperref')
  }
  return { code: code.join('\n'), hyperref }
}

function missingMetadata(text: string, index: SourceIndex, before: number, code: string) {
  const metadata: LatexPdfMetadataRepairProposal['metadata'] = {}
  for (const [command, key] of [
    ['title', 'pdftitle'],
    ['author', 'pdfauthor'],
  ] as const) {
    if (new RegExp(`\\b${key}\\s*=`).test(code)) continue
    const value = literalValue(text, index, command, before)
    if (value !== null) metadata[key] = value
  }
  return metadata
}

function literalValue(
  text: string,
  index: SourceIndex,
  name: string,
  before: number,
): string | null {
  const tokens = index.commands.filter((token) => token.value === name)
  if (tokens.length !== 1) return null
  const token = tokens[0]!
  if (token.start >= before || !topLevel(index, token.start)) return null
  const args = consumeRepairArguments(
    text,
    index,
    new Map(index.commands.map((value) => [value.start, value])),
    token.end,
    [{ kind: 'optional' }, { kind: 'required' }],
  )
  const argument = args?.arguments.at(-1)
  if (!argument?.grouped || args?.missing.length) return null
  const value = text.slice(argument.start + 1, argument.end - 1)
  // Only literal text and escaped punctuation: no macros, comments, math or parameters.
  if (!value.trim() || /\\(?:[A-Za-z@]|$)|(?<!\\)[%$#]/.test(value)) return null
  return value
}

function metadataSettingsAreLiteral(index: SourceIndex): boolean {
  for (const token of index.commands) {
    if (!['hypersetup', 'DocumentMetadata'].includes(token.value)) continue
    let start = token.end
    while (/\s/.test(index.masked[start] ?? '') && start < index.masked.length) start++
    const end = index.groups.get(start)
    if (end === undefined || /\\[A-Za-z@]/.test(index.masked.slice(start + 1, end))) return false
  }
  return true
}
