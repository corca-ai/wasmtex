#!/usr/bin/env node
// A heap-checkpoint build instruments only the functions named in its Asyncify onlylist.
// Resolve those names to function indices, then remove the name section so the release
// binary carries no symbols. The worker refuses a checkpoint whose stack holds any other
// WebAssembly frame, because unwinding through an uninstrumented frame corrupts it.
//
//   node scripts/checkpoint-frames.mjs <engine.wasm> <engine.js> '<json array of names>' [--keep-names]
//
// appends `self.wasmtexCheckpointFrames=[...]` to the generated <engine.js> and rewrites
// <engine.wasm> without its name section (a diagnostic build passes --keep-names).
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function reader(bytes, offset = 0) {
  return {
    get offset() {
      return offset
    },
    set offset(value) {
      offset = value
    },
    uint() {
      let value = 0
      for (let shift = 0; shift < 35; shift += 7) {
        if (offset >= bytes.length) throw Error('Truncated WebAssembly integer')
        const byte = bytes[offset++]
        value += (byte & 127) * 2 ** shift
        if (!(byte & 128)) return value
      }
      throw Error('Invalid WebAssembly integer')
    },
    string() {
      const length = this.uint()
      const end = offset + length
      if (end > bytes.length) throw Error('Truncated WebAssembly name')
      const text = new TextDecoder().decode(bytes.subarray(offset, end))
      offset = end
      return text
    },
  }
}

/** Top-level sections as {id, name?, start, end}, where start..end spans the whole section. */
function sections(bytes) {
  const out = []
  const r = reader(bytes, 8)
  while (r.offset < bytes.length) {
    const start = r.offset
    const id = bytes[r.offset++]
    const size = r.uint()
    const body = r.offset
    const end = body + size
    if (end > bytes.length) throw Error('Truncated WebAssembly section')
    const name = id === 0 ? reader(bytes, body).string() : undefined
    out.push({ id, name, start, body, end })
    r.offset = end
  }
  return out
}

/** Function index -> name, from the function-name subsection of a name section. */
export function functionNames(bytes) {
  const names = new Map()
  for (const section of sections(bytes)) {
    if (section.name !== 'name') continue
    const r = reader(bytes, section.body)
    r.string()
    while (r.offset < section.end) {
      const id = bytes[r.offset++]
      const size = r.uint()
      const end = r.offset + size
      if (id === 1) {
        for (let n = r.uint(); n > 0; n--) {
          const index = r.uint()
          names.set(index, r.string())
        }
      }
      r.offset = end
    }
  }
  return names
}

/** The module without its name section; every other byte is kept in order. */
export function stripNames(bytes) {
  const kept = [bytes.subarray(0, 8)]
  for (const section of sections(bytes)) {
    if (section.name !== 'name') kept.push(bytes.subarray(section.start, section.end))
  }
  return new Uint8Array(Buffer.concat(kept))
}

/** Indices of the onlylist functions; every name must name exactly one function. */
export function checkpointFrames(bytes, wanted) {
  const names = functionNames(bytes)
  if (names.size === 0) throw Error('checkpoint build has no function names')
  const byName = new Map()
  for (const [index, name] of names) byName.set(name, [...(byName.get(name) ?? []), index])
  return wanted.map((name) => {
    const indices = byName.get(name) ?? []
    if (indices.length !== 1) throw Error(`onlylist function ${name} matches ${indices.length} functions`)
    return indices[0]
  })
}

// The build container owns its outputs; replace them instead of writing in place.
function replaceFile(path, data) {
  writeFileSync(`${path}.tmp`, data)
  renameSync(`${path}.tmp`, path)
}

async function main() {
  const [wasmPath, gluePath, list, flag] = process.argv.slice(2)
  if (!wasmPath || !gluePath || !list) throw Error('usage: checkpoint-frames.mjs <wasm> <js> <json names> [--keep-names]')
  const bytes = new Uint8Array(readFileSync(wasmPath))
  const frames = checkpointFrames(bytes, JSON.parse(list))
  replaceFile(gluePath, `${readFileSync(gluePath, 'utf8')}\nself.wasmtexCheckpointFrames=${JSON.stringify(frames)};\n`)
  if (flag === '--keep-names') {
    console.log(`checkpoint frames: ${frames.length} functions, names kept`)
    return
  }
  const stripped = stripNames(bytes)
  new WebAssembly.Module(stripped)
  replaceFile(wasmPath, stripped)
  console.log(`checkpoint frames: ${frames.length} functions, name section removed (${bytes.length - stripped.length} bytes)`)
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
