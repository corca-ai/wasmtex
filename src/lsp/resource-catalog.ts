import {
  CatalogIdentityError,
  readCatalogText,
  sameCatalogIdentity,
  validCatalogIdentity,
} from './catalog-transport'
import type { CompletionCancellationToken } from './completion-registry'

export const TEX_RESOURCE_CATALOG_SCHEMA_VERSION = 1

export type TexResourceKind =
  | 'tex-class'
  | 'tex-package'
  | 'bib-style'
  | 'biblatex-style'
  | 'font-file'

export interface TexResourceCatalogIdentity {
  schemaVersion: 1
  texliveYear: string
  mirrorRevision: string
}

export interface TexResourceRecord {
  name: string
  fileName: string
  extension: string
  key: string
  format: number
  bytes: number
  sha256: string
  texliveYear: string
  mirrorRevision: string
  sourcePath: string
  texlivePackage: string
  packageRevision: string | null
  catalogue: string | null
  documentationUrl?: string
  engines?: Array<'pdftex' | 'xetex' | 'luatex'>
  collision?: {
    decision: 'identical-content' | 'reviewed-override'
    selectedSource: string
    candidateSources: string[]
    rationale?: string
  }
}

export interface TexResourceCatalogShard extends TexResourceCatalogIdentity {
  kind: TexResourceKind
  resources: TexResourceRecord[]
}

export type TexResourceCatalogState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; shard: TexResourceCatalogShard }
  | { status: 'mismatch'; message: string }
  | { status: 'error'; message: string }

export interface TexResourceCatalogProvider {
  readonly identity: TexResourceCatalogIdentity
  getState(kind: TexResourceKind): TexResourceCatalogState
  load(
    kind: TexResourceKind,
    cancellationToken?: CompletionCancellationToken,
  ): Promise<TexResourceCatalogState>
  subscribe?(listener: () => void): () => void
}

export interface TexResourceCatalogStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}

interface CatalogIndex extends TexResourceCatalogIdentity {
  shards: Record<TexResourceKind, { path: string; count: number; sha256: string }>
}

export interface HttpTexResourceCatalogProviderOptions {
  /** TeX Live year root, for example `https://cdn.example/2025/`. */
  baseUrl: string
  /** Exact compile-profile identity. A different response is rejected. */
  identity: TexResourceCatalogIdentity
  fetchImpl?: typeof fetch
  store?: TexResourceCatalogStore
}

function validIdentity(value: unknown): value is TexResourceCatalogIdentity {
  return validCatalogIdentity(value, TEX_RESOURCE_CATALOG_SCHEMA_VERSION)
}

function sameIdentity(a: TexResourceCatalogIdentity, b: TexResourceCatalogIdentity): boolean {
  return sameCatalogIdentity(a, b)
}

function asIndex(value: unknown, expected: TexResourceCatalogIdentity): CatalogIndex {
  if (!validIdentity(value) || !sameIdentity(value, expected)) {
    throw new CatalogIdentityError('catalog index does not match the selected compile profile')
  }
  const index = value as Partial<CatalogIndex>
  if (!index.shards || typeof index.shards !== 'object')
    throw new Error('catalog index has no shards')
  for (const descriptor of Object.values(index.shards)) {
    if (
      !descriptor ||
      typeof descriptor.path !== 'string' ||
      descriptor.path.includes('/') ||
      !Number.isSafeInteger(descriptor.count) ||
      descriptor.count < 0 ||
      !/^[a-f0-9]{64}$/.test(descriptor.sha256)
    ) {
      throw new Error('catalog index contains an invalid shard descriptor')
    }
  }
  return value as CatalogIndex
}

function asShard(
  value: unknown,
  kind: TexResourceKind,
  expected: TexResourceCatalogIdentity,
  expectedCount: number,
): TexResourceCatalogShard {
  if (!validIdentity(value) || !sameIdentity(value, expected)) {
    throw new CatalogIdentityError(`${kind} shard does not match the selected compile profile`)
  }
  const shard = value as Partial<TexResourceCatalogShard>
  if (
    shard.kind !== kind ||
    !Array.isArray(shard.resources) ||
    shard.resources.length !== expectedCount
  ) {
    throw new Error(`${kind} shard has an invalid kind or resource count`)
  }
  for (const resource of shard.resources) {
    if (
      !resource ||
      typeof resource.name !== 'string' ||
      typeof resource.fileName !== 'string' ||
      typeof resource.key !== 'string' ||
      typeof resource.sourcePath !== 'string' ||
      typeof resource.texlivePackage !== 'string' ||
      resource.texliveYear !== expected.texliveYear ||
      resource.mirrorRevision !== expected.mirrorRevision
    ) {
      throw new Error(`${kind} shard contains an invalid resource`)
    }
  }
  return value as TexResourceCatalogShard
}

export class HttpTexResourceCatalogProvider implements TexResourceCatalogProvider {
  readonly identity: TexResourceCatalogIdentity
  private baseUrl: string
  private fetchImpl: typeof fetch
  private store: TexResourceCatalogStore | undefined
  private states = new Map<TexResourceKind, TexResourceCatalogState>()
  private pending = new Map<TexResourceKind, Promise<TexResourceCatalogState>>()
  private indexPromise: Promise<CatalogIndex> | undefined
  private listeners = new Set<() => void>()

  constructor(options: HttpTexResourceCatalogProviderOptions) {
    if (!validIdentity(options.identity)) throw new Error('invalid expected catalog identity')
    this.identity = options.identity
    this.baseUrl = `${options.baseUrl.replace(/\/$/, '')}/catalog/${this.identity.mirrorRevision}`
    this.fetchImpl = options.fetchImpl ?? fetch
    this.store = options.store
  }

  getState(kind: TexResourceKind): TexResourceCatalogState {
    return this.states.get(kind) ?? { status: 'idle' }
  }

  load(
    kind: TexResourceKind,
    cancellationToken?: CompletionCancellationToken,
  ): Promise<TexResourceCatalogState> {
    if (cancellationToken?.isCancellationRequested) return Promise.resolve(this.getState(kind))
    const current = this.getState(kind)
    if (current.status === 'ready' || current.status === 'mismatch') return Promise.resolve(current)
    const existing = this.pending.get(kind)
    if (existing) return existing
    this.setState(kind, { status: 'loading' })
    const task = this.loadShard(kind).finally(() => this.pending.delete(kind))
    this.pending.set(kind, task)
    return task
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setState(kind: TexResourceKind, state: TexResourceCatalogState): TexResourceCatalogState {
    this.states.set(kind, state)
    for (const listener of this.listeners) listener()
    return state
  }

  private async loadShard(kind: TexResourceKind): Promise<TexResourceCatalogState> {
    try {
      const index = await this.loadIndex()
      const descriptor = index.shards[kind]
      if (!descriptor) throw new Error(`${kind} shard is absent from the catalog index`)
      const text = await this.read(`${descriptor.path}`, descriptor.sha256)
      const shard = asShard(JSON.parse(text), kind, this.identity, descriptor.count)
      return this.setState(kind, { status: 'ready', shard })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return this.setState(kind, {
        status: error instanceof CatalogIdentityError ? 'mismatch' : 'error',
        message,
      })
    }
  }

  private loadIndex(): Promise<CatalogIndex> {
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
      cacheNamespace: 'texcatalog',
      identity: this.identity,
      path,
      fetchImpl: this.fetchImpl,
      ...(this.store ? { store: this.store } : {}),
      ...(expectedSha256 ? { expectedSha256 } : {}),
      errorLabel: 'catalog',
    })
  }
}

export class InMemoryTexResourceCatalogProvider implements TexResourceCatalogProvider {
  readonly identity: TexResourceCatalogIdentity
  private shards = new Map<TexResourceKind, TexResourceCatalogShard>()

  constructor(identity: TexResourceCatalogIdentity, shards: Iterable<TexResourceCatalogShard>) {
    if (!validIdentity(identity)) throw new Error('invalid catalog identity')
    this.identity = identity
    for (const shard of shards) {
      if (!sameIdentity(identity, shard)) throw new Error(`${shard.kind} shard identity mismatch`)
      this.shards.set(shard.kind, shard)
    }
  }

  getState(kind: TexResourceKind): TexResourceCatalogState {
    const shard = this.shards.get(kind)
    return shard
      ? { status: 'ready', shard }
      : { status: 'error', message: `${kind} is unavailable` }
  }

  async load(kind: TexResourceKind): Promise<TexResourceCatalogState> {
    return this.getState(kind)
  }
}
