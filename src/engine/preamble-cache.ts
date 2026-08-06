import { completionFileDigest } from './completion-snapshot'
import {
  type BinaryStore,
  IndexedDbBinaryStore,
  isIndexedDbSupported,
  MemoryBinaryStore,
} from './persistent-cache'

const SCHEMA = 1
const PREFIX = `preamble:${SCHEMA}:`
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024
const MAX_FORMAT_BYTES = 64 * 1024 * 1024
const MAX_INPUTS = 4096

export interface PreambleCacheIdentity {
  engineBuildId: string
  mirrorRevision: string
  texliveUrl: string
  texliveYear: string
}

export interface PreambleProjectDependency {
  path: string
  sha256: string
}

export interface DurablePreambleSnapshot {
  key: string
  workerHash: string
  format: ArrayBuffer
  inputFiles: string[]
  projectDependencies: PreambleProjectDependency[]
}

interface StoredSnapshotMeta {
  schema: number
  key: string
  workerHash: string
  formatBytes: number
  formatSha256: string
  inputFiles: string[]
  projectDependencies: PreambleProjectDependency[]
}

interface CacheIndexEntry {
  bytes: number
  lastAccess: number
}

interface CacheIndex {
  schema: number
  entries: Record<string, CacheIndexEntry>
}

export interface PreambleSnapshotCacheOptions {
  store?: BinaryStore
  maxBytes?: number
  now?: () => number
}

export const preambleSha256 = completionFileDigest

export async function durablePreambleKey(
  identity: PreambleCacheIdentity,
  preamble: string,
): Promise<string> {
  return preambleSha256(JSON.stringify({ schema: SCHEMA, ...identity, preamble }))
}

function validDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function validText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0')
  )
}

function decodeJson<T>(buffer: ArrayBuffer | null): T | null {
  if (!buffer) return null
  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as T
  } catch {
    return null
  }
}

function encodeJson(value: unknown): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer
}

/** Bounded persistent store for document-specific pdfLaTeX preamble formats. */
export class PreambleSnapshotCache {
  private readonly store: BinaryStore
  private readonly maxBytes: number
  private readonly now: () => number
  private writeChain: Promise<void> = Promise.resolve()

  constructor(options: PreambleSnapshotCacheOptions = {}) {
    this.store =
      options.store ??
      (isIndexedDbSupported()
        ? new IndexedDbBinaryStore('wasmtex-preamble-cache')
        : new MemoryBinaryStore())
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    this.now = options.now ?? (() => Date.now())
  }

  private indexKey(): string {
    return `${PREFIX}index`
  }

  private metaKey(key: string): string {
    return `${PREFIX}${key}:meta`
  }

  private formatKey(key: string): string {
    return `${PREFIX}${key}:fmt`
  }

  private async readIndex(): Promise<CacheIndex> {
    const index = decodeJson<CacheIndex>(await this.store.get(this.indexKey()))
    const validEntries =
      index?.entries &&
      typeof index.entries === 'object' &&
      Object.entries(index.entries).every(
        ([key, entry]) =>
          validDigest(key) &&
          typeof entry?.bytes === 'number' &&
          Number.isSafeInteger(entry.bytes) &&
          entry.bytes > 0 &&
          typeof entry.lastAccess === 'number' &&
          Number.isFinite(entry.lastAccess),
      )
    if (index?.schema !== SCHEMA || !validEntries) {
      return { schema: SCHEMA, entries: {} }
    }
    return index
  }

  private writeIndex(index: CacheIndex): Promise<void> {
    return this.store.set(this.indexKey(), encodeJson(index))
  }

  async load(key: string): Promise<DurablePreambleSnapshot | null> {
    if (!validDigest(key)) return null
    const [rawMeta, format] = await Promise.all([
      this.store.get(this.metaKey(key)),
      this.store.get(this.formatKey(key)),
    ])
    const meta = decodeJson<StoredSnapshotMeta>(rawMeta)
    const validInputs =
      Array.isArray(meta?.inputFiles) &&
      meta.inputFiles.length <= MAX_INPUTS &&
      meta.inputFiles.every((path) => validText(path, 1024))
    const validDependencies =
      Array.isArray(meta?.projectDependencies) &&
      meta.projectDependencies.length <= MAX_INPUTS &&
      meta.projectDependencies.every(
        (dependency) => validText(dependency?.path, 1024) && validDigest(dependency?.sha256),
      )
    if (
      meta?.schema !== SCHEMA ||
      meta.key !== key ||
      !validText(meta.workerHash, 128) ||
      !format ||
      format.byteLength === 0 ||
      format.byteLength > MAX_FORMAT_BYTES ||
      meta.formatBytes !== format.byteLength ||
      !validDigest(meta.formatSha256) ||
      !validInputs ||
      !validDependencies
    ) {
      await this.delete(key)
      return null
    }
    if ((await preambleSha256(new Uint8Array(format))) !== meta.formatSha256) {
      await this.delete(key)
      return null
    }

    const index = await this.readIndex()
    if (index.entries[key]) {
      index.entries[key]!.lastAccess = this.now()
      await this.writeIndex(index)
    }
    return {
      key,
      workerHash: meta.workerHash,
      format,
      inputFiles: [...meta.inputFiles],
      projectDependencies: meta.projectDependencies.map((dependency) => ({ ...dependency })),
    }
  }

  save(snapshot: DurablePreambleSnapshot): Promise<void> {
    const run = this.writeChain.then(() => this.doSave(snapshot))
    this.writeChain = run.catch(() => {})
    return run
  }

  private async doSave(snapshot: DurablePreambleSnapshot): Promise<void> {
    if (
      !validDigest(snapshot.key) ||
      !validText(snapshot.workerHash, 128) ||
      snapshot.format.byteLength === 0 ||
      snapshot.format.byteLength > MAX_FORMAT_BYTES ||
      snapshot.format.byteLength > this.maxBytes ||
      snapshot.inputFiles.length > MAX_INPUTS ||
      snapshot.projectDependencies.length > MAX_INPUTS ||
      !snapshot.inputFiles.every((path) => validText(path, 1024)) ||
      !snapshot.projectDependencies.every(
        (dependency) => validText(dependency.path, 1024) && validDigest(dependency.sha256),
      )
    ) {
      return
    }
    const meta: StoredSnapshotMeta = {
      schema: SCHEMA,
      key: snapshot.key,
      workerHash: snapshot.workerHash,
      formatBytes: snapshot.format.byteLength,
      formatSha256: await preambleSha256(new Uint8Array(snapshot.format)),
      inputFiles: [...snapshot.inputFiles],
      projectDependencies: snapshot.projectDependencies.map((dependency) => ({ ...dependency })),
    }
    await Promise.all([
      this.store.set(this.formatKey(snapshot.key), snapshot.format),
      this.store.set(this.metaKey(snapshot.key), encodeJson(meta)),
    ])
    const index = await this.readIndex()
    index.entries[snapshot.key] = {
      bytes: snapshot.format.byteLength,
      lastAccess: this.now(),
    }
    await this.evict(index, snapshot.key)
    await this.writeIndex(index)
  }

  private async evict(index: CacheIndex, keep: string): Promise<void> {
    let total = Object.values(index.entries).reduce((sum, entry) => sum + entry.bytes, 0)
    const oldest = Object.entries(index.entries).sort(
      ([, left], [, right]) => left.lastAccess - right.lastAccess,
    )
    for (const [key, entry] of oldest) {
      if (total <= this.maxBytes) break
      if (key === keep) continue
      await Promise.all([
        this.store.delete(this.metaKey(key)),
        this.store.delete(this.formatKey(key)),
      ])
      delete index.entries[key]
      total -= entry.bytes
    }
  }

  private async delete(key: string): Promise<void> {
    await Promise.all([
      this.store.delete(this.metaKey(key)),
      this.store.delete(this.formatKey(key)),
    ])
    const index = await this.readIndex()
    if (index.entries[key]) {
      delete index.entries[key]
      await this.writeIndex(index)
    }
  }

  async clear(): Promise<void> {
    for (const key of await this.store.keys()) {
      if (key.startsWith(PREFIX)) await this.store.delete(key)
    }
  }
}
