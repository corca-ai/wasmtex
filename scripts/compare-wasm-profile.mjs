#!/usr/bin/env node
// Compare optimized executable bytes before attributing a release CPU profile
// using names from a diagnostic build. Linker maps are not sufficient evidence.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

function countFunctionNames(payload) {
  const bytes = new Uint8Array(payload)
  let offset = 0
  const uint = () => {
    let value = 0
    for (let shift = 0; shift < 35; shift += 7) {
      if (offset >= bytes.length) throw Error('Truncated name section')
      const byte = bytes[offset++]
      value += (byte & 127) * 2 ** shift
      if (!(byte & 128)) return value
    }
    throw Error('Invalid name-section integer')
  }
  let count = 0
  while (offset < bytes.length) {
    const id = bytes[offset++]
    const size = uint()
    const end = offset + size
    if (end > bytes.length) throw Error('Truncated name subsection')
    if (id === 1) {
      const entries = uint()
      for (let index = 0; index < entries; index++) {
        uint() // function index
        const length = uint()
        offset += length
        if (offset > end) throw Error('Truncated function name')
        if (length) count++
      }
      if (offset !== end) throw Error('Invalid function-name subsection')
    }
    offset = end
  }
  return count
}

export function inspectWasm(bytes) {
  // Validation catches malformed sections and unsupported/truncated modules.
  const module = new WebAssembly.Module(bytes)
  let offset = 8
  const sections = []
  const core = [bytes.subarray(0, 8)]
  while (offset < bytes.length) {
    const start = offset
    const id = bytes[offset++]
    let size = 0
    let shift = 0
    let value
    do {
      value = bytes[offset++]
      size += (value & 127) * 2 ** shift
      shift += 7
    } while (value & 128)
    const end = offset + size
    if (id !== 0) {
      const data = bytes.subarray(start, end)
      core.push(data)
      sections.push({ id, bytes: data.length, sha256: digest(data) })
    }
    offset = end
  }
  return {
    bytes: bytes.length,
    sha256: digest(bytes),
    coreSha256: digest(Buffer.concat(core)),
    nameSectionBytes: WebAssembly.Module.customSections(module, 'name').map((s) => s.byteLength),
    namedFunctions: WebAssembly.Module.customSections(module, 'name').reduce((sum, s) => sum + countFunctionNames(s), 0),
    sections,
  }
}

export function compareWasm(baseline, diagnostic) {
  const left = inspectWasm(baseline)
  const right = inspectWasm(diagnostic)
  return {
    executableBytesEqual: left.coreSha256 === right.coreSha256,
    diagnosticHasNames: right.namedFunctions > 0,
    baseline: left,
    diagnostic: right,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [baseline, diagnostic, ...extra] = process.argv.slice(2)
  if (!baseline || !diagnostic || extra.length) {
    throw new Error('Usage: node scripts/compare-wasm-profile.mjs BASELINE.wasm DIAGNOSTIC.wasm')
  }
  const result = compareWasm(readFileSync(baseline), readFileSync(diagnostic))
  console.log(JSON.stringify(result, null, 2))
  if (!result.executableBytesEqual || !result.diagnosticHasNames) process.exitCode = 1
}
