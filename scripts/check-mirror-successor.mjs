#!/usr/bin/env node
/**
 * Prove a mirror revision kept every file of the one it follows.
 *
 * A document that compiled against the old mirror sees the same bytes for every name it
 * found there, so its format stays valid and only names it could not find before can
 * change the outcome. Prints what the successor adds, by kpathsea format.
 *
 * Usage: node scripts/check-mirror-successor.mjs <old-provenance.json> <new-provenance.json>
 */
import { readFileSync } from 'node:fs'

export function compareMirrors(before, after) {
  const files = new Map(after.files.map((file) => [file.key, file]))
  const failures = []
  for (const file of before.files) {
    const successor = files.get(file.key)
    if (!successor) failures.push(`${file.key}: missing from the successor`)
    else if (successor.sha256 !== file.sha256) failures.push(`${file.key}: content changed`)
    files.delete(file.key)
  }
  const added = new Map()
  for (const file of files.values()) {
    const entry = added.get(file.format) ?? { files: 0, bytes: 0 }
    added.set(file.format, { files: entry.files + 1, bytes: entry.bytes + file.bytes })
  }
  return { failures, added: Object.fromEntries([...added].sort(([a], [b]) => a - b)) }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [beforePath, afterPath] = process.argv.slice(2)
  if (!beforePath || !afterPath) {
    console.error('usage: check-mirror-successor.mjs <old-provenance.json> <new-provenance.json>')
    process.exit(1)
  }
  const [before, after] = [beforePath, afterPath].map((path) => JSON.parse(readFileSync(path, 'utf8')))
  const { failures, added } = compareMirrors(before, after)
  for (const failure of failures.slice(0, 20)) console.error(failure)
  if (failures.length > 0) {
    console.error(`${failures.length} files of ${before.mirrorRevision} did not survive`)
    process.exit(1)
  }
  console.log(`${after.mirrorRevision} keeps all ${before.files.length} files of ${before.mirrorRevision}`)
  console.log(JSON.stringify(added))
}
