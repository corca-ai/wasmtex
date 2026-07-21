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

function runRule(ctx: LintContext, id: LintRuleId): RawDiagnostic[] {
  if (id === 'display-math-dollars') return displayMathDollars(ctx)
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
