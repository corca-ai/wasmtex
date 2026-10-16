import type { NormalizedVisibleText } from './visible-text-normalize'
import { normalizeNavigationText } from './visible-text-normalize'

export interface VisibleTextOccurrence<T> {
  owner: T
  start: number
  end: number
  normalizedStart: number
  normalizedEnd: number
  contextBefore: number
  contextAfter: number
}

export interface VisibleTextCandidates<T> {
  candidates: VisibleTextOccurrence<T>[]
  /** A clipped search must never be interpreted as proof of uniqueness. */
  truncated: boolean
}

interface Entry<T> {
  owner: T
  normalized: NormalizedVisibleText
}

export interface VisibleTextQueryOptions {
  contextBefore?: string
  contextAfter?: string
  maxCandidates?: number
}

function suffixLength(left: string, right: string) {
  let length = 0
  while (
    length < left.length &&
    length < right.length &&
    left[left.length - 1 - length] === right[right.length - 1 - length]
  )
    length++
  return length
}

function prefixLength(left: string, right: string) {
  let length = 0
  while (length < left.length && length < right.length && left[length] === right[length]) length++
  return length
}

/** Bounded, reusable substring index. Owners carry source or renderer identities. */
export class VisibleTextCatalog<T> {
  private readonly entries: Entry<T>[] = []
  private readonly grams = new Map<string, Set<number>>()
  private postings = 0
  private units = 0
  private clipped = false

  constructor(
    private readonly maxUnits = 2_000_000,
    private readonly maxEntries = 8192,
  ) {}

  add(owner: T, normalized: NormalizedVisibleText) {
    if (
      this.entries.length >= this.maxEntries ||
      this.units + normalized.text.length > this.maxUnits
    ) {
      this.clipped = true
      return false
    }
    const index = this.entries.length
    this.entries.push({ owner, normalized })
    this.units += normalized.text.length
    for (let offset = 0; offset + 3 <= normalized.text.length; offset++) {
      const gram = normalized.text.slice(offset, offset + 3)
      let bucket = this.grams.get(gram)
      if ((!bucket && this.grams.size >= 32_768) || this.postings >= 200_000) {
        this.clipped = true
        continue
      }
      if (!bucket) {
        bucket = new Set()
        this.grams.set(gram, bucket)
      }
      if (!bucket.has(index)) {
        bucket.add(index)
        this.postings++
      }
    }
    return true
  }

  private candidateEntries(query: string) {
    let pool: ReadonlySet<number> | undefined
    for (let offset = 0; offset + 3 <= query.length; offset++) {
      const bucket = this.grams.get(query.slice(offset, offset + 3))
      if (!bucket) return undefined
      if (!pool || bucket.size < pool.size) pool = bucket
    }
    return pool
  }

  find(text: string, options: VisibleTextQueryOptions = {}): VisibleTextCandidates<T> {
    const result: VisibleTextCandidates<T> = { candidates: [], truncated: this.clipped }
    if (text.length > 4096) return result
    const query = normalizeNavigationText(text).text
    // A short token alone is insufficient navigation evidence.
    if (query.length < 4 || query.length > 512) return result
    const pool = this.candidateEntries(query)
    const before = normalizeNavigationText((options.contextBefore ?? '').slice(-128)).text
    const after = normalizeNavigationText((options.contextAfter ?? '').slice(0, 128)).text
    const limit = Math.max(
      1,
      Math.min(
        64,
        Math.floor(Number.isFinite(options.maxCandidates) ? options.maxCandidates! : 32),
      ),
    )
    let examined = 0
    for (const index of pool ?? []) {
      if (++examined > 256) {
        result.truncated = true
        break
      }
      const entry = this.entries[index]!
      let offset = entry.normalized.text.indexOf(query)
      while (offset !== -1) {
        if (result.candidates.length >= limit) {
          result.truncated = true
          return result
        }
        const end = offset + query.length
        result.candidates.push({
          owner: entry.owner,
          start: entry.normalized.starts[offset]!,
          end: entry.normalized.ends[end - 1]!,
          normalizedStart: offset,
          normalizedEnd: end,
          contextBefore: suffixLength(
            before,
            entry.normalized.text.slice(Math.max(0, offset - 128), offset).trimEnd(),
          ),
          contextAfter: prefixLength(
            after,
            entry.normalized.text.slice(end, end + 128).trimStart(),
          ),
        })
        offset = entry.normalized.text.indexOf(query, offset + 1)
      }
    }
    return result
  }
}
