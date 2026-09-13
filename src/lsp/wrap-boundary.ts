import type { LatexFileSyntax, LatexMathRegion, LatexSyntaxRange } from '../syntax'
import { type CompletionCommandMetadataProvider, parseInvocation } from './completion-context'
import type { CompletionCancellationToken } from './completion-registry'
import { getCommandByName } from './latex-commands'
import { type Token, tokenize } from './latex-tokenizer'
import { getCommandSignature } from './package-db'
import type { getStructuralSelectionIndex } from './structural-selection'
import type { WrapDefinition } from './wrap-catalog'

export type WrapRefusal =
  | 'invalid-range'
  | 'unsafe-boundary'
  | 'unsupported-context'
  | 'unknown-wrapper'
  | 'missing-argument'
  | 'invalid-argument'
  | 'cancelled'
  | 'limit'
export type WrapBoundaryResult =
  | { ok: true; context: 'text' | 'math' }
  | { ok: false; reason: WrapRefusal }
const overlaps = (a: number, b: number, range: LatexSyntaxRange) =>
  a < range.endOffset && b > range.startOffset
const inside = (a: number, b: number, range: LatexSyntaxRange) =>
  a >= range.startOffset && b <= range.endOffset
const contains = (a: number, b: number, range: LatexSyntaxRange) =>
  a <= range.startOffset && b >= range.endOffset
const crosses = (a: number, b: number, range: LatexSyntaxRange) =>
  overlaps(a, b, range) && !inside(a, b, range) && !contains(a + 1, b - 1, range)
type SelectionIndex = NonNullable<ReturnType<typeof getStructuralSelectionIndex>>
type Invocation = NonNullable<ReturnType<typeof parseInvocation>>

export function wrapBoundary(
  source: string,
  range: LatexSyntaxRange,
  syntax: LatexFileSyntax | null,
  index: SelectionIndex | undefined,
  metadata: CompletionCommandMetadataProvider,
  wrappers: readonly WrapDefinition[],
  blockedCommands: ReadonlySet<string>,
  cancellation?: CompletionCancellationToken,
): WrapBoundaryResult {
  if (cancellation?.isCancellationRequested) return { ok: false, reason: 'cancelled' }
  if (!validRange(source, range)) return { ok: false, reason: 'invalid-range' }
  if (source.length > 1_000_000 || range.endOffset - range.startOffset > 65_536)
    return { ok: false, reason: 'limit' }
  if (!syntax || !index || index.excluded.some(([a, b]) => overlaps(a, b, range)))
    return { ok: false, reason: 'unsafe-boundary' }
  const mode = selectionMode(syntax, range)
  if (!mode.ok) return mode
  const validator = new WrapBoundaryValidator(
    source,
    range,
    index,
    metadata,
    wrappers,
    mode.context,
    blockedCommands,
    syntax.mathRegions,
  )
  const reason = validator.check(cancellation)
  return reason ? { ok: false, reason } : mode
}

function validRange(source: string, { startOffset: start, endOffset: end }: LatexSyntaxRange) {
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    start < end &&
    end <= source.length &&
    !splitsSurrogate(source, start) &&
    !splitsSurrogate(source, end)
  )
}

function selectionMode(syntax: LatexFileSyntax, range: LatexSyntaxRange): WrapBoundaryResult {
  let context: 'math' | 'text' = 'text'
  for (const math of syntax.mathRegions) {
    if (!overlaps(math.fullRange.startOffset, math.fullRange.endOffset, range)) continue
    if (
      !math.closed ||
      !contains(math.contentRange.startOffset, math.contentRange.endOffset, range)
    )
      return { ok: false, reason: 'unsupported-context' }
    context = 'math'
  }
  if (context === 'math' && !completeNotationBoundaries(syntax, range))
    return { ok: false, reason: 'unsafe-boundary' }
  return { ok: true, context }
}

function completeNotationBoundaries(syntax: LatexFileSyntax, range: LatexSyntaxRange): boolean {
  return syntax.nodes.every((node) => {
    const full = node.ranges.full
    if (!overlaps(full.startOffset, full.endOffset, range)) return true
    if (node.state !== 'complete' || node.provenance?.editable === false) return false
    if (node.kind !== 'script' && node.kind !== 'delimiter') return true
    if (inside(full.startOffset, full.endOffset, range)) return true
    return node.children.some((id) => {
      const child = syntax.nodes[id]
      if (!child || !contains(child.ranges.full.startOffset, child.ranges.full.endOffset, range))
        return false
      return (
        node.kind !== 'script' ||
        child.kind === 'group' ||
        child.ranges.full === node.ranges.nucleus ||
        (child.ranges.full.startOffset === node.ranges.nucleus?.startOffset &&
          child.ranges.full.endOffset === node.ranges.nucleus.endOffset)
      )
    })
  })
}

class WrapBoundaryValidator {
  private environments: Array<{ name: string; start: number; body: number; supported: boolean }> =
    []
  private closes: Set<number>
  constructor(
    private source: string,
    private range: LatexSyntaxRange,
    private index: SelectionIndex,
    private metadata: CompletionCommandMetadataProvider,
    private wrappers: readonly WrapDefinition[],
    private context: 'text' | 'math',
    private blockedCommands: ReadonlySet<string>,
    private mathRegions: readonly LatexMathRegion[],
  ) {
    this.closes = new Set(index.groups.values())
  }

  check(cancellation?: CompletionCancellationToken): WrapRefusal | null {
    for (const token of tokenize(this.source)) {
      if (cancellation?.isCancellationRequested) return 'cancelled'
      if (this.index.masked[token.start] === ' ' && token.type !== 'text') continue
      const reason = this.checkToken(token)
      if (reason) return reason
    }
    return this.environments.length ? 'unsafe-boundary' : null
  }

  private checkToken(token: Token): WrapRefusal | null {
    if (token.type === 'open') {
      const close = this.index.groups.get(token.start)
      return close === undefined || crosses(token.start, close + 1, this.range)
        ? 'unsafe-boundary'
        : null
    }
    if (token.type === 'close') return this.closes.has(token.start) ? null : 'unsafe-boundary'
    if (token.type !== 'command') return null
    if (overlaps(token.start, token.end, this.range) && !inside(token.start, token.end, this.range))
      return 'unsafe-boundary'
    const invocation = parseInvocation(
      this.index.masked,
      token,
      this.metadata,
      (_text, open, balancedOptional = false) => {
        const close = (balancedOptional ? this.index.balancedGroups : this.index.groups).get(open)
        return close === undefined
          ? { closed: false, contentEnd: this.source.length, end: this.source.length }
          : { closed: true, contentEnd: close, end: close + 1 }
      },
    )
    if (token.value === 'begin' || token.value === 'end')
      return this.checkEnvironment(token, invocation)
    return this.checkCommand(token, invocation)
  }

  private checkEnvironment(token: Token, invocation: Invocation | null): WrapRefusal | null {
    const group = invocation?.groups[0]
    if (!group?.closed) return 'unsafe-boundary'
    const name = this.source.slice(group.contentStart, group.contentEnd)
    if (!/^[A-Za-z0-9@:_*-]+$/.test(name)) return 'unsafe-boundary'
    if (overlaps(token.start, group.end, this.range) && !inside(token.start, group.end, this.range))
      return 'unsafe-boundary'
    if (name === 'document' && overlaps(token.start, group.end, this.range))
      return 'unsupported-context'
    if (token.value === 'begin') {
      this.environments.push({
        name,
        start: token.start,
        body: group.end,
        supported: name !== 'aligned' || invocation?.groups[1]?.delimiter !== 'optional',
      })
      return null
    }
    return this.checkEnvironmentEnd(token, name, group.end)
  }

  private checkEnvironmentEnd(token: Token, name: string, end: number): WrapRefusal | null {
    const begin = this.environments.pop()
    if (!begin || begin.name !== name) return 'unsafe-boundary'
    if (!overlaps(begin.start, end, this.range)) return null
    if (!begin.supported || !this.environmentContextMatches(name, begin.body, token.start))
      return 'unsupported-context'
    return inside(begin.start, end, this.range) || contains(begin.body, token.start, this.range)
      ? null
      : 'unsafe-boundary'
  }

  private environmentContextMatches(name: string, body: number, end: number): boolean {
    if (name === 'document') return true
    const wrapper = this.wrappers.find(
      (wrapper) => wrapper.kind === 'environment' && wrapper.name === name,
    )
    if (!wrapper) return false
    if (wrapper.bodyContext === this.context) return true
    return (
      wrapper.bodyContext === 'text' &&
      this.mathRegions.some(
        (region) =>
          region.closed &&
          region.fullRange.startOffset >= body &&
          region.fullRange.endOffset <= end &&
          contains(region.contentRange.startOffset, region.contentRange.endOffset, this.range),
      )
    )
  }

  private checkCommand(token: Token, invocation: Invocation | null): WrapRefusal | null {
    const end = token.end + (this.index.masked[token.end] === '*' ? 1 : 0)
    const name = `${token.value}${end > token.end ? '*' : ''}`
    const relevant =
      invocation?.groups.filter((group) => overlaps(group.open, group.end, this.range)) ?? []
    const selected = inside(token.start, end, this.range)
    if (!selected && !relevant.length) return this.checkAdjacentArgument(token, name, invocation)
    if (this.blockedCommands.has(token.value)) return 'unsafe-boundary'
    const signature = this.metadata.getCommandArguments(name) ?? getCommandSignature(name)
    if (!signature || (!signature.length && !getCommandByName(name))) return 'unsafe-boundary'
    if (!selected) return this.checkContainer(name, relevant)
    const groups = invocation?.groups.filter((group) => group.signatureIndex !== undefined) ?? []
    const next = (groups.at(-1)?.signatureIndex ?? -1) + 1
    if (groups.some((group) => !group.closed || !inside(group.open, group.end, this.range)))
      return 'unsafe-boundary'
    return signature.slice(next).some((arg) => arg.kind === 'required') ? 'unsafe-boundary' : null
  }

  private checkAdjacentArgument(
    token: Token,
    name: string,
    invocation: Invocation | null,
  ): WrapRefusal | null {
    if (invocation || token.end > this.range.startOffset) return null
    const gap = this.source.slice(token.end, this.range.startOffset)
    if (gap.trim()) return null
    if (this.blockedCommands.has(token.value)) return 'unsafe-boundary'
    const signature = this.metadata.getCommandArguments(name) ?? getCommandSignature(name)
    return !signature || signature.some((argument) => argument.kind === 'required')
      ? 'unsafe-boundary'
      : null
  }

  private checkContainer(name: string, groups: Invocation['groups']): WrapRefusal | null {
    const group = groups.find((group) => contains(group.contentStart, group.contentEnd, this.range))
    const owner = this.wrappers.find(
      (wrapper) => wrapper.kind === 'command' && wrapper.name === name,
    )
    if (!group?.closed || group.signatureIndex === undefined || !owner) return 'unsupported-context'
    if (group.spec.valueKind && group.spec.valueKind !== 'free-text') return 'unsupported-context'
    return owner.context === this.context ? null : 'unsupported-context'
  }
}

function splitsSurrogate(source: string, offset: number): boolean {
  const before = source.charCodeAt(offset - 1)
  const after = source.charCodeAt(offset)
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff
}
