/**
 * Editor-neutral provider cores (no Monaco import). These hold the actual
 * completion/hover/definition/reference logic; the Monaco adapter and the LSP
 * server are thin wrappers that convert these neutral results.
 */
import type { VirtualFS } from '../fs/virtual-fs'
import { registerBibCompletionResolvers } from './bib-completion'
import { formatReference } from './bib-parser'
import { completeColors } from './color-completion'
import {
  analyzeCompletionContext,
  type CommandArgumentCompletionContext,
  type CompletionContext,
} from './completion-context'
import {
  type CompletionCancellationToken,
  type CompletionResolverEnvironment,
  CompletionResolverRegistry,
} from './completion-registry'
import { completeProjectFiles } from './file-completion'
import {
  getCommandByName,
  getEnvironmentByName,
  LATEX_COMMANDS,
  LATEX_ENVIRONMENTS,
} from './latex-commands'
import { CITE_CMDS, COMMAND_TOKEN, REF_CMDS } from './latex-patterns'
import {
  type CompletionValueKind,
  formatSignature,
  getShardEnvironments,
  parseSignature,
} from './package-db'
import type { EngineCommandInfo, Occurrence, ProjectIndex } from './project-index'
import type {
  NeutralCompletionItem,
  NeutralCompletionList,
  NeutralDocument,
  NeutralHover,
  NeutralLocation,
  NeutralPosition,
} from './protocol'
import type {
  TexResourceCatalogProvider,
  TexResourceKind,
  TexResourceRecord,
} from './resource-catalog'
import {
  registerTexSemanticShard,
  type TexSemanticCatalogProvider,
  type TexSemanticKey,
  type TexSemanticShard,
  type TexSemanticValueType,
} from './semantic-catalog'
import { buildLineStarts, offsetToLineCol } from './source-position'
import type { ProjectKeyDefinition, ProjectValue } from './types'

// --- Completion context ------------------------------------------------------

type LegacyCompletionContextType =
  | 'command'
  | 'ref'
  | 'cite'
  | 'begin'
  | 'end'
  | 'usepackage'
  | 'include'

interface LegacyCompletionContext {
  type: LegacyCompletionContextType
  prefix: string
}

/**
 * Compatibility wrapper for the former line-only context API. New integrations should use
 * {@link analyzeCompletionContext}, which handles multiline invocations and exact ranges.
 */
export function detectCompletionContext(
  lineContent: string,
  column: number,
): LegacyCompletionContext | null {
  const context = analyzeCompletionContext(
    { path: '', getText: () => lineContent, lineAt: () => lineContent },
    { line: 1, column },
  )
  if (!context) return null
  if (context.type === 'command') return { type: 'command', prefix: context.prefix }
  if (context.type === 'bibtex') return null
  const type = legacyContextType(context)
  return type ? { type, prefix: context.prefix } : null
}

function legacyContextType(
  context: CommandArgumentCompletionContext,
): LegacyCompletionContextType | null {
  if (context.valueKind === 'label') return 'ref'
  if (context.valueKind === 'citation') return 'cite'
  if (context.valueKind === 'environment') return context.command === 'end' ? 'end' : 'begin'
  if (context.valueKind === 'tex-package') return 'usepackage'
  if (
    context.valueKind === 'project-tex' ||
    context.valueKind === 'project-bib' ||
    context.valueKind === 'project-image' ||
    context.valueKind === 'project-listing' ||
    context.valueKind === 'project-data' ||
    context.valueKind === 'project-file'
  ) {
    return 'include'
  }
  return null
}

export interface ProvideCompletionOptions {
  registry?: CompletionResolverRegistry
  cancellationToken?: CompletionCancellationToken
}

export interface DefaultCompletionRegistryOptions {
  resourceCatalog?: TexResourceCatalogProvider
  semanticCatalog?: TexSemanticCatalogProvider
}

interface SemanticSyncResult {
  shards: TexSemanticShard[]
  isIncomplete: boolean
}

class SemanticCompletionBinding {
  private registeredScopes = new Set<string>()

  constructor(
    private provider: TexSemanticCatalogProvider,
    private registry: CompletionResolverRegistry,
  ) {}

  syncProject(
    index: ProjectIndex,
    cancellationToken?: CompletionCancellationToken,
    documentPath?: string,
  ): SemanticSyncResult {
    return this.syncScopes(
      [
        ...[...index.getLoadedPackages(documentPath)].map((name) => `package/${name}`),
        ...[...index.getLoadedClasses(documentPath)].map((name) => `class/${name}`),
      ],
      cancellationToken,
    )
  }

  syncScopes(
    scopeIds: Iterable<string>,
    cancellationToken?: CompletionCancellationToken,
  ): SemanticSyncResult {
    const shards: TexSemanticShard[] = []
    let isIncomplete = false
    const pending = [...new Set(scopeIds)]
    const visited = new Set<string>()
    while (pending.length > 0) {
      const scopeId = pending.shift()!
      if (visited.has(scopeId)) continue
      visited.add(scopeId)
      const state = this.provider.getState(scopeId)
      if (state.status === 'ready') {
        this.register(state.shard)
        shards.push(state.shard)
        for (const dependency of state.shard.dependencies) {
          pending.push(`package/${dependency}`)
        }
      } else if (
        state.status === 'idle' ||
        state.status === 'loading' ||
        state.status === 'error'
      ) {
        isIncomplete = true
        if (state.status !== 'loading') {
          void this.provider.load(scopeId, cancellationToken).then((loaded) => {
            if (loaded.status === 'ready') this.register(loaded.shard)
          })
        }
      }
    }
    return { shards, isIncomplete }
  }

  private register(shard: TexSemanticShard): void {
    if (this.registeredScopes.has(shard.scope.id)) return
    registerTexSemanticShard(this.registry, shard)
    this.registeredScopes.add(shard.scope.id)
  }
}

const semanticBindings = new WeakMap<CompletionResolverRegistry, SemanticCompletionBinding>()

/** Create an isolated registry with WasmTex's built-in completion domains. */
export function createDefaultCompletionRegistry(
  options: DefaultCompletionRegistryOptions = {},
): CompletionResolverRegistry {
  const registry = new CompletionResolverRegistry()
  const semanticBinding = options.semanticCatalog
    ? new SemanticCompletionBinding(options.semanticCatalog, registry)
    : undefined
  if (semanticBinding) semanticBindings.set(registry, semanticBinding)
  registerBibCompletionResolvers(registry)
  registry.registerResolver('command', (context, env) => {
    const semantic = semanticBinding?.syncProject(
      env.index,
      env.cancellationToken,
      env.document.path,
    )
    return {
      items: completeCommands(context.prefix, context.prefix.length, env.index, env.document.path),
      isIncomplete: semantic?.isIncomplete ?? false,
    }
  })
  registry.registerResolver('label', (context, env) =>
    completeRefs(context.prefix, context.prefix.length, env.index, env.document.path),
  )
  registry.registerResolver('citation', (context, env) =>
    completeCites(context.prefix, context.prefix.length, env.index, env.document.path),
  )
  registry.registerResolver('environment', (context, env) => {
    const semantic = semanticBinding?.syncProject(
      env.index,
      env.cancellationToken,
      env.document.path,
    )
    const items = completeEnvironments(
      context.prefix,
      context.prefix.length,
      env.index,
      context.type === 'argument' && context.command === 'begin',
      env.document.path,
    )
    appendSemanticEnvironments(items, context.prefix, context.prefix.length, semantic?.shards ?? [])
    return { items, isIncomplete: semantic?.isIncomplete ?? false }
  })
  registry.registerResolver('tex-class', resourceResolver('tex-class', options.resourceCatalog))
  registry.registerResolver('tex-package', resourceResolver('tex-package', options.resourceCatalog))
  registry.registerResolver('bib-style', resourceResolver('bib-style', options.resourceCatalog))
  registry.registerResolver(
    'biblatex-style',
    resourceResolver('biblatex-style', options.resourceCatalog),
  )
  const fontResources = resourceResolver('font-file', options.resourceCatalog)
  registry.registerResolver('font-family', (context, env) => {
    const project = completeProjectValues(context, env, 'font-family')
    const catalog = fontResources(context, env)
    const result = Array.isArray(catalog) ? { items: catalog, isIncomplete: false } : catalog
    return {
      items: dedupeResources([...project, ...result.items]),
      isIncomplete: result.isIncomplete,
    }
  })
  registry.registerResolver('boolean', (context) =>
    ['true', 'false']
      .filter((value) => value.startsWith(context.prefix))
      .map((value) => ({
        label: value,
        kind: 'keyword',
        insertText: value,
        replaceLength: context.prefix.length,
      })),
  )
  registry.registerResolver('color', (context, env) => {
    if (context.type !== 'argument') return []
    if (
      context.argumentIndex > 0 &&
      (context.command === 'color' ||
        context.command === 'textcolor' ||
        context.command === 'colorbox')
    ) {
      return []
    }
    const semantic = semanticBinding?.syncProject(
      env.index,
      env.cancellationToken,
      env.document.path,
    )
    return {
      items: completeColors(env, semantic?.shards ?? []),
      isIncomplete: semantic?.isIncomplete ?? false,
    }
  })
  registry.registerResolver('counter', (context, env) =>
    completeProjectValues(context, env, 'counter'),
  )
  registry.registerResolver('length', (context, env) =>
    completeProjectValues(context, env, 'length'),
  )
  registry.registerResolver('glossary-key', (context, env) =>
    completeProjectValues(context, env, 'glossary'),
  )
  registry.registerResolver('acronym-key', (context, env) =>
    completeProjectValues(context, env, 'acronym'),
  )
  registry.registerResolver('key-family', (context, env) =>
    completeProjectKeyFamilies(context, env),
  )
  registry.registerResolver('key-value', (context, env) =>
    context.type === 'argument' ? resolveKeyValue(context, env, semanticBinding, registry) : [],
  )
  for (const kind of [
    'project-tex',
    'project-bib',
    'project-image',
    'project-listing',
    'project-data',
    'project-file',
  ] as const) {
    registry.registerResolver(kind, (context, env) =>
      completeProjectFiles(kind, context.prefix, env.document.path, env.fs),
    )
  }
  return registry
}

/** Start loading semantic shards for packages already present in the project. */
export function preloadSemanticCatalog(
  registry: CompletionResolverRegistry,
  index: ProjectIndex,
  cancellationToken?: CompletionCancellationToken,
): void {
  semanticBindings.get(registry)?.syncProject(index, cancellationToken)
}

const defaultCompletionRegistry = createDefaultCompletionRegistry()

/** Compute completions at a position (editor-neutral). */
export function provideCompletions(
  doc: NeutralDocument,
  pos: NeutralPosition,
  index: ProjectIndex,
  fs: VirtualFS,
  options: ProvideCompletionOptions = {},
): NeutralCompletionItem[] {
  return provideCompletionResult(doc, pos, index, fs, options).items
}

/** Compute completions plus lazy-loading state at a position (editor-neutral). */
export function provideCompletionResult(
  doc: NeutralDocument,
  pos: NeutralPosition,
  index: ProjectIndex,
  fs: VirtualFS,
  options: ProvideCompletionOptions = {},
): NeutralCompletionList {
  const registry = options.registry ?? defaultCompletionRegistry
  if (options.cancellationToken?.isCancellationRequested) {
    return { items: [], isIncomplete: false }
  }
  const context = analyzeCompletionContext(doc, pos, registry)
  if (!context) return { items: [], isIncomplete: false }
  return registry.resolveResult(context, {
    document: doc,
    position: pos,
    index,
    fs,
    ...(options.cancellationToken ? { cancellationToken: options.cancellationToken } : {}),
  })
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
  documentPath?: string,
): NeutralCompletionItem[] {
  const items: NeutralCompletionItem[] = []
  const loaded = index.getLoadedPackages(documentPath)
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
  for (const cmd of index.getCommandDefs(documentPath)) {
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

function completeRefs(
  prefix: string,
  len: number,
  index: ProjectIndex,
  documentPath?: string,
): NeutralCompletionItem[] {
  const items: NeutralCompletionItem[] = []
  for (const label of index.getAllLabels(documentPath)) {
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

function completeCites(
  prefix: string,
  len: number,
  index: ProjectIndex,
  documentPath?: string,
): NeutralCompletionItem[] {
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
  for (const entry of index.getBibEntries(documentPath)) {
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
  documentPath?: string,
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
  for (const name of index.getAllEnvironments(documentPath)) {
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
  for (const definition of index.getEnvironmentDefinitions(documentPath)) {
    const existing = items.find((item) => item.label === definition.name)
    if (!existing) continue
    const source = `Project definition: ${definition.location.file}:${definition.location.line}`
    existing.documentation = [existing.documentation, source].filter(Boolean).join('\n\n')
    existing.sortText = `0_${definition.name}`
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

function appendSemanticEnvironments(
  items: NeutralCompletionItem[],
  prefix: string,
  len: number,
  shards: TexSemanticShard[],
): void {
  const seen = new Set(items.map((item) => item.insertText))
  for (const shard of shards) {
    for (const environment of shard.environments) {
      if (!environment.name.startsWith(prefix) || seen.has(environment.name)) continue
      seen.add(environment.name)
      const item: NeutralCompletionItem = {
        label: environment.name,
        kind: 'module',
        insertText: environment.name,
        detail: `TeX Live ${shard.texliveYear}: ${shard.scope.name} environment`,
        sortText: `2_${environment.name}`,
        replaceLength: len,
      }
      if (environment.doc) item.documentation = environment.doc
      items.push(item)
    }
  }
}

type ProjectValueDomain = 'counter' | 'length' | 'glossary' | 'acronym' | 'font-family'

const BUILTIN_PROJECT_VALUES: Partial<Record<ProjectValueDomain, readonly string[]>> = {
  counter: [
    'page',
    'part',
    'chapter',
    'section',
    'subsection',
    'subsubsection',
    'paragraph',
    'subparagraph',
    'figure',
    'table',
    'equation',
    'footnote',
    'mpfootnote',
    'enumi',
    'enumii',
    'enumiii',
    'enumiv',
  ],
  length: [
    '\\textwidth',
    '\\textheight',
    '\\linewidth',
    '\\columnwidth',
    '\\paperwidth',
    '\\paperheight',
    '\\parindent',
    '\\parskip',
    '\\baselineskip',
    '\\topmargin',
    '\\oddsidemargin',
    '\\evensidemargin',
  ],
}

function projectValueSources(values: ProjectValue[]): string[] {
  return values.map(
    (value) =>
      `${value.role}: ${value.location.file}:${value.location.line}` +
      (value.target ? ` (alias ${value.target})` : ''),
  )
}

function projectValuesFor(
  environment: CompletionResolverEnvironment,
  domain: ProjectValueDomain,
): ProjectValue[] {
  const values = environment.index.getProjectValues(domain, environment.document.path)
  return domain === 'glossary'
    ? [...values, ...environment.index.getProjectValues('acronym', environment.document.path)]
    : values
}

function completeProjectValues(
  context: CompletionContext,
  environment: CompletionResolverEnvironment,
  domain: ProjectValueDomain,
): NeutralCompletionItem[] {
  const grouped = new Map<string, ProjectValue[]>()
  for (const value of projectValuesFor(environment, domain)) {
    const entries = grouped.get(value.name) ?? []
    entries.push(value)
    grouped.set(value.name, entries)
  }
  const names = new Set([...(BUILTIN_PROJECT_VALUES[domain] ?? []), ...grouped.keys()])
  return [...names]
    .filter((name) => name.startsWith(context.prefix))
    .sort()
    .map((name) => {
      const values = grouped.get(name) ?? []
      const sources = projectValueSources(values)
      return {
        label: name,
        kind: domain === 'font-family' ? ('text' as const) : ('variable' as const),
        insertText: name,
        detail:
          sources[0] ??
          (domain === 'counter' || domain === 'length' ? 'LaTeX kernel value' : domain),
        ...(sources.length > 0 ? { documentation: sources.join('\n\n') } : {}),
        sortText: `${values.length > 0 ? '0' : '1'}_${name}`,
        replaceLength: context.prefix.length,
      }
    })
}

function completeProjectKeyFamilies(
  context: CompletionContext,
  environment: CompletionResolverEnvironment,
): NeutralCompletionItem[] {
  const families = new Map<string, ProjectKeyDefinition[]>()
  for (const key of environment.index.getProjectKeys(environment.document.path)) {
    const definitions = families.get(key.family) ?? []
    definitions.push(key)
    families.set(key.family, definitions)
  }
  return [...families]
    .filter(([family]) => family.startsWith(context.prefix))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, definitions]) => ({
      label: family,
      kind: 'module',
      insertText: family,
      detail: `Project key family · ${definitions[0]!.location.file}:${definitions[0]!.location.line}`,
      documentation: `${definitions.length} statically recovered key(s)`,
      replaceLength: context.prefix.length,
    }))
}

function semanticScopeIds(context: CommandArgumentCompletionContext): string[] {
  if (context.keyFamily === 'class-options' || context.keyFamily === 'package-options') {
    const kind = context.keyFamily === 'class-options' ? 'class' : 'package'
    return (context.selector?.values ?? [])
      .map((name) => name.trim().replace(/\.(?:cls|sty)$/i, ''))
      .filter(Boolean)
      .map((name) => `${kind}/${name}`)
  }
  const owner = context.keyFamily?.split('/')[0]?.trim()
  return owner ? [`package/${owner}`] : []
}

function semanticFamilies(
  context: CommandArgumentCompletionContext,
  shards: TexSemanticShard[],
): Array<{ shard: TexSemanticShard; keys: TexSemanticKey[] }> {
  if (!context.keyFamily) return []
  return shards.flatMap((shard) => {
    const family = shard.keyFamilies.find((candidate) => candidate.name === context.keyFamily)
    return family ? [{ shard, keys: family.keys }] : []
  })
}

function semanticKeyDocumentation(key: TexSemanticKey, scopes: string[]): string {
  const provenance = key.provenance
    .map(
      (entry) => `${entry.evidence}: \`${entry.sourcePath}\`${entry.line ? `:${entry.line}` : ''}`,
    )
    .join('\n\n')
  return [
    key.documentation,
    `Scopes: ${scopes.map((scope) => `\`${scope}\``).join(', ')}`,
    `Confidence: ${key.confidence}`,
    provenance,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function keySnippet(key: TexSemanticKey): { insertText: string; snippet?: true } {
  if (key.value.type === 'flag') return { insertText: key.name }
  return { insertText: `${key.name}=\${1}`, snippet: true }
}

function completeSemanticKeys(
  context: CommandArgumentCompletionContext,
  families: Array<{ shard: TexSemanticShard; keys: TexSemanticKey[] }>,
): NeutralCompletionItem[] {
  const byName = new Map<string, { key: TexSemanticKey; scopes: string[] }>()
  for (const { shard, keys } of families) {
    for (const key of keys) {
      const current = byName.get(key.name)
      if (current) {
        current.scopes.push(shard.scope.id)
        current.key.repeatable &&= key.repeatable
      } else byName.set(key.name, { key: { ...key }, scopes: [shard.scope.id] })
    }
  }
  return [...byName.values()]
    .filter(
      ({ key }) =>
        key.name.startsWith(context.prefix) &&
        (key.repeatable || !context.usedKeys.includes(key.name)),
    )
    .map(({ key, scopes }) => ({
      label: key.name,
      kind: 'keyword',
      ...keySnippet(key),
      detail: `${key.value.type} key · ${scopes.join(', ')}`,
      documentation: semanticKeyDocumentation(key, scopes),
      sortText: `0_${key.name}`,
      replaceLength: context.prefix.length,
    }))
}

function semanticValueDomain(type: TexSemanticValueType): CompletionValueKind | null {
  const domains: Partial<Record<TexSemanticValueType, CompletionValueKind>> = {
    boolean: 'boolean',
    color: 'color',
    file: 'project-file',
    command: 'command',
    'tex-class': 'tex-class',
    'tex-package': 'tex-package',
    'bib-style': 'bib-style',
    'biblatex-style': 'biblatex-style',
    'font-family': 'font-family',
  }
  return domains[type] ?? null
}

function completeEnumValues(
  context: CommandArgumentCompletionContext,
  keys: TexSemanticKey[],
): NeutralCompletionItem[] {
  const values = new Set(
    keys.flatMap((key) => (key.value.type === 'enum' ? (key.value.values ?? []) : [])),
  )
  return [...values]
    .filter((value) => value.startsWith(context.prefix))
    .sort()
    .map((value) => ({
      label: value,
      kind: 'keyword',
      insertText: value,
      replaceLength: context.prefix.length,
    }))
}

function completeCommandValues(
  context: CommandArgumentCompletionContext,
  environment: CompletionResolverEnvironment,
): NeutralCompletionItem[] {
  const hasSlash = context.prefix.startsWith('\\')
  const prefix = hasSlash ? context.prefix.slice(1) : context.prefix
  return completeCommands(prefix, prefix.length, environment.index, environment.document.path).map(
    (item) => ({
      ...item,
      insertText: hasSlash ? `\\${item.insertText}` : item.insertText,
      replaceLength: context.prefix.length,
    }),
  )
}

function resolveSemanticValues(
  context: CommandArgumentCompletionContext,
  environment: CompletionResolverEnvironment,
  registry: CompletionResolverRegistry,
  keys: TexSemanticKey[],
): NeutralCompletionList {
  if (keys.some((key) => key.value.type === 'enum')) {
    return { items: completeEnumValues(context, keys), isIncomplete: false }
  }
  if (keys.some((key) => key.value.type === 'command')) {
    return { items: completeCommandValues(context, environment), isIncomplete: false }
  }
  const domain = keys.map((key) => semanticValueDomain(key.value.type)).find(Boolean)
  if (!domain) return { items: [], isIncomplete: false }
  return registry.resolveResult({ ...context, domain, valueKind: domain }, environment)
}

function normalizedProjectFamilies(context: CommandArgumentCompletionContext): Set<string> {
  const families = new Set(
    (context.keyFamilySelector?.values ?? []).map((family) =>
      family.trim().replace(/^\/+|\/+$/g, ''),
    ),
  )
  if (context.keyFamily) families.add(context.keyFamily.replace(/^\/+|\/+$/g, ''))
  for (const key of context.usedKeys) {
    if (key.endsWith('/.cd')) families.add(key.slice(0, -4).replace(/^\/+|\/+$/g, ''))
  }
  return families
}

function projectKeysForContext(
  context: CommandArgumentCompletionContext,
  environment: CompletionResolverEnvironment,
): ProjectKeyDefinition[] {
  const families = normalizedProjectFamilies(context)
  return environment.index.getProjectKeys(
    environment.document.path,
    families.size > 0 ? families : undefined,
  )
}

function completeProjectKeys(
  context: CommandArgumentCompletionContext,
  keys: ProjectKeyDefinition[],
): NeutralCompletionItem[] {
  const grouped = new Map<string, ProjectKeyDefinition[]>()
  for (const key of keys) {
    const definitions = grouped.get(key.name) ?? []
    definitions.push(key)
    grouped.set(key.name, definitions)
  }
  return [...grouped]
    .filter(([name]) => name.startsWith(context.prefix) && !context.usedKeys.includes(name))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, definitions]) => {
      const first = definitions.at(-1)!
      const needsValue = first.valueType !== 'flag'
      return {
        label: name,
        kind: 'keyword',
        insertText: needsValue ? `${name}=\${1}` : name,
        ...(needsValue ? { snippet: true as const } : {}),
        detail: `${first.valueType} key · project/${first.family}`,
        documentation: definitions
          .map((key) => `${key.location.file}:${key.location.line}`)
          .join('\n\n'),
        sortText: `00_${name}`,
        replaceLength: context.prefix.length,
      }
    })
}

function projectValueDomain(key: ProjectKeyDefinition): CompletionValueKind | null {
  const domains: Partial<Record<ProjectKeyDefinition['valueType'], CompletionValueKind>> = {
    boolean: 'boolean',
    color: 'color',
    file: 'project-file',
    command: 'command',
  }
  return domains[key.valueType] ?? null
}

function completeProjectKeyValues(
  context: CommandArgumentCompletionContext,
  environment: CompletionResolverEnvironment,
  registry: CompletionResolverRegistry,
  keys: ProjectKeyDefinition[],
): NeutralCompletionList {
  const active = keys.at(-1)
  if (!active) return { items: [], isIncomplete: false }
  const values = new Set(active.valueType === 'enum' ? (active.values ?? []) : [])
  if (values.size > 0) {
    return {
      items: [...values]
        .filter((value) => value.startsWith(context.prefix))
        .sort()
        .map((value) => ({
          label: value,
          kind: 'keyword',
          insertText: value,
          detail: `Project enum value for ${context.key}`,
          replaceLength: context.prefix.length,
        })),
      isIncomplete: false,
    }
  }
  const domain = projectValueDomain(active)
  return domain
    ? registry.resolveResult({ ...context, domain, valueKind: domain }, environment)
    : { items: [], isIncomplete: false }
}

function dedupeCompletionItems(items: NeutralCompletionItem[]): NeutralCompletionItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.insertText)) return false
    seen.add(item.insertText)
    return true
  })
}

function resolveKeyValue(
  context: CommandArgumentCompletionContext,
  environment: CompletionResolverEnvironment,
  binding: SemanticCompletionBinding | undefined,
  registry: CompletionResolverRegistry,
): NeutralCompletionList {
  const semantic = binding?.syncScopes(
    semanticScopeIds(context),
    environment.cancellationToken,
  ) ?? {
    shards: [],
    isIncomplete: false,
  }
  const families = semanticFamilies(context, semantic.shards)
  const projectKeys = projectKeysForContext(context, environment)
  if (context.keyValuePosition !== 'value') {
    return {
      items: dedupeCompletionItems([
        ...completeProjectKeys(context, projectKeys),
        ...completeSemanticKeys(context, families),
      ]),
      isIncomplete: semantic.isIncomplete,
    }
  }
  if (!context.key) return { items: [], isIncomplete: semantic.isIncomplete }
  const keys = families.flatMap((family) => family.keys.filter((key) => key.name === context.key))
  const semanticValues = resolveSemanticValues(context, environment, registry, keys)
  const projectValues = completeProjectKeyValues(
    context,
    environment,
    registry,
    projectKeys.filter((key) => key.name === context.key),
  )
  return {
    items: dedupeCompletionItems([...projectValues.items, ...semanticValues.items]),
    isIncomplete:
      semantic.isIncomplete || semanticValues.isIncomplete || projectValues.isIncomplete,
  }
}

const PROJECT_RESOURCE_EXTENSIONS: Record<TexResourceKind, ReadonlySet<string>> = {
  'tex-class': new Set(['cls']),
  'tex-package': new Set(['sty']),
  'bib-style': new Set(['bst']),
  'biblatex-style': new Set(['bbx', 'cbx', 'lbx']),
  'font-file': new Set(['otf', 'ttf', 'ttc']),
}

function projectResourceName(path: string, kind: TexResourceKind): string | null {
  const dot = path.lastIndexOf('.')
  if (dot < 0 || !PROJECT_RESOURCE_EXTENSIONS[kind].has(path.slice(dot + 1).toLowerCase())) {
    return null
  }
  return path.slice(0, dot)
}

function projectResourceCompletions(
  prefix: string,
  len: number,
  kind: TexResourceKind,
  fs: VirtualFS,
): NeutralCompletionItem[] {
  return fs
    .listFiles()
    .map((path) => ({ path, name: projectResourceName(path, kind) }))
    .filter(
      (item): item is { path: string; name: string } => item.name?.startsWith(prefix) === true,
    )
    .map(({ path, name }) => ({
      label: name,
      kind: kind === 'font-file' ? ('file' as const) : ('module' as const),
      insertText: name,
      detail: `Project resource: ${path}`,
      sortText: `0_${name}`,
      replaceLength: len,
    }))
}

function catalogResourceItem(
  resource: TexResourceRecord,
  prefix: string,
  len: number,
  kind: TexResourceKind,
): NeutralCompletionItem | null {
  const insertText = kind === 'font-file' ? resource.fileName : resource.name
  if (!insertText.startsWith(prefix)) return null
  const item: NeutralCompletionItem = {
    label: insertText,
    kind: kind === 'font-file' ? 'file' : 'module',
    insertText,
    detail: `TeX Live ${resource.texliveYear}: ${resource.texlivePackage} (${resource.fileName})`,
    sortText: `1_${insertText}`,
    replaceLength: len,
  }
  if (resource.documentationUrl) {
    item.documentation = `[Package documentation](${resource.documentationUrl})\n\nSource: \`${resource.sourcePath}\``
  }
  return item
}

function resourceResolver(
  kind: TexResourceKind,
  provider: TexResourceCatalogProvider | undefined,
): Parameters<CompletionResolverRegistry['registerResolver']>[1] {
  return (context, env) => {
    const project = projectResourceCompletions(context.prefix, context.prefix.length, kind, env.fs)
    if (!provider) return project
    const state = provider.getState(kind)
    if (state.status === 'idle' || state.status === 'error') {
      void provider.load(kind, env.cancellationToken)
    }
    if (state.status !== 'ready') {
      return {
        items: project,
        isIncomplete: state.status !== 'mismatch',
      }
    }
    const mirror = state.shard.resources
      .map((resource) => catalogResourceItem(resource, context.prefix, context.prefix.length, kind))
      .filter((item): item is NeutralCompletionItem => item !== null)
    return { items: dedupeResources([...project, ...mirror]), isIncomplete: false }
  }
}

function dedupeResources(items: NeutralCompletionItem[]): NeutralCompletionItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.insertText)) return false
    seen.add(item.insertText)
    return true
  })
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
