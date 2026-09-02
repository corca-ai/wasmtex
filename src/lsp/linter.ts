/**
 * ChkTeX-grade static linter: style/correctness warnings without compiling.
 *
 * Each rule is a pure function over the (comment/verbatim/math-aware) source.
 * Rules are individually toggleable with a configurable severity. Diagnostics
 * use codes distinct from the index-based diagnostics in `diagnostic-provider`,
 * so the two never double-report.
 */
import type { Diagnostic } from './diagnostic-provider'
import { maskSpansFromTokens } from './latex-parser'
import { type Token, tokenize } from './latex-tokenizer'
import { buildLineStarts, offsetToLineCol } from './source-position'

export type LintRuleId =
  | 'nbsp-before-ref'
  | 'space-before-punctuation'
  | 'doubled-space'
  | 'ellipsis'
  | 'straight-double-quotes'
  | 'display-math-dollars'
  | 'en-dash-range'
  | 'math-operator-as-text'
  | 'footnote-spacing'
  | 'abbreviation-spacing'
  | 'a11y-graphics-alt'
  | 'a11y-float-caption'
  | 'a11y-heading-skip'
  | 'a11y-pdf-metadata'

type Severity = 'error' | 'warning' | 'info'

export interface LintRuleConfig {
  enabled: boolean
  severity: Severity
}

export type LintConfig = Record<LintRuleId, LintRuleConfig>

/** Default configuration. Noisy rules (e.g. abbreviation spacing) ship disabled. */
export const DEFAULT_LINT_CONFIG: LintConfig = {
  'nbsp-before-ref': { enabled: true, severity: 'info' },
  'space-before-punctuation': { enabled: true, severity: 'warning' },
  'doubled-space': { enabled: true, severity: 'info' },
  ellipsis: { enabled: true, severity: 'info' },
  'straight-double-quotes': { enabled: true, severity: 'info' },
  'display-math-dollars': { enabled: true, severity: 'warning' },
  'en-dash-range': { enabled: true, severity: 'info' },
  'math-operator-as-text': { enabled: true, severity: 'warning' },
  'footnote-spacing': { enabled: true, severity: 'info' },
  'abbreviation-spacing': { enabled: false, severity: 'info' },
  // Accessibility (tagged PDF / PDF-UA) readiness. Info by default: they describe what a
  // screen reader will miss, not a typesetting fault; a host exporting accessible PDFs can
  // raise them to warnings.
  'a11y-graphics-alt': { enabled: true, severity: 'info' },
  'a11y-float-caption': { enabled: true, severity: 'info' },
  'a11y-heading-skip': { enabled: true, severity: 'info' },
  'a11y-pdf-metadata': { enabled: true, severity: 'info' },
}

interface RawDiagnostic {
  offset: number
  length: number
  message: string
}

interface LintContext {
  content: string
  tokens: Token[]
  isMasked: (offset: number) => boolean
  inMath: (offset: number) => boolean
}

// --- Math regions ------------------------------------------------------------

const MATH_ENVIRONMENTS = new Set([
  'math',
  'displaymath',
  'equation',
  'equation*',
  'align',
  'align*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'eqnarray',
  'eqnarray*',
  'flalign',
  'flalign*',
  'alignat',
  'alignat*',
])

/** Read the `{name}` after a `\begin`/`\end` command token at index i. */
function envNameAfter(tokens: Token[], i: number): string | null {
  let j = i + 1
  while (j < tokens.length && tokens[j]!.type === 'text' && tokens[j]!.value.trim() === '') j++
  if (tokens[j]?.type !== 'open') return null
  const name = tokens[j + 1]
  if (name?.type !== 'text' || tokens[j + 2]?.type !== 'close') return null
  return name.value.trim()
}

/** Compute the offset ranges that are in math mode (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`, math envs). */
function mathRegions(
  tokens: Token[],
  isMasked: (offset: number) => boolean,
): Array<[number, number]> {
  const regions: Array<[number, number]> = []
  const opens: Record<'dollar' | 'ddollar' | 'paren' | 'bracket', number> = {
    dollar: -1,
    ddollar: -1,
    paren: -1,
    bracket: -1,
  }
  const envStack: number[] = []
  const toggle = (key: 'dollar' | 'ddollar', end: number, start: number): void => {
    if (opens[key] < 0) opens[key] = end
    else {
      regions.push([opens[key], start])
      opens[key] = -1
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    // Skip math toggles inside non-code regions (verbatim bodies, false
    // conditionals) so they don't pollute math detection or desync the toggle.
    if (isMasked(t.start)) continue
    if (t.type === 'math') toggle(t.value === '$$' ? 'ddollar' : 'dollar', t.end, t.start)
    else if (t.type === 'command') handleMathCommand(t, tokens, i, opens, envStack, regions)
  }
  return regions
}

function handleMathCommand(
  t: Token,
  tokens: Token[],
  i: number,
  opens: Record<'dollar' | 'ddollar' | 'paren' | 'bracket', number>,
  envStack: number[],
  regions: Array<[number, number]>,
): void {
  if (t.value === '(') opens.paren = t.end
  else if (t.value === ')' && opens.paren >= 0) {
    regions.push([opens.paren, t.start])
    opens.paren = -1
  } else if (t.value === '[') opens.bracket = t.end
  else if (t.value === ']' && opens.bracket >= 0) {
    regions.push([opens.bracket, t.start])
    opens.bracket = -1
  } else if (t.value === 'begin' && isMathEnv(tokens, i)) envStack.push(t.end)
  else if (t.value === 'end' && isMathEnv(tokens, i)) {
    const start = envStack.pop()
    if (start !== undefined) regions.push([start, t.start])
  }
}

function isMathEnv(tokens: Token[], i: number): boolean {
  const name = envNameAfter(tokens, i)
  return name !== null && MATH_ENVIRONMENTS.has(name)
}

// --- Position helpers --------------------------------------------------------

function buildFlags(length: number, spans: Array<[number, number]>): Uint8Array {
  const flags = new Uint8Array(length)
  for (const [start, end] of spans) {
    for (let i = start; i < end && i < length; i++) flags[i] = 1
  }
  return flags
}

// --- Rules -------------------------------------------------------------------

// A trailing `\b` after `cite` is a boundary between two word chars in `\citep`, so a bare
// `cite\b` never matches the natbib/biblatex variants (\citep, \citet, \autocite, …). List
// the visible cite family explicitly (nocite produces no text, so a space before it is fine)
// and anchor each alternative with its own `\b`.
const REF_CITE = String.raw`\\(?:ref|eqref|pageref|cref|Cref|autoref|vref|cite|citep|citet|parencite|textcite|autocite)\b`
const MATH_OPERATORS =
  'sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|log|ln|exp|lim|max|min|sup|inf|det|gcd|arg|dim|deg|ker|hom'

/**
 * A regex-driven rule. The pattern is written so the reported span begins at the
 * match start (lookbehind keeps preceding context out of the match). `inMath`
 * controls whether matches inside math mode are kept (`'only'`), dropped
 * (`'exclude'`, the default), or unaffected (`'any'`).
 */
interface TextRule {
  id: LintRuleId
  re: RegExp
  length: (m: RegExpMatchArray) => number
  message: (m: RegExpMatchArray) => string
  inMath?: 'only' | 'exclude' | 'any'
}

const len1 = (): number => 1
const group1Len = (m: RegExpMatchArray): number => m[1]!.length

const TEXT_RULES: TextRule[] = [
  {
    id: 'nbsp-before-ref',
    re: new RegExp(String.raw`(?<=\S)( )${REF_CITE}`, 'g'),
    length: len1,
    message: () => 'Use a non-breaking space (~) before \\ref/\\cite to avoid a line break.',
  },
  {
    id: 'space-before-punctuation',
    re: /(?<=\w)( +)([,;:!?])/g,
    length: group1Len,
    message: (m) => `Remove the space before '${m[2]}'.`,
  },
  {
    id: 'doubled-space',
    re: /(?<=\S)( {2,})/g,
    length: group1Len,
    message: () => 'Multiple consecutive spaces collapse to one; remove the extras.',
  },
  {
    id: 'ellipsis',
    re: /\.\.\./g,
    length: () => 3,
    message: () => "Use \\dots (or \\ldots) instead of '...'.",
  },
  {
    id: 'straight-double-quotes',
    // Escaped iff preceded by an ODD run of backslashes; an even run (`\\"`) is a real quote.
    re: /(?<!(?<!\\)(?:\\\\)*\\)"/g,
    length: len1,
    message: () => "Use LaTeX quotes (`` and '') instead of a straight double quote.",
  },
  {
    id: 'en-dash-range',
    // A range is exactly two numbers; a date/ISBN/phone has 3+ hyphen-joined segments, so
    // require no adjacent digit-or-hyphen on either flank (rules those multi-segment ids out).
    re: /(?<=(?<![\d-])\d{1,4})-(?=\d{1,4}(?![\d-]))/g,
    length: len1,
    message: () => 'Use an en-dash (--) for number ranges.',
  },
  {
    id: 'footnote-spacing',
    re: /(?<=\w)( +)(\\footnote\b)/g,
    length: group1Len,
    message: () => 'Remove the space before \\footnote so it attaches to the word.',
  },
  {
    id: 'abbreviation-spacing',
    re: /(e\.g\.|i\.e\.)(?= )/g,
    length: group1Len,
    message: (m) => `Follow '${m[1]}' with '\\ ' or '~' to avoid an inter-sentence space.`,
  },
  {
    id: 'math-operator-as-text',
    re: new RegExp(String.raw`(?<![\\a-zA-Z])(${MATH_OPERATORS})(?![a-zA-Z])`, 'g'),
    length: group1Len,
    message: (m) => `Use \\${m[1]} instead of '${m[1]}' in math mode.`,
    inMath: 'only',
  },
]

/** Run a regex-driven rule, honoring its masking and math-mode policy. */
function runTextRule(ctx: LintContext, rule: TextRule): RawDiagnostic[] {
  const policy = rule.inMath ?? 'exclude'
  const out: RawDiagnostic[] = []
  for (const m of ctx.content.matchAll(rule.re)) {
    const offset = m.index ?? 0
    if (ctx.isMasked(offset)) continue
    const math = ctx.inMath(offset)
    if ((policy === 'exclude' && math) || (policy === 'only' && !math)) continue
    out.push({ offset, length: rule.length(m), message: rule.message(m) })
  }
  return out
}

/** Token-driven rule: flag the opening `$$` of each display-math block. */
function displayMathDollars(ctx: LintContext): RawDiagnostic[] {
  const out: RawDiagnostic[] = []
  let open = true
  for (const t of ctx.tokens) {
    if (t.type !== 'math' || t.value !== '$$' || ctx.isMasked(t.start)) continue
    if (open) {
      out.push({
        offset: t.start,
        length: 2,
        message: 'Use \\[ … \\] instead of $$ … $$ for display math.',
      })
    }
    open = !open
  }
  return out
}

// --- Accessibility rules ------------------------------------------------------

/** `\includegraphics` whose options carry no `alt=`: the image will be tagged without a
 *  text alternative (graphicx ≥ 2021 supports `alt={…}` regardless of tagging). */
function graphicsAlt(ctx: LintContext): RawDiagnostic[] {
  const out: RawDiagnostic[] = []
  const content = ctx.content
  const command = '\\includegraphics'
  let from = 0
  for (;;) {
    const offset = content.indexOf(command, from)
    if (offset < 0) break
    from = offset + command.length
    if (ctx.isMasked(offset)) continue
    let cursor = from
    if (content[cursor] === '*') cursor++
    // The optional argument is read without a regex: a `[^\]]*` scan per occurrence is
    // quadratic on adversarial input (CodeQL js/polynomial-redos).
    if (content[cursor] === '[') {
      const close = content.indexOf(']', cursor + 1)
      if (close >= 0 && /(?:^|,)\s*alt\s*=/.test(content.slice(cursor + 1, close))) continue
    }
    out.push({
      offset,
      length: command.length,
      message:
        'Image has no text alternative; add alt={…} to \\includegraphics so screen readers can describe it.',
    })
  }
  return out
}

/** `figure`/`table` floats without a `\caption`: the tagged float has no accessible name. */
function floatCaption(ctx: LintContext): RawDiagnostic[] {
  const out: RawDiagnostic[] = []
  const re = /\\begin\{(figure|table)\*?\}/g
  for (const m of ctx.content.matchAll(re)) {
    const offset = m.index ?? 0
    if (ctx.isMasked(offset)) continue
    const env = m[1]!
    const endRe = new RegExp(String.raw`\\end\{${env}\*?\}`, 'g')
    endRe.lastIndex = offset
    const end = endRe.exec(ctx.content)
    const body = ctx.content.slice(offset, end ? end.index : undefined)
    if (/\\caption(?:of)?\b/.test(body)) continue
    out.push({
      offset,
      length: m[0].length,
      message: `This ${env} has no \\caption; tagged PDF readers announce floats by their caption.`,
    })
  }
  return out
}

const HEADING_LEVELS: Record<string, number> = {
  part: -1,
  chapter: 0,
  section: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
  subparagraph: 5,
}

/** A heading more than one level deeper than the previous one (e.g. `\section` straight to
 *  `\subsubsection`) breaks the outline that assistive technology navigates by. */
function headingSkip(ctx: LintContext): RawDiagnostic[] {
  const out: RawDiagnostic[] = []
  const re =
    /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?=[[{])/g
  let previous: number | null = null
  for (const m of ctx.content.matchAll(re)) {
    const offset = m.index ?? 0
    if (ctx.isMasked(offset)) continue
    const level = HEADING_LEVELS[m[1]!]!
    if (previous !== null && level > previous + 1) {
      out.push({
        offset,
        length: m[0].trimEnd().length,
        message: `Heading level skipped: \\${m[1]} follows a level-${previous} heading; use the next level down so the document outline stays navigable.`,
      })
    }
    previous = level
  }
  return out
}

/** Root files only: a PDF without a title or language is read out by file name and in the
 *  reader's default language. Satisfied by `\DocumentMetadata{lang=…}`, `\hypersetup{pdftitle/pdflang}`,
 *  or `\title{…}` (the tagging kernel and hyperref copy it into the PDF). */
function pdfMetadata(ctx: LintContext): RawDiagnostic[] {
  const content = ctx.content
  const cls = /\\documentclass\b/.exec(content)
  if (!cls || ctx.isMasked(cls.index)) return []
  const out: RawDiagnostic[] = []
  const hasTitle = /\\title(?:\[[^\]]*\])?\{|pdftitle ?=/.test(content)
  const hasLang = /\\DocumentMetadata\{[^}]*\blang ?=|pdflang ?=/.test(content)
  if (!hasTitle) {
    out.push({
      offset: cls.index,
      length: '\\documentclass'.length,
      message: 'The PDF will carry no title: add \\title{…} or \\hypersetup{pdftitle={…}}.',
    })
  }
  if (!hasLang) {
    out.push({
      offset: cls.index,
      length: '\\documentclass'.length,
      message:
        'The PDF will carry no language: add \\DocumentMetadata{lang=en-US} before \\documentclass or \\hypersetup{pdflang={en-US}}.',
    })
  }
  return out
}

function runRule(ctx: LintContext, id: LintRuleId): RawDiagnostic[] {
  if (id === 'display-math-dollars') return displayMathDollars(ctx)
  if (id === 'a11y-graphics-alt') return graphicsAlt(ctx)
  if (id === 'a11y-float-caption') return floatCaption(ctx)
  if (id === 'a11y-heading-skip') return headingSkip(ctx)
  if (id === 'a11y-pdf-metadata') return pdfMetadata(ctx)
  const rule = TEXT_RULES.find((r) => r.id === id)
  return rule ? runTextRule(ctx, rule) : []
}

/**
 * Lint a single LaTeX source string. Returns style/correctness diagnostics for
 * the enabled rules. `config` is per-rule merged over {@link DEFAULT_LINT_CONFIG}:
 * a partial rule override (e.g. `{ 'doubled-space': { severity: 'error' } }`)
 * keeps the rule's other default fields (here `enabled: true`) instead of
 * replacing the whole rule object.
 */
export function lintSource(
  content: string,
  filePath: string,
  config?: Partial<Record<LintRuleId, Partial<LintRuleConfig>>>,
): Diagnostic[] {
  // Per-rule deep merge: a top-level spread would let a partial `{ enabled: true }` drop the
  // default severity, or a partial `{ severity: 'error' }` drop `enabled: true` and silently
  // disable a default-on rule. Merge each present override onto its default fields instead.
  const merged: LintConfig = { ...DEFAULT_LINT_CONFIG }
  if (config) {
    for (const id of Object.keys(config) as LintRuleId[]) {
      const override = config[id]
      if (override) merged[id] = { ...DEFAULT_LINT_CONFIG[id], ...override }
    }
  }
  const tokens = tokenize(content)
  // Reuse `tokens` for masking — maskSpans(content) would tokenize the same source again.
  const maskedFlags = buildFlags(content.length, maskSpansFromTokens(tokens))
  const isMasked = (offset: number): boolean => maskedFlags[offset] === 1
  const mathFlags = buildFlags(content.length, mathRegions(tokens, isMasked))
  const ctx: LintContext = {
    content,
    tokens,
    isMasked,
    inMath: (o) => mathFlags[o] === 1,
  }

  const lineStarts = buildLineStarts(content)

  const diagnostics: Diagnostic[] = []
  for (const id of Object.keys(merged) as LintRuleId[]) {
    const rule = merged[id]
    if (!rule?.enabled) continue
    for (const raw of runRule(ctx, id)) {
      const { line, column } = offsetToLineCol(lineStarts, raw.offset)
      diagnostics.push({
        file: filePath,
        line,
        column,
        endColumn: column + raw.length,
        message: raw.message,
        severity: rule.severity,
        code: id,
      })
    }
  }
  return diagnostics
}
