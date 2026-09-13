import { type LatexFileSyntax, type LatexSyntaxRange, LatexSyntaxService } from '../syntax'
import { readBalancedGroup } from './balanced-group'
import type { CompletionCommandMetadataProvider } from './completion-context'
import type { CompletionCancellationToken } from './completion-registry'
import type { CommandArg } from './package-db'
import type { ProjectIndex } from './project-index'
import { getStructuralSelectionIndex } from './structural-selection'
import { type WrapRefusal, wrapBoundary } from './wrap-boundary'
import { activeWrapDefinitions, type LatexWrapOption, publicWrapOption } from './wrap-catalog'

export type { WrapRefusal } from './wrap-boundary'
export type { LatexWrapOption } from './wrap-catalog'
export interface LatexWrapRequest {
  range: LatexSyntaxRange
  kind: 'command' | 'environment'
  name: string
  /** Signature-indexed values. The selection slot must be null; omitted optional slots are null. */
  arguments: readonly (string | null)[]
}
export interface LatexWrapEdit {
  range: LatexSyntaxRange
  expectedText: string
  newText: string
}
export type LatexWrapOptionsResult =
  | { ok: true; options: LatexWrapOption[] }
  | { ok: false; reason: WrapRefusal }
export type LatexWrapPlanResult =
  | { ok: true; edit: LatexWrapEdit }
  | { ok: false; reason: WrapRefusal }
export interface WrapSource {
  source: string
  syntax: LatexFileSyntax | null
  index: ProjectIndex
  path: string
  metadata: CompletionCommandMetadataProvider
}

export function getWrapOptions(
  input: WrapSource,
  range: LatexSyntaxRange,
  cancellation?: CompletionCancellationToken,
): LatexWrapOptionsResult {
  const definitions = activeWrapDefinitions(input.index, input.path)
  const boundary = wrapBoundary(
    input.source,
    range,
    input.syntax,
    getStructuralSelectionIndex(input.index.getFileSymbols(input.path)),
    input.metadata,
    definitions,
    new Set(input.index.getCommandDefs(input.path).map((definition) => definition.name)),
    cancellation,
  )
  if (!boundary.ok) return boundary
  const groups = getStructuralSelectionIndex(input.index.getFileSymbols(input.path))?.groups
  const inGroup =
    groups &&
    [...groups].some(([open, close]) => open < range.startOffset && close >= range.endOffset)
  const hasEnvironment = getStructuralSelectionIndex(
    input.index.getFileSymbols(input.path),
  )?.commands.some(
    (token) =>
      (token.value === 'begin' || token.value === 'end') &&
      token.start >= range.startOffset &&
      token.start < range.endOffset,
  )
  const hasAlignment = input.syntax?.nodes.some(
    (node) =>
      node.kind === 'alignment' &&
      node.ranges.full.startOffset < range.endOffset &&
      node.ranges.full.endOffset > range.startOffset,
  )
  const options = definitions
    .filter(
      (definition) =>
        definition.context === boundary.context &&
        !(inGroup && definition.kind === 'environment' && boundary.context === 'text') &&
        (definition.kind !== 'command' ||
          (!hasEnvironment &&
            !hasAlignment &&
            !/\n\s*\n/.test(input.source.slice(range.startOffset, range.endOffset)))),
    )
    .map(publicWrapOption)
  return { ok: true, options }
}

export function planWrapSelection(
  input: WrapSource,
  request: LatexWrapRequest,
  cancellation?: CompletionCancellationToken,
): LatexWrapPlanResult {
  const result = getWrapOptions(input, request.range, cancellation)
  if (!result.ok) return result
  const option = result.options.find(
    (option) => option.kind === request.kind && option.name === request.name,
  )
  if (!option) return { ok: false, reason: 'unknown-wrapper' }
  if (request.arguments.length !== option.arguments.length)
    return { ok: false, reason: 'missing-argument' }
  const selected = input.source.slice(request.range.startOffset, request.range.endOffset)
  if (option.kind === 'environment' && option.name === 'equation') {
    const reason = validateArgumentSource(input, selected, true, cancellation)
    if (reason) return { ok: false, reason }
  }
  const argumentsResult = renderArguments(input, option, request.arguments, selected, cancellation)
  if (!argumentsResult.ok) return argumentsResult
  const newText =
    option.kind === 'command'
      ? `\\${option.name}${argumentsResult.text}`
      : `\\begin{${option.name}}${argumentsResult.text}\n${selected}\n\\end{${option.name}}`
  if (cancellation?.isCancellationRequested) return { ok: false, reason: 'cancelled' }
  return { ok: true, edit: { range: { ...request.range }, expectedText: selected, newText } }
}

type RenderedArgument = { ok: true; text: string } | { ok: false; reason: WrapRefusal }

function renderArguments(
  input: WrapSource,
  option: LatexWrapOption,
  values: readonly (string | null)[],
  selected: string,
  cancellation?: CompletionCancellationToken,
): RenderedArgument {
  let text = ''
  for (const [index, argument] of option.arguments.entries()) {
    const result =
      index === option.selectionArgument
        ? values[index] === null
          ? { ok: true as const, text: `{${selected}}` }
          : { ok: false as const, reason: 'invalid-argument' as const }
        : renderExtraArgument(input, option, argument, values[index], cancellation)
    if (!result.ok) return result
    text += result.text
  }
  return { ok: true, text }
}

function renderExtraArgument(
  input: WrapSource,
  option: LatexWrapOption,
  argument: CommandArg,
  value: string | null | undefined,
  cancellation?: CompletionCancellationToken,
): RenderedArgument {
  if (value === null)
    return argument.kind === 'optional'
      ? { ok: true, text: '' }
      : { ok: false, reason: 'missing-argument' }
  if (typeof value !== 'string' || value.length > 16_384 || !value.trim())
    return { ok: false, reason: 'invalid-argument' }
  const text = argument.kind === 'optional' ? `[${value}]` : `{${value}}`
  const group = readBalancedGroup(text, 0, argument.balancedOptional)
  if (!group.closed || group.end !== text.length) return { ok: false, reason: 'invalid-argument' }
  const definitions = activeWrapDefinitions(input.index, input.path)
  const definition = definitions.find(
    (definition) => definition.kind === option.kind && definition.name === option.name,
  )
  const math = definition?.context === 'math'
  const reason = validateArgumentSource(input, value, math, cancellation)
  return reason ? { ok: false, reason } : { ok: true, text }
}

function validateArgumentSource(
  input: WrapSource,
  value: string,
  math: boolean,
  cancellation?: CompletionCancellationToken,
): WrapRefusal | null {
  const definitions = activeWrapDefinitions(input.index, input.path)
  const source = math ? `$${value}$` : value
  const syntaxService = new LatexSyntaxService()
  const syntax = syntaxService.upsert({
    fileId: 'argument',
    path: 'argument.tex',
    content: source,
    documentVersion: 1,
  })
  const index = getStructuralSelectionIndex(
    syntaxService.getProjectIndex().getFileSymbols('argument.tex'),
  )
  const boundary = wrapBoundary(
    source,
    { startOffset: math ? 1 : 0, endOffset: source.length - (math ? 1 : 0) },
    syntax,
    index,
    input.metadata,
    definitions,
    new Set(input.index.getCommandDefs(input.path).map((definition) => definition.name)),
    cancellation,
  )
  return boundary.ok ? null : boundary.reason === 'cancelled' ? 'cancelled' : 'invalid-argument'
}
