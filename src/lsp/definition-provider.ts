import type * as monaco from 'monaco-editor'
import { ENV_CMDS, INPUT_CMDS, REF_CMDS } from './latex-patterns'
import type { ProjectIndex } from './project-index'
import { sourceLocationToMonaco } from './source-position-monaco'

type Token = { command: string; arg: string } | { command: string }

/** Walk backwards from col to find the index of the opening `{` at depth 0 */
function findOpenBrace(line: string, col: number): number {
  let depth = 0
  for (let i = col - 1; i >= 0; i--) {
    if (line[i] === '}') depth++
    else if (line[i] === '{') {
      if (depth === 0) return i
      depth--
    }
  }
  return -1
}

/** Find the index of the closing `}` that matches the `{` at braceStart */
function findCloseBrace(line: string, braceStart: number): number {
  let depth = 0
  for (let i = braceStart; i < line.length; i++) {
    if (line[i] === '{') depth++
    else if (line[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return line.length
}

/** In a comma-list like `a,b,c`, the single item containing the cursor (`rel` is
 *  the offset into the list); the whole string when there is no comma. */
function commaSegmentAt(content: string, rel: number): string {
  let start = 0
  for (const seg of content.split(',')) {
    const end = start + seg.length
    if (rel >= start && rel <= end) return seg
    start = end + 1 // skip the comma
  }
  return content
}

/** Try to find a \cmd{arg} token where the cursor is inside the braces */
function getTokenInBraces(line: string, col: number): { command: string; arg: string } | null {
  const braceStart = findOpenBrace(line, col)
  if (braceStart < 0) return null

  const before = line.slice(0, braceStart)
  const cmdMatch = before.match(/\\([a-zA-Z@]+)(?:\[.*?\])?\s*$/)
  if (!cmdMatch) return null

  const braceEnd = findCloseBrace(line, braceStart)
  // For comma-lists (e.g. `\cite{a,b,c}`) resolve the single key under the cursor,
  // not the whole `a,b,c` blob (which matches no bib entry).
  const content = line.slice(braceStart + 1, braceEnd)
  const arg = commaSegmentAt(content, col - (braceStart + 1))
  return { command: cmdMatch[1]!, arg }
}

const CITE_CMD_RE = /^(?:cite|citep|citet|parencite|textcite|autocite|nocite)$/
const ARG_CMD_RE = new RegExp(
  `^(?:${REF_CMDS}|cite|citep|citet|parencite|textcite|autocite|nocite|${INPUT_CMDS}|${ENV_CMDS})$`,
)

/** Try to find a \command token where the cursor is on the command word */
function getTokenOnCommand(line: string, col: number): Token | null {
  const matches = line.matchAll(/\\[a-zA-Z@]+/g)
  for (const match of matches) {
    const start = match.index!
    const end = start + match[0].length
    // End-exclusive so the shared boundary of two adjacent commands (`\aaa\bbb`) belongs to
    // the right-hand command — matching the editor-neutral findAtCol contract. An inclusive
    // `col <= end` would attribute the caret on the second backslash to the first command.
    if (col >= start && col < end) {
      const command = match[0].slice(1) // remove backslash
      // For ref/cite/input commands, also grab the brace argument that follows
      if (ARG_CMD_RE.test(command)) {
        const after = line.slice(end)
        const braceMatch = after.match(/^\s*(?:\[.*?\])?\s*\{([^}]*)\}/)
        // The cursor is on the command word, not inside the braces, so there is no
        // per-segment position; resolve the FIRST comma key (commaSegmentAt(_, 0))
        // — consistent with single-key behavior. Passing the whole `a,b` blob would
        // match no bib/label/env entry and silently dead-end.
        if (braceMatch) return { command, arg: commaSegmentAt(braceMatch[1]!, 0) }
      }
      return { command }
    }
  }
  return null
}

/** Extract the token at the cursor position: returns { command, arg } or null */
function getTokenAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): Token | null {
  const line = model.getLineContent(position.lineNumber)
  const col = position.column - 1
  return getTokenInBraces(line, col) ?? getTokenOnCommand(line, col)
}

const REF_CMD_RE = new RegExp(`^(?:${REF_CMDS})$`)
const INPUT_CMD_RE = new RegExp(`^(?:${INPUT_CMDS})$`)
const ENV_CMD_RE = new RegExp(`^(?:${ENV_CMDS})$`)

function resolveInput(
  arg: string,
  index: ProjectIndex,
  model: monaco.editor.ITextModel,
): monaco.languages.Definition | null {
  const candidates = [arg]
  // Only an EXTENSIONLESS target gets `.tex` appended; \input loads the exact file otherwise.
  // Appending to e.g. `macros.sty` made the fallback navigate to a bogus `macros.sty.tex`.
  // Mirrors the LinkProvider's `/\.[^./]+$/` check in language-feature-providers.
  if (!/\.[^./]+$/.test(arg)) {
    candidates.push(`${arg}.tex`)
  }

  // 1. Try resolving relative to project root
  for (const cand of candidates) {
    if (index.hasFile(cand)) {
      return sourceLocationToMonaco({ file: cand, line: 1, column: 1 })
    }
  }

  // 2. Try resolving relative to current file's directory
  const currentPath = model.uri.path.replace(/^\//, '') // Remove leading '/'
  const lastSlash = currentPath.lastIndexOf('/')
  if (lastSlash >= 0) {
    const currentDir = currentPath.slice(0, lastSlash + 1)
    for (const cand of candidates) {
      const relPath = currentDir + cand
      if (index.hasFile(relPath)) {
        return sourceLocationToMonaco({ file: relPath, line: 1, column: 1 })
      }
    }
  }

  // Fallback: return the first likely candidate
  return sourceLocationToMonaco({
    file: candidates[candidates.length - 1]!,
    line: 1,
    column: 1,
  })
}

function handleArgToken(
  command: string,
  arg: string,
  index: ProjectIndex,
  model: monaco.editor.ITextModel,
): monaco.languages.Definition | null {
  const trimmedArg = arg.trim()
  // \ref{name} or \eqref{name} -> jump to \label{name}
  if (REF_CMD_RE.test(command)) {
    const label = index.findLabelDef(trimmedArg)
    if (label) return sourceLocationToMonaco(label.location)
    return null
  }

  // \cite{key} -> jump to BibTeX entry or \bibitem
  if (CITE_CMD_RE.test(command)) {
    // Priority 1: .bib file entries
    const bibEntry = index.findBibEntry(trimmedArg)
    if (bibEntry) return sourceLocationToMonaco(bibEntry.location)

    // Priority 2: \bibitem in .tex files
    const bibitem = index.findBibitemDef(trimmedArg)
    if (bibitem) return sourceLocationToMonaco(bibitem.location)
    return null
  }

  // \input{file} or \include{file} -> jump to file line 1
  if (INPUT_CMD_RE.test(command)) {
    return resolveInput(trimmedArg, index, model)
  }

  // \begin{env} or \end{env} -> jump to \newenvironment{env}
  if (ENV_CMD_RE.test(command)) {
    const envDef = index.findEnvironmentDef(trimmedArg)
    if (envDef) return sourceLocationToMonaco(envDef.location)
    return null
  }

  return null
}

function handleCommandToken(
  command: string,
  index: ProjectIndex,
): monaco.languages.Definition | null {
  const cmdDef = index.findCommandDef(command)
  if (cmdDef) return sourceLocationToMonaco(cmdDef.location)
  return null
}

export function createDefinitionProvider(index: ProjectIndex): monaco.languages.DefinitionProvider {
  return {
    provideDefinition(
      model: monaco.editor.ITextModel,
      position: monaco.Position,
    ): monaco.languages.Definition | null {
      const token = getTokenAtPosition(model, position)
      if (!token) return null

      if ('arg' in token) {
        return handleArgToken(token.command, token.arg, index, model)
      }
      return handleCommandToken(token.command, index)
    },
  }
}
