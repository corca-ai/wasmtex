import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export function localInventory(root) {
  const files = []
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) {
        const bytes = readFileSync(path)
        files.push({
          key: relative(root, path).split(sep).join('/'),
          size: statSync(path).size,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        })
      }
    }
  }
  visit(root)
  return files
}

export function compareInventory(expected, actual) {
  const actualByKey = new Map(actual.map((item) => [item.key, item]))
  const errors = []
  for (const item of expected) {
    const found = actualByKey.get(item.key)
    if (!found) errors.push(`missing object: ${item.key}`)
    else {
      if (found.size !== item.size) errors.push(`size mismatch: ${item.key}`)
      if (found.sha256 !== item.sha256) errors.push(`SHA-256 mismatch: ${item.key}`)
      actualByKey.delete(item.key)
    }
  }
  for (const key of [...actualByKey.keys()].sort()) errors.push(`stale object: ${key}`)
  return errors
}
