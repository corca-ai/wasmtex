import { CLASS_SUPPORT } from '../engine/accessible-export'
import type { CompletionSnapshotEngine } from '../types'
import type { Diagnostic } from './diagnostic-provider'
import { maskSpans } from './latex-parser'

export type AccessiblePdfEngine = CompletionSnapshotEngine | 'auto'
export interface AccessiblePdfProject {
  readonly files: Readonly<Record<string, string | Uint8Array>>
  readonly mainFile: string
}
export interface AccessiblePdfSourceOptions {
  engine?: AccessiblePdfEngine
  mainFile?: string
  /** Host-owned ignore directive name; defaults to wasmtex-ignore. */
  ignoreDirective?: string
}

export type AccessiblePdfPreflightIssueCode =
  | 'document-class-compatibility'
  | 'figure-alt-review'
  | 'heading-order-review'
  | 'incomplete-metadata'
  | 'link-purpose-review'
  | 'math-structure-review'
  | 'table-headers-review'
  | 'xelatex-compatibility'

export type AccessiblePdfRuleId = `a11y-${AccessiblePdfPreflightIssueCode}`

function accessiblePdfRuleId(code: AccessiblePdfPreflightIssueCode): AccessiblePdfRuleId {
  return `a11y-${code}`
}

export type AccessiblePdfPreflightIssueKind = 'fix' | 'review' | 'compatibility'

export type AccessiblePdfMetadataRequirement = 'language' | 'PDF 2.0' | 'PDF/UA-2' | 'tagging'

export interface AccessiblePdfPreflightIssue {
  readonly code: AccessiblePdfPreflightIssueCode
  readonly file: string
  readonly kind: AccessiblePdfPreflightIssueKind
  readonly line: number
  readonly ruleId: AccessiblePdfRuleId
  readonly missing?: readonly AccessiblePdfMetadataRequirement[]
  readonly documentClass?: string
  readonly support?: 'partial' | 'unsupported'
}

export interface AccessiblePdfPreflight {
  readonly issues: readonly AccessiblePdfPreflightIssue[]
  readonly summary: Readonly<Record<AccessiblePdfPreflightIssueKind, number>>
}

const DOCUMENT_METADATA = '\\DocumentMetadata'
const TABULAR = '\\begin{tabular'
const GENERIC_LINK_TEXT = new Set(['click here', 'here', 'link', 'more', 'read more'])
const HEADING_LEVEL = {
  chapter: 0,
  paragraph: 4,
  part: -1,
  section: 1,
  subsection: 2,
  subparagraph: 5,
  subsubsection: 3,
} as const
/** Mask parser-owned non-code spans without changing source offsets. */
function maskNonCode(source: string) {
  const chars = source.split('')
  for (const [start, end] of maskSpans(source)) {
    for (let i = start; i < end; i++) if (chars[i] !== '\n') chars[i] = ' '
  }
  return chars.join('')
}

function delimitedContent(source: string, from: number, opening: '[' | '{', closing: ']' | '}') {
  if (source[from] !== opening) return null
  let depth = 1
  for (let cursor = from + 1; cursor < source.length; cursor += 1) {
    const escaped = source[cursor - 1] === '\\'
    if (!escaped && source[cursor] === opening) depth += 1
    if (!escaped && source[cursor] === closing) depth -= 1
    if (depth === 0) {
      return { content: source.slice(from + 1, cursor), end: cursor + 1 }
    }
  }
  return null
}

function skipSpace(source: string, cursor: number) {
  while (cursor < source.length && /\s/.test(source[cursor]!)) cursor++
  return cursor
}
function commandArguments(source: string, cursor: number, count: number) {
  cursor = skipSpace(source, cursor)
  const optional = delimitedContent(source, cursor, '[', ']')
  if (optional) cursor = skipSpace(source, optional.end)
  const args: string[] = []
  for (let i = 0; i < count; i++) {
    const argument = delimitedContent(source, cursor, '{', '}')
    if (!argument) return null
    args.push(argument.content)
    cursor = skipSpace(source, argument.end)
  }
  return { arguments: args, options: optional?.content ?? null }
}
function texCommands(source: string, name: string, argumentCount: number) {
  const pattern = new RegExp(`\\\\${name}(?:\\*)?(?![A-Za-z@*])`, 'g')
  return [...source.matchAll(pattern)].flatMap((match) => {
    const args = commandArguments(source, (match.index ?? 0) + match[0].length, argumentCount)
    return args ? [{ ...args, offset: match.index ?? 0 }] : []
  })
}

function topLevelOptions(options: string) {
  const entries: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index <= options.length; index += 1) {
    const character = options[index]
    if (character === '{') depth += 1
    if (character === '}') depth = Math.max(0, depth - 1)
    if ((character === ',' && depth === 0) || index === options.length) {
      entries.push(options.slice(start, index).trim())
      start = index + 1
    }
  }
  return entries
}

function figureHasTextAlternative(options: string | null) {
  if (!options) return false
  return topLevelOptions(options).some((entry) => {
    const separator = entry.indexOf('=')
    const key = (separator < 0 ? entry : entry.slice(0, separator)).trim()
    if (key === 'artifact')
      return separator < 0 || /^(?:true|\{true\})$/.test(entry.slice(separator + 1).trim())
    if (separator < 0) return false
    if (key !== 'alt' && key !== 'actualtext') return false
    const value = entry.slice(separator + 1).trim()
    return value.replace(/^\{([\s\S]*)\}$/, '$1').trim().length > 0
  })
}

function normalizedLinkText(value: string) {
  return value
    .replace(/\\[A-Za-z@]+\*?/g, '')
    .replace(/[{}~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\p{P}+|\p{P}+$/gu, '')
    .toLowerCase()
}

function ignoredIssueKeys(source: string, directive = 'wasmtex-ignore') {
  const ignored = new Set<string>()
  if (!/^[a-z][a-z0-9-]*$/.test(directive)) return ignored
  const maskedLines = maskNonCode(source).split('\n')
  const spans = maskSpans(source)
  const lines = source.split('\n')
  let offset = 0
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ''
    const match = new RegExp(`^[ \t]*%[ \t]*${directive}[ \t]+(a11y-[a-z0-9-]+)[ \t\r]*$`).exec(
      line,
    )
    // An actual comment token is masked; literal and inactive regions also mask the '%' character.
    const inLiteral = spans.some(([start, end]) => start < offset && end > offset + line.length)
    if (match && !inLiteral) {
      for (let target = index + 1; target < lines.length; target++) {
        if (!(maskedLines[target] ?? '').trim()) continue
        ignored.add(`${match[1]}:${target + 1}`)
        break
      }
    }
    offset += line.length + 1
  }
  return ignored
}

export function accessibilityReviewIssues(path: string, source: string, masked: string) {
  const issues: (AccessiblePdfPreflightIssue & { offset: number; length: number })[] = []
  const headings = Object.keys(HEADING_LEVEL).flatMap((name) =>
    texCommands(masked, name, 1).map((command) => ({
      level: HEADING_LEVEL[name as keyof typeof HEADING_LEVEL],
      offset: command.offset,
    })),
  )
  headings.sort((left, right) => left.offset - right.offset)
  for (let index = 1; index < headings.length; index += 1) {
    const previous = headings[index - 1]
    const current = headings[index]
    if (!previous || !current || current.level <= previous.level + 1) continue
    if (previous.level === HEADING_LEVEL.part && current.level <= 1) continue
    issues.push({
      offset: current.offset,
      length: /^\\[A-Za-z]+\*?/.exec(masked.slice(current.offset))![0].length,
      code: 'heading-order-review',
      file: path,
      kind: 'review',
      line: lineAt(source, current.offset),
      ruleId: accessiblePdfRuleId('heading-order-review'),
    })
  }
  for (const figure of texCommands(masked, 'includegraphics', 1)) {
    if (figureHasTextAlternative(figure.options)) continue
    issues.push({
      offset: figure.offset,
      length: '\\includegraphics'.length,
      code: 'figure-alt-review',
      file: path,
      kind: 'review',
      line: lineAt(source, figure.offset),
      ruleId: accessiblePdfRuleId('figure-alt-review'),
    })
  }
  for (const link of texCommands(masked, 'href', 2)) {
    if (!GENERIC_LINK_TEXT.has(normalizedLinkText(link.arguments[1] ?? ''))) {
      continue
    }
    issues.push({
      offset: link.offset,
      length: '\\href'.length,
      code: 'link-purpose-review',
      file: path,
      kind: 'review',
      line: lineAt(source, link.offset),
      ruleId: accessiblePdfRuleId('link-purpose-review'),
    })
  }
  return issues
}

function commandArgument(source: string, command: string) {
  const commandOffset = source.indexOf(command)
  if (commandOffset < 0) return null
  let cursor = commandOffset + command.length
  while (/\s/.test(source[cursor] ?? '')) cursor += 1
  if (source[cursor] !== '{') return null

  const contentStart = cursor + 1
  let depth = 1
  for (cursor = contentStart; cursor < source.length; cursor += 1) {
    if (source[cursor] === '{') depth += 1
    if (source[cursor] === '}') depth -= 1
    if (depth === 0) {
      return {
        commandOffset,
        content: source.slice(contentStart, cursor),
      }
    }
  }
  return { commandOffset, content: source.slice(contentStart) }
}

function lineAt(source: string, offset: number) {
  let line = 1
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === '\n') line += 1
  }
  return line
}

function metadataIssue(path: string, source: string, masked: string) {
  const metadata = commandArgument(masked, DOCUMENT_METADATA)
  if (!metadata) return null
  const required = [
    ['language', /\blang\s*=/],
    ['PDF 2.0', /\bpdfversion\s*=\s*2(?:\.0)?\b/],
    ['PDF/UA-2', /\bpdfstandard\s*=\s*ua-2\b/i],
    ['tagging', /\btagging\s*=\s*on\b/i],
  ] as const
  const missing = required
    .filter(([, pattern]) => !pattern.test(metadata.content))
    .map(([label]) => label)
  if (missing.length === 0) return null
  return {
    code: 'incomplete-metadata',
    file: path,
    kind: 'fix',
    line: lineAt(source, metadata.commandOffset),
    missing,
    ruleId: accessiblePdfRuleId('incomplete-metadata'),
  } satisfies AccessiblePdfPreflightIssue
}

function sourceHasMath(source: string) {
  return (
    /\$(?!\$)[^\n$]+\$/.test(source) ||
    source.includes('\\(') ||
    source.includes('\\[') ||
    /\\begin\{(?:equation\*?|align\*?|gather\*?|multline\*?|math|displaymath)\}/.test(source)
  )
}

function documentClassOf(source: string) {
  return /\\documentclass(?:\[[^\]]*\])?\s*\{([^}]+)\}/.exec(source)?.[1]?.trim() ?? null
}

function resolvedPreflightEngine(
  requested: AccessiblePdfEngine,
  source: string,
): Exclude<AccessiblePdfEngine, 'auto'> {
  if (requested !== 'auto') return requested
  const magic = /%\s*!\s*(?:TEX\s+)?(?:TS-)?(?:program|engine)\s*=\s*([A-Za-z]+)/i
    .exec(source.slice(0, 2048))?.[1]
    ?.toLowerCase()
  if (magic?.includes('lua')) return 'lualatex'
  if (magic?.includes('xe')) return 'xelatex'
  if (magic && /^(?:pdf)?latex$|^pdftex$/.test(magic)) return 'pdflatex'

  const code = maskNonCode(source)
  const documentStart = code.indexOf('\\begin{document}')
  const preamble = code.slice(0, documentStart >= 0 ? documentStart : Math.min(code.length, 8192))
  if (/\\directlua\b|\{(?:luacode|luatexja|luamplib|lua-ul)\}/.test(preamble)) {
    return 'lualatex'
  }
  if (
    /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\s*\{[^}]*(?:fontspec|unicode-math|polyglossia|xeCJK|xetexko)[^}]*\}|\\(?:setmainfont|fontspec)\b/.test(
      preamble,
    )
  ) {
    return 'xelatex'
  }
  return 'pdflatex'
}

function classCompatibilityIssue(path: string, source: string, masked: string) {
  const documentClass = documentClassOf(masked)
  const known = documentClass ? CLASS_SUPPORT[documentClass] : null
  const support = known === 'partial' || known === 'unsupported' ? known : null
  if (!documentClass || !support) return null
  return {
    code: 'document-class-compatibility',
    documentClass,
    file: path,
    kind: 'compatibility',
    line: lineAt(source, masked.indexOf('\\documentclass')),
    ruleId: accessiblePdfRuleId('document-class-compatibility'),
    support,
  } satisfies AccessiblePdfPreflightIssue
}

function projectSourceIssues(
  files: Readonly<Record<string, string | Uint8Array>>,
  options: AccessiblePdfSourceOptions = {},
) {
  const textFiles = Object.entries(files).filter(
    (entry): entry is [string, string] => entry[0].endsWith('.tex') && typeof entry[1] === 'string',
  )
  const maskedFiles = textFiles.map(
    ([path, source]) => [path, source, maskNonCode(source)] as const,
  )
  const roots = maskedFiles.filter(([, , masked]) => masked.includes('\\documentclass'))
  const main =
    maskedFiles.find(([path]) => path === options.mainFile) ??
    (roots.length === 1 ? roots[0] : undefined)
  const mainCode = main?.[2] ?? ''
  const engine = resolvedPreflightEngine(options.engine ?? 'auto', main?.[1] ?? '')
  const projectMathSupport = roots.length === 1 && hasMathSupport(mainCode, engine)
  const projectTableHeaders = roots.length === 1 && /table\/header-rows\s*=/.test(mainCode)
  const issues: AccessiblePdfPreflightIssue[] = []

  for (const [path, source, masked] of maskedFiles) {
    const compatibility =
      !options.mainFile || path === options.mainFile
        ? classCompatibilityIssue(path, source, masked)
        : null
    if (compatibility) issues.push(compatibility)
    const metadata = metadataIssue(path, source, masked)
    if (metadata) issues.push(metadata)

    issues.push(
      ...contentReviewIssues(path, source, masked, engine, projectMathSupport, projectTableHeaders),
    )
  }

  const ignoredByFile = new Map(
    textFiles.map(([path, source]) => [path, ignoredIssueKeys(source, options.ignoreDirective)]),
  )
  return issues.filter(
    (issue) => !ignoredByFile.get(issue.file)?.has(`${issue.ruleId}:${issue.line}`),
  )
}

function hasMathSupport(code: string, engine: AccessiblePdfEngine) {
  return (
    /math\/setup\s*=\s*\{?[^},]*(?:mathml-SE|mathml-AF)/i.test(code) ||
    (engine === 'lualatex' && /\\usepackage(?:\[[^\]]*\])?\{unicode-math\}/.test(code))
  )
}

function contentReviewIssues(
  path: string,
  source: string,
  masked: string,
  engine: AccessiblePdfEngine,
  projectMathSupport: boolean,
  projectTableHeaders: boolean,
) {
  const issues: AccessiblePdfPreflightIssue[] = []
  const mathSupported = projectMathSupport || hasMathSupport(masked, engine)
  if (!mathSupported && sourceHasMath(masked)) {
    const offset = Math.max(
      0,
      masked.search(/\$|\\\(|\\\[|\\begin\{(?:equation|align|gather|multline|math|displaymath)/),
    )
    issues.push({
      code: 'math-structure-review',
      file: path,
      kind: 'review',
      line: lineAt(source, offset),
      ruleId: accessiblePdfRuleId('math-structure-review'),
    })
  }

  const hasTableHeaders = projectTableHeaders || /table\/header-rows\s*=/.test(masked)
  if (!hasTableHeaders && masked.includes(TABULAR)) {
    issues.push({
      code: 'table-headers-review',
      file: path,
      kind: 'review',
      line: lineAt(source, masked.indexOf(TABULAR)),
      ruleId: accessiblePdfRuleId('table-headers-review'),
    })
  }
  issues.push(
    ...accessibilityReviewIssues(path, source, masked).map(
      ({ offset: _offset, length: _length, ...issue }) => issue,
    ),
  )
  return issues
}

function diagnosticMessage(issue: AccessiblePdfPreflightIssue) {
  switch (issue.code) {
    case 'document-class-compatibility':
      return `Document class '${issue.documentClass}' has ${issue.support} tagged-PDF support. Review the exported structure carefully.`
    case 'figure-alt-review':
      return 'This image has no alt, actualtext, or artifact option. Describe its purpose or mark it as decorative.'
    case 'heading-order-review':
      return 'This heading skips a structural level. Confirm that the heading hierarchy matches the document outline.'
    case 'incomplete-metadata':
      return `Accessible PDF metadata is incomplete: add ${issue.missing?.join(
        ', ',
      )}. The exporter leaves an existing \\DocumentMetadata declaration unchanged.`
    case 'math-structure-review':
      return 'Math is present, but a MathML tagging path was not found. Confirm Formula and MathML structure after export.'
    case 'link-purpose-review':
      return 'This link text is generic. Confirm its purpose is clear in context or use a more descriptive label.'
    case 'table-headers-review':
      return 'This document has a table but no table/header-rows setting. If it contains data, identify its header rows for assistive technology.'
    case 'xelatex-compatibility':
      return 'XeLaTeX is not in the current LaTeX Tagged PDF Project recommended engine path. Prefer LuaLaTeX when the document permits it.'
  }
}

export function accessiblePdfSourceDiagnostics(
  files: Readonly<Record<string, string | Uint8Array>>,
  options: AccessiblePdfSourceOptions = {},
): Diagnostic[] {
  return projectSourceIssues(files, options).map((issue) => ({
    code: issue.ruleId,
    column: 1,
    endColumn: 2,
    file: issue.file,
    line: issue.line,
    message: diagnosticMessage(issue),
    severity: issue.kind === 'fix' ? 'warning' : 'info',
  }))
}

export function buildAccessiblePdfPreflight(input: {
  readonly engine: AccessiblePdfEngine
  readonly snapshot: AccessiblePdfProject
  readonly ignoreDirective?: string
}): AccessiblePdfPreflight {
  const issues = projectSourceIssues(input.snapshot.files, {
    engine: input.engine,
    mainFile: input.snapshot.mainFile,
    ...(input.ignoreDirective ? { ignoreDirective: input.ignoreDirective } : {}),
  })
  const mainSource = input.snapshot.files[input.snapshot.mainFile]
  const engine = resolvedPreflightEngine(
    input.engine,
    typeof mainSource === 'string' ? mainSource : '',
  )
  if (engine === 'xelatex') {
    issues.push({
      code: 'xelatex-compatibility',
      file: input.snapshot.mainFile,
      kind: 'compatibility',
      line: 1,
      ruleId: accessiblePdfRuleId('xelatex-compatibility'),
    })
  }
  return {
    issues,
    summary: {
      compatibility: issues.filter((issue) => issue.kind === 'compatibility').length,
      fix: issues.filter((issue) => issue.kind === 'fix').length,
      review: issues.filter((issue) => issue.kind === 'review').length,
    },
  }
}
