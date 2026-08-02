import {
  CatalogIdentityError,
  readCatalogText,
  sameCatalogIdentity,
  validCatalogIdentity,
} from './catalog-transport'
import type { CompletionCancellationToken, CompletionResolverRegistry } from './completion-registry'
import type { CommandArg } from './package-db'

export const TEX_SEMANTIC_CATALOG_SCHEMA_VERSION = 1

export type TexSemanticScopeKind = 'class' | 'package'
export type TexSemanticConfidence = 'exact' | 'observed' | 'inferred' | 'overridden'
export type TexSemanticEvidence = 'declared' | 'observed' | 'inferred' | 'override'
export type TexSemanticValueType =
  | 'flag'
  | 'boolean'
  | 'enum'
  | 'number'
  | 'dimension'
  | 'color'
  | 'file'
  | 'command'
  | 'free-text'
  | 'tex-class'
  | 'tex-package'
  | 'bib-style'
  | 'biblatex-style'
  | 'font-family'

export interface TexSemanticCatalogIdentity {
  schemaVersion: 1
  texliveYear: string
  mirrorRevision: string
}

export interface TexSemanticProvenance {
  evidence: TexSemanticEvidence
  sourcePath: string
  line?: number
  extractor: string
  note?: string
}

export interface TexSemanticValue {
  type: TexSemanticValueType
  values?: string[]
}

export interface TexSemanticKey {
  name: string
  value: TexSemanticValue
  repeatable: boolean
  default?: string
  documentation?: string
  confidence: TexSemanticConfidence
  provenance: TexSemanticProvenance[]
}

export interface TexSemanticKeyFamily {
  name: string
  keys: TexSemanticKey[]
}

export interface TexSemanticCommand {
  name: string
  args: CommandArg[]
  doc?: string
  confidence: TexSemanticConfidence
  provenance: TexSemanticProvenance[]
}

export interface TexSemanticColor {
  name: string
  kind: 'define' | 'provide' | 'alias'
  model?: string
  value?: string
  alias?: string
  availability?: { anyOptions?: string[]; deferredOptions?: string[] }
  priority?: number
  confidence: TexSemanticConfidence
  provenance: TexSemanticProvenance[]
}

export interface TexSemanticScope {
  id: string
  kind: TexSemanticScopeKind
  name: string
  fileName: string
  key: string
  sourcePath: string
  texlivePackage: string
  packageRevision: string | null
  catalogue: string | null
  documentationUrl?: string
  engines?: Array<'pdftex' | 'xetex' | 'luatex'>
}

export interface TexSemanticCoverage {
  keys: number
  commands: number
  environments: number
  colors: number
  exact: number
  declared: number
  observed: number
  inferred: number
  overridden: number
  unresolved: number
}

export interface TexSemanticShard extends TexSemanticCatalogIdentity {
  scope: TexSemanticScope
  keyFamilies: TexSemanticKeyFamily[]
  commands: TexSemanticCommand[]
  environments: TexSemanticCommand[]
  colors: TexSemanticColor[]
  dependencies: string[]
  unsupported: Array<{ line?: number; construct: string; reason: string }>
  coverage: TexSemanticCoverage
}

export type TexSemanticCatalogState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; shard: TexSemanticShard }
  | { status: 'absent'; message: string }
  | { status: 'mismatch'; message: string }
  | { status: 'error'; message: string }

export interface TexSemanticCatalogProvider {
  readonly identity: TexSemanticCatalogIdentity
  getState(scopeId: string): TexSemanticCatalogState
  load(
    scopeId: string,
    cancellationToken?: CompletionCancellationToken,
  ): Promise<TexSemanticCatalogState>
  subscribe?(listener: () => void): () => void
}

export interface TexSemanticCatalogStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}

interface SemanticIndex extends TexSemanticCatalogIdentity {
  scopes: Record<string, { path: string; sha256: string; coverage: TexSemanticCoverage }>
}

export interface HttpTexSemanticCatalogProviderOptions {
  /** TeX Live year root, for example `https://cdn.example/2025/`. */
  baseUrl: string
  /** Exact compile-profile identity. A different response is rejected. */
  identity: TexSemanticCatalogIdentity
  fetchImpl?: typeof fetch
  store?: TexSemanticCatalogStore
}

function validIdentity(value: unknown): value is TexSemanticCatalogIdentity {
  return validCatalogIdentity(value, TEX_SEMANTIC_CATALOG_SCHEMA_VERSION)
}

function sameIdentity(a: TexSemanticCatalogIdentity, b: TexSemanticCatalogIdentity): boolean {
  return sameCatalogIdentity(a, b)
}

function validScopeId(scopeId: string): boolean {
  return /^(?:class|package)\/[A-Za-z0-9._+-]+$/.test(scopeId)
}

function asIndex(value: unknown, expected: TexSemanticCatalogIdentity): SemanticIndex {
  if (!validIdentity(value) || !sameIdentity(value, expected)) {
    throw new CatalogIdentityError(
      'semantic catalog index does not match the selected compile profile',
    )
  }
  const index = value as Partial<SemanticIndex>
  if (!index.scopes || typeof index.scopes !== 'object') {
    throw new Error('semantic catalog index has no scopes')
  }
  for (const [scopeId, descriptor] of Object.entries(index.scopes)) {
    if (
      !validScopeId(scopeId) ||
      !descriptor ||
      !/^(?:classes|packages)\/[^/]+\.json$/.test(descriptor.path) ||
      descriptor.path.includes('..') ||
      !/^[a-f0-9]{64}$/.test(descriptor.sha256)
    ) {
      throw new Error('semantic catalog index contains an invalid scope descriptor')
    }
  }
  return value as SemanticIndex
}

function asShard(
  value: unknown,
  scopeId: string,
  expected: TexSemanticCatalogIdentity,
): TexSemanticShard {
  if (!validIdentity(value) || !sameIdentity(value, expected)) {
    throw new CatalogIdentityError(
      `${scopeId} semantic shard does not match the selected compile profile`,
    )
  }
  const shard = value as Partial<TexSemanticShard>
  if (
    shard.scope?.id !== scopeId ||
    !Array.isArray(shard.keyFamilies) ||
    !Array.isArray(shard.commands) ||
    !Array.isArray(shard.environments) ||
    !Array.isArray(shard.colors) ||
    !Array.isArray(shard.dependencies)
  ) {
    throw new Error(`${scopeId} semantic shard has an invalid shape`)
  }
  return value as TexSemanticShard
}

export class HttpTexSemanticCatalogProvider implements TexSemanticCatalogProvider {
  readonly identity: TexSemanticCatalogIdentity
  private baseUrl: string
  private fetchImpl: typeof fetch
  private store: TexSemanticCatalogStore | undefined
  private states = new Map<string, TexSemanticCatalogState>()
  private pending = new Map<string, Promise<TexSemanticCatalogState>>()
  private indexPromise: Promise<SemanticIndex> | undefined
  private listeners = new Set<() => void>()

  constructor(options: HttpTexSemanticCatalogProviderOptions) {
    if (!validIdentity(options.identity)) throw new Error('invalid expected semantic identity')
    this.identity = options.identity
    this.baseUrl = `${options.baseUrl.replace(/\/$/, '')}/semantic/${this.identity.mirrorRevision}`
    this.fetchImpl = options.fetchImpl ?? fetch
    this.store = options.store
  }

  getState(scopeId: string): TexSemanticCatalogState {
    return this.states.get(scopeId) ?? { status: 'idle' }
  }

  load(
    scopeId: string,
    cancellationToken?: CompletionCancellationToken,
  ): Promise<TexSemanticCatalogState> {
    if (!validScopeId(scopeId)) {
      return Promise.resolve({ status: 'error', message: `invalid semantic scope: ${scopeId}` })
    }
    if (cancellationToken?.isCancellationRequested) return Promise.resolve(this.getState(scopeId))
    const current = this.getState(scopeId)
    if (
      current.status === 'ready' ||
      current.status === 'absent' ||
      current.status === 'mismatch'
    ) {
      return Promise.resolve(current)
    }
    const existing = this.pending.get(scopeId)
    if (existing) return existing
    this.setState(scopeId, { status: 'loading' })
    const task = this.loadShard(scopeId).finally(() => this.pending.delete(scopeId))
    this.pending.set(scopeId, task)
    return task
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setState(scopeId: string, state: TexSemanticCatalogState): TexSemanticCatalogState {
    this.states.set(scopeId, state)
    for (const listener of this.listeners) listener()
    return state
  }

  private async loadShard(scopeId: string): Promise<TexSemanticCatalogState> {
    try {
      const index = await this.loadIndex()
      const descriptor = index.scopes[scopeId]
      if (!descriptor) {
        return this.setState(scopeId, {
          status: 'absent',
          message: `${scopeId} is absent from the semantic catalog`,
        })
      }
      const text = await this.read(descriptor.path, descriptor.sha256)
      const shard = asShard(JSON.parse(text), scopeId, this.identity)
      return this.setState(scopeId, { status: 'ready', shard })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return this.setState(scopeId, {
        status: error instanceof CatalogIdentityError ? 'mismatch' : 'error',
        message,
      })
    }
  }

  private loadIndex(): Promise<SemanticIndex> {
    this.indexPromise ??= this.read('index.json')
      .then((text) => asIndex(JSON.parse(text), this.identity))
      .catch((error) => {
        this.indexPromise = undefined
        throw error
      })
    return this.indexPromise
  }

  private async read(path: string, expectedSha256?: string): Promise<string> {
    return readCatalogText({
      baseUrl: this.baseUrl,
      cacheNamespace: 'texsemantic',
      identity: this.identity,
      path,
      fetchImpl: this.fetchImpl,
      ...(this.store ? { store: this.store } : {}),
      ...(expectedSha256 ? { expectedSha256 } : {}),
      errorLabel: 'semantic catalog',
    })
  }
}

export class InMemoryTexSemanticCatalogProvider implements TexSemanticCatalogProvider {
  readonly identity: TexSemanticCatalogIdentity
  private shards = new Map<string, TexSemanticShard>()

  constructor(identity: TexSemanticCatalogIdentity, shards: Iterable<TexSemanticShard>) {
    if (!validIdentity(identity)) throw new Error('invalid semantic catalog identity')
    this.identity = identity
    for (const shard of shards) {
      if (!sameIdentity(identity, shard)) throw new Error(`${shard.scope.id} identity mismatch`)
      this.shards.set(shard.scope.id, shard)
    }
  }

  getState(scopeId: string): TexSemanticCatalogState {
    const shard = this.shards.get(scopeId)
    return shard
      ? { status: 'ready', shard }
      : { status: 'absent', message: `${scopeId} is unavailable` }
  }

  async load(scopeId: string): Promise<TexSemanticCatalogState> {
    return this.getState(scopeId)
  }
}

export function registerTexSemanticShard(
  registry: CompletionResolverRegistry,
  shard: TexSemanticShard,
): void {
  for (const command of shard.commands) registry.registerCommand(command.name, command.args)
}
