import type { CompletionResolverEnvironment } from './completion-registry'
import type { NeutralCompletionItem, NeutralRange } from './protocol'
import type { TexSemanticColor, TexSemanticShard } from './semantic-catalog'
import type { ColorDefinition } from './types'

interface ColorCandidate {
  name: string
  kind: 'define' | 'provide' | 'alias'
  model?: string
  value?: string
  alias?: string
  source: string
  confidence: string
  priority: number
}

const XCOLOR_BASE = [
  ['black', 'gray', '0'],
  ['blue', 'rgb', '0,0,1'],
  ['brown', 'rgb', '.75,.5,.25'],
  ['cyan', 'rgb', '0,1,1'],
  ['darkgray', 'gray', '.25'],
  ['gray', 'gray', '.5'],
  ['green', 'rgb', '0,1,0'],
  ['lightgray', 'gray', '.75'],
  ['lime', 'rgb', '.75,1,0'],
  ['magenta', 'rgb', '1,0,1'],
  ['olive', 'rgb', '.5,.5,0'],
  ['orange', 'rgb', '1,.5,0'],
  ['pink', 'rgb', '1,.75,.75'],
  ['purple', 'rgb', '.75,0,.25'],
  ['red', 'rgb', '1,0,0'],
  ['teal', 'rgb', '0,.5,.5'],
  ['violet', 'rgb', '.5,0,.5'],
  ['white', 'gray', '1'],
  ['yellow', 'rgb', '1,1,0'],
] as const

const COLOR_BASE = new Set(['black', 'blue', 'cyan', 'green', 'magenta', 'red', 'white', 'yellow'])

function fallbackColors(xcolor: boolean): ColorCandidate[] {
  return XCOLOR_BASE.filter(([name]) => xcolor || COLOR_BASE.has(name)).map(
    ([name, model, value]) => ({
      name,
      kind: 'define',
      model,
      value,
      source: xcolor ? 'WasmTex xcolor baseline' : 'WasmTex color baseline',
      confidence: 'exact',
      priority: -1,
    }),
  )
}

function semanticCandidate(shard: TexSemanticShard, color: TexSemanticColor): ColorCandidate {
  const source = color.provenance
    .map((entry) => `${entry.sourcePath}${entry.line ? `:${entry.line}` : ''}`)
    .join(', ')
  return {
    name: color.name,
    kind: color.kind,
    ...(color.model ? { model: color.model } : {}),
    ...(color.value ? { value: color.value } : {}),
    ...(color.alias ? { alias: color.alias } : {}),
    source: source || shard.scope.id,
    confidence: color.confidence,
    priority: color.priority ?? 0,
  }
}

function projectCandidate(color: ColorDefinition): ColorCandidate {
  const runtime = color.provenance === 'runtime-observed'
  return {
    name: color.name,
    kind: color.kind,
    ...(color.model ? { model: color.model } : {}),
    ...(color.value ? { value: color.value } : {}),
    ...(color.alias ? { alias: color.alias } : {}),
    source: `${color.location.file}:${color.location.line}`,
    confidence: runtime ? 'runtime-observed' : 'project',
    priority: runtime ? 50 : 100,
  }
}

function applyColor(target: Map<string, ColorCandidate>, candidate: ColorCandidate): void {
  if (candidate.kind === 'provide' && target.has(candidate.name)) return
  target.set(candidate.name, candidate)
}

function availableColor(
  color: TexSemanticColor,
  shard: TexSemanticShard,
  environment: CompletionResolverEnvironment,
): boolean {
  const required = color.availability?.anyOptions
  const deferred = color.availability?.deferredOptions
  if ((!required || required.length === 0) && (!deferred || deferred.length === 0)) return true
  const options = new Set([
    ...environment.index.getClassOptions(environment.document.path),
    ...environment.index.getPackageOptions(shard.scope.name, environment.document.path),
  ])
  if (required?.some((option) => options.has(option))) return true
  return (
    deferred?.some((option) => options.has(option)) === true &&
    environment.index.getActiveColorNames(environment.document.path).has(color.name)
  )
}

function collectColors(
  environment: CompletionResolverEnvironment,
  shards: TexSemanticShard[],
): Map<string, ColorCandidate> {
  const loaded = environment.index.getLoadedPackages(environment.document.path)
  const colors = new Map<string, ColorCandidate>()
  const hasXcolor =
    loaded.has('xcolor') || shards.some((shard) => shard.scope.id === 'package/xcolor')
  if (hasXcolor || loaded.has('color')) {
    for (const color of fallbackColors(hasXcolor)) applyColor(colors, color)
  }
  const semantic = shards
    .flatMap((shard) =>
      shard.colors
        .filter((color) => availableColor(color, shard, environment))
        .map((color) => semanticCandidate(shard, color)),
    )
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
  for (const color of semantic) applyColor(colors, color)
  for (const color of environment.index.getActiveColors(environment.document.path)) {
    applyColor(colors, projectCandidate(color))
  }
  return colors
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function rgbCss(values: number[]): string | null {
  if (values.length < 3 || values.slice(0, 3).some((value) => !Number.isFinite(value))) return null
  return `#${values
    .slice(0, 3)
    .map((value) => clampByte(value).toString(16).padStart(2, '0'))
    .join('')}`
}

function directCss(model: string | undefined, value: string | undefined): string | null {
  if (!model || !value) return null
  if (model.toUpperCase() === 'HTML' && /^[a-f0-9]{6}$/i.test(value)) {
    return `#${value.toLowerCase()}`
  }
  const values = value.split(',').map(Number)
  if (model === 'rgb') return rgbCss(values.map((component) => component * 255))
  if (model === 'RGB') return rgbCss(values)
  if (model === 'gray' && Number.isFinite(values[0])) {
    return rgbCss([values[0]! * 255, values[0]! * 255, values[0]! * 255])
  }
  if (model === 'cmyk' && values.length >= 4) {
    const [c, m, y, k] = values
    return rgbCss([
      255 * (1 - Math.min(1, c! + k!)),
      255 * (1 - Math.min(1, m! + k!)),
      255 * (1 - Math.min(1, y! + k!)),
    ])
  }
  return null
}

function cssComponents(css: string | null): number[] | null {
  if (!css || !/^#[a-f0-9]{6}$/i.test(css)) return null
  return [1, 3, 5].map((offset) => Number.parseInt(css.slice(offset, offset + 2), 16))
}

function expressionCss(
  expression: string,
  colors: Map<string, ColorCandidate>,
  seen: Set<string>,
): string | null {
  const parts = expression.split('!')
  const complemented = parts[0]!.startsWith('-')
  const baseName = parts[0]!.replace(/^-/, '').trim()
  const base = colors.get(baseName)
  let components = cssComponents(base ? colorCss(base, colors, seen) : null)
  if (!components) return null
  if (complemented) components = components.map((value) => 255 - value)
  for (let index = 1; index < parts.length; index += 2) {
    const percentage = Number(parts[index])
    if (!Number.isFinite(percentage)) return null
    const targetName = parts[index + 1]?.trim() || 'white'
    const target = colors.get(targetName)
    const targetComponents = cssComponents(target ? colorCss(target, colors, seen) : null)
    if (!targetComponents) return null
    const weight = Math.max(0, Math.min(100, percentage)) / 100
    components = components.map(
      (value, component) => value * weight + targetComponents[component]! * (1 - weight),
    )
  }
  return rgbCss(components)
}

function colorCss(
  candidate: ColorCandidate,
  colors: Map<string, ColorCandidate>,
  seen = new Set<string>(),
): string | null {
  const direct = directCss(candidate.model, candidate.value)
  if (direct || !candidate.alias || seen.has(candidate.name)) return direct
  seen.add(candidate.name)
  return expressionCss(candidate.alias, colors, seen)
}

function expressionTarget(environment: CompletionResolverEnvironment): {
  prefix: string
  range: NeutralRange
} {
  const line = environment.document.lineAt(environment.position.line)
  const cursor = Math.max(0, environment.position.column - 1)
  const delimiter = /[!\s{},=[\]]/
  let start = Math.min(cursor, line.length)
  let end = start
  while (start > 0 && !delimiter.test(line[start - 1]!)) start--
  while (end < line.length && !delimiter.test(line[end]!)) end++
  if (line[start] === '-') start++
  return {
    prefix: line.slice(start, cursor),
    range: {
      startLine: environment.position.line,
      startColumn: start + 1,
      endLine: environment.position.line,
      endColumn: end + 1,
    },
  }
}

function colorDocumentation(color: ColorCandidate): string {
  const definition = color.alias
    ? `Alias: \`${color.alias}\``
    : [color.model, color.value].filter(Boolean).join(' ')
  return [definition, `Source: \`${color.source}\``, `Confidence: ${color.confidence}`]
    .filter(Boolean)
    .join('\n\n')
}

export function completeColors(
  environment: CompletionResolverEnvironment,
  shards: TexSemanticShard[],
): NeutralCompletionItem[] {
  const target = expressionTarget(environment)
  const colors = collectColors(environment, shards)
  return [...colors.values()]
    .filter((color) => color.name.startsWith(target.prefix))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((color) => {
      const css = colorCss(color, colors)
      return {
        label: color.name,
        kind: 'variable',
        insertText: color.name,
        detail: color.alias ? `Color alias · ${color.source}` : `Color · ${color.source}`,
        documentation: colorDocumentation(color),
        replaceLength: target.prefix.length,
        replacementRange: target.range,
        data: {
          wasmtex: {
            domain: 'color',
            ...(css ? { color: { css } } : {}),
            provenance: { source: color.source, confidence: color.confidence },
          },
        },
      } satisfies NeutralCompletionItem
    })
}
