import { buildFileContext } from '../engine/parse-errors'
import type { VirtualFS } from '../fs/virtual-fs'
import type { CompletionCancellationToken } from './completion-registry'
import type { ProjectIndex } from './project-index'
import { getStructuralSelectionIndex } from './structural-selection'

export interface UndefinedCommandEvidence {
  code: 'undefined-control-sequence'
  file: string
  command: string
  range: { startOffset: number; endOffset: number }
  expectedText: string
  evidence: 'direct-engine-error-context'
}

/**
 * Match a direct engine error to a real source token. The caller must first bind
 * this log to the current project revision, root, engine and compile profile.
 * Expansion stacks, truncated prefixes and missing file context are not proof
 * that the source command itself was undefined.
 */
export function undefinedCommandEvidence(
  log: string,
  fs: VirtualFS,
  index: ProjectIndex,
  root: string,
  cancellation?: CompletionCancellationToken,
): UndefinedCommandEvidence[] {
  if (log.length > 4_000_000 || cancellation?.isCancellationRequested) return []
  const lines = log.split(/\r?\n/)
  const context = buildFileContext(lines)
  const files = new Set(index.getRootFiles(root))
  const result: UndefinedCommandEvidence[] = []
  for (let i = 0; i < lines.length; i++) {
    if (cancellation?.isCancellationRequested) return []
    if (lines[i] !== '! Undefined control sequence.') continue
    const file = context[i]
    if (!file || !files.has(file)) continue
    const site = errorSite(lines, i + 1, file, fs, index)
    if (site) result.push(site)
    if (result.length > 1024) return []
  }
  return result
}

function errorSite(
  lines: string[],
  start: number,
  file: string,
  fs: VirtualFS,
  index: ProjectIndex,
): UndefinedCommandEvidence | null {
  const direct = directContext(lines, start)
  if (!direct) return null
  const site = directErrorSite(direct.line, file, fs, index)
  return direct.command && site?.command !== direct.command ? null : site
}

function directContext(lines: string[], start: number): { line: string; command?: string } | null {
  const line = lines[start] ?? ''
  if (line.startsWith('l.')) return { line }
  const recent = /^<recently read> \\([A-Za-z]+)\s*$/.exec(line)
  if (!recent) return null
  // pdfTeX's math expansion path prints the just-read control word separately.
  // It is direct evidence only when the complete source prefix names that word.
  let next = start + 1
  while (next < start + 4 && lines[next]?.trim() === '') next++
  return { line: lines[next] ?? '', command: recent[1]! }
}

function directErrorSite(
  context: string,
  file: string,
  fs: VirtualFS,
  index: ProjectIndex,
): UndefinedCommandEvidence | null {
  const match = /^l\.(\d+) (.*\\([A-Za-z]+))$/.exec(context)
  if (!match || match[2]!.startsWith('...')) return null
  const line = Number(match[1])
  const prefix = match[2]!
  const command = match[3]!
  const structure = getStructuralSelectionIndex(index.getFileSymbols(file))
  const text = fs.readFile(file)
  if (!structure || typeof text !== 'string') return null
  const lineStart = structure.lineStarts[line - 1]
  if (lineStart === undefined || !text.startsWith(prefix, lineStart)) return null
  const endOffset = lineStart + prefix.length
  const startOffset = endOffset - command.length - 1
  const token = structure.commands.find((value) => value.start === startOffset)
  if (!token || token.end !== endOffset || token.value !== command) return null
  return {
    code: 'undefined-control-sequence',
    file,
    command,
    range: { startOffset, endOffset },
    expectedText: text.slice(startOffset, endOffset),
    evidence: 'direct-engine-error-context',
  }
}
