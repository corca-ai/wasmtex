import { parseAuxFile } from './aux-parser'
import type { AuxData } from './types'

/** Compiler-output paths are relative to the TeX working directory, including
 * paths named by @input in a nested main document's aux file. */
export interface AuxFileSet {
  root: string
  files: Readonly<Record<string, string>>
}

const MAX_FILES = 1024
const MAX_CODE_UNITS = 2 * 1024 * 1024

function auxPath(value: string): string | null {
  if (
    value.startsWith('/') ||
    /[\\{}%:#$~]/.test(value) ||
    [...value].some((char) => char.charCodeAt(0) < 32)
  )
    return null
  const parts: string[] = []
  for (const part of value.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) return null
      parts.pop()
    } else parts.push(part)
  }
  const path = parts.join('/')
  return path.endsWith('.aux') ? path : null
}

/** Read only aux paths discovered from compiler output. The callback is the
 * host's authorization boundary, e.g. compiler.readOutput, never project fetch. */
export async function readAuxFiles(
  root: string,
  read: (path: string) => Promise<string | null>,
): Promise<AuxFileSet> {
  const files: Record<string, string> = Object.create(null)
  const pending = [root]
  const seen = new Set<string>()
  let size = 0
  while (pending.length && seen.size < MAX_FILES) {
    const path = auxPath(pending.shift()!)
    if (!path || seen.has(path)) continue
    seen.add(path)
    const content = await read(path)
    if (content === null) continue
    size += content.length
    if (size > MAX_CODE_UNITS) break
    files[path] = content
    pending.push(...parseAuxFile(content).includes.slice(0, MAX_FILES))
  }
  return { root, files }
}

function mergeAuxData(target: AuxData, source: AuxData, seen: Set<string>, ambiguous: Set<string>) {
  for (const key of source.ambiguousLabels ?? []) ambiguous.add(key)
  for (const [key, value] of source.labels) {
    if (seen.has(key)) ambiguous.add(key)
    seen.add(key)
    target.labels.set(key, value)
  }
  for (const [key, value] of source.labelDetails ?? []) target.labelDetails?.set(key, value)
  for (const key of source.citations) target.citations.add(key)
  target.includes.push(...source.includes)
}

function excludeAmbiguousLabels(data: AuxData, ambiguous: Set<string>) {
  for (const key of ambiguous) {
    data.labels.delete(key)
    data.labelDetails?.delete(key)
  }
  data.ambiguousLabels = ambiguous
}

/** Resolve @input recursively using only explicitly supplied output bytes.
 * Incomplete graphs retain diagnostic data but cannot supply reference hints. */
export function parseAuxFiles(input: AuxFileSet): AuxData {
  const result: AuxData = {
    labels: new Map(),
    labelDetails: new Map(),
    citations: new Set(),
    includes: [],
    complete: true,
  }
  const pending = [input.root]
  const seen = new Set<string>()
  const labelsSeen = new Set<string>()
  const ambiguous = new Set<string>()
  let size = 0
  while (pending.length) {
    const path = auxPath(pending.pop()!)
    if (!path) {
      result.complete = false
      continue
    }
    if (seen.has(path)) continue
    seen.add(path)
    if (seen.size > MAX_FILES) {
      result.complete = false
      break
    }
    const content = Object.hasOwn(input.files, path) ? input.files[path] : undefined
    if (content === undefined) {
      result.complete = false
      continue
    }
    size += content.length
    if (size > MAX_CODE_UNITS) {
      result.complete = false
      break
    }
    const parsed = parseAuxFile(content)
    if (parsed.includes.length > MAX_FILES) {
      result.complete = false
      break
    }
    mergeAuxData(result, parsed, labelsSeen, ambiguous)
    pending.push(...[...parsed.includes].reverse())
  }
  excludeAmbiguousLabels(result, ambiguous)
  return result
}
