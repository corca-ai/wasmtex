#!/usr/bin/env node
/**
 * Generate a bloom filter from a TeX Live mirror file listing.
 *
 * The bloom filter lets the WASM worker skip sync XHR for files that
 * definitely don't exist on the CDN, eliminating 403 console errors.
 *
 * Usage:
 *   node scripts/gen-bloom-filter.mjs                  # list the configured object store
 *   TEXLIVE_MIRROR_ROOT=/release node scripts/gen-bloom-filter.mjs
 *   TEXLIVE_PROVENANCE=texlive-provenance.json node scripts/gen-bloom-filter.mjs
 *   node scripts/gen-bloom-filter.mjs --upload
 *
 * Output: `bloom-filter.v2.bin` at a 1e-4 false-positive rate (~19 bits per key,
 * ~390 KB for a 160k-file snapshot). The engine fetches this name first and
 * falls back to the original `bloom-filter.bin` (1e-2, ~193 KB) on snapshots
 * published before it existed. A false positive costs one mirror round trip
 * per compile for every document that asks for that name, so the tighter rate
 * pays for its size on the first cold compile.
 *
 * Prerequisites:
 *   A scoped CLI profile configured for the TeX Live R2 bucket.
 *
 * Binary format:
 *   [4 bytes] magic "BF01"
 *   [1 byte]  k (number of hash functions)
 *   [4 bytes] m (number of bits), big-endian uint32
 *   [ceil(m/8) bytes] bit array
 *
 * Hash: FNV-1a double hashing — h_i = (h1 + i * h2) mod m
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname, relative } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

import { objectStoreConfig, objectUri, runObjectStore } from './lib/object-store.mjs'

const STORE = objectStoreConfig()
const YEAR = process.env.TEXLIVE_YEAR || '2025'
const MIRROR_ROOT = objectUri(STORE, YEAR, 'pdftex')
const LOCAL_MIRROR_ROOT = process.env.TEXLIVE_MIRROR_ROOT
const PROVENANCE_FILE = process.env.TEXLIVE_PROVENANCE
export const BLOOM_OBJECT_NAME = 'bloom-filter.v2.bin'
const OUTPUT_FILE = process.env.TEXLIVE_BLOOM_OUTPUT || join(__dirname, '..', BLOOM_OBJECT_NAME)

// Bloom filter parameters
const FALSE_POSITIVE_RATE = Number(process.env.TEXLIVE_BLOOM_FALSE_POSITIVE_RATE || 0.0001)

// --- FNV-1a hash (matches pdftex-worker.js) ----------------------------------

function fnv1a(str) {
  let h1 = 0x811c9dc5 | 0
  let h2 = 0x01000193 | 0
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 = h1 ^ c
    h1 = Math.imul(h1, 0x01000193)
    h2 = h2 ^ c
    h2 = Math.imul(h2, 0x01000193)
  }
  return [h1 >>> 0, h2 >>> 0]
}

// --- R2 file listing ---------------------------------------------------------

function listMirrorFiles() {
  if (PROVENANCE_FILE) {
    // The published provenance manifest already names every object under
    // `pdftex/`, so a snapshot's filter can be rebuilt from the mirror alone.
    console.log(`Listing files from ${PROVENANCE_FILE}...`)
    const manifest = JSON.parse(readFileSync(PROVENANCE_FILE, 'utf8'))
    const marker = 'pdftex/'
    const keys = []
    for (const file of manifest.files) {
      if (typeof file.key !== 'string' || !file.key.startsWith(marker)) continue
      const rel = file.key.slice(marker.length)
      if (!rel.startsWith('pk/')) keys.push(rel)
    }
    return keys.sort()
  }
  if (LOCAL_MIRROR_ROOT) {
    const pdftexRoot = join(LOCAL_MIRROR_ROOT, 'pdftex')
    console.log(`Listing files from ${pdftexRoot}/...`)
    const keys = []
    const visit = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) visit(path)
        else if (entry.isFile()) {
          const key = relative(pdftexRoot, path).split('\\').join('/')
          if (!key.startsWith('pk/')) keys.push(key)
        }
      }
    }
    visit(pdftexRoot)
    return keys.sort()
  }

  console.log(`Listing files from ${MIRROR_ROOT}/...`)

  const raw = runObjectStore(STORE, ['s3', 'ls', `${MIRROR_ROOT}/`, '--recursive'], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  })

  const keys = []
  for (const line of raw.split('\n')) {
    // Format: "2024-01-01 00:00:00    12345 2025/pdftex/3/cmr10"
    const match = line.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\d+\s+(.+)/)
    if (!match) continue

    const fullKey = match[1]
    // Extract format/filename from "2025/pdftex/FORMAT/FILENAME"
    const marker = `${YEAR}/pdftex/`
    const rel = fullKey.slice(fullKey.indexOf(marker) + marker.length)

    // Skip pk/ directory (PK fonts are rare and managed separately)
    if (rel.startsWith('pk/')) continue

    // rel is now "FORMAT/FILENAME" — exactly the bloom filter key
    keys.push(rel)
  }

  return keys
}

// --- Bloom filter construction -----------------------------------------------

function buildBloomFilter(keys) {
  const n = keys.length
  // m = -n * ln(p) / (ln(2))^2
  const m = Math.ceil((-n * Math.log(FALSE_POSITIVE_RATE)) / (Math.LN2 * Math.LN2))
  // k = (m/n) * ln(2)
  const k = Math.round((m / n) * Math.LN2)

  console.log(`Bloom filter: n=${n}, m=${m}, k=${k}, size=${Math.ceil(m / 8)} bytes`)

  const bytes = new Uint8Array(Math.ceil(m / 8))

  for (const key of keys) {
    const [h1, h2] = fnv1a(key)
    for (let i = 0; i < k; i++) {
      const bit = ((h1 + Math.imul(i, h2)) >>> 0) % m
      const byteIdx = bit >>> 3
      const bitIdx = bit & 7
      bytes[byteIdx] |= 1 << bitIdx
    }
  }

  // Verify: all inserted keys should test positive
  let falseNegatives = 0
  for (const key of keys) {
    const [h1, h2] = fnv1a(key)
    let found = true
    for (let i = 0; i < k; i++) {
      const bit = ((h1 + Math.imul(i, h2)) >>> 0) % m
      const byteIdx = bit >>> 3
      const bitIdx = bit & 7
      if ((bytes[byteIdx] & (1 << bitIdx)) === 0) {
        found = false
        break
      }
    }
    if (!found) falseNegatives++
  }
  if (falseNegatives > 0) {
    console.error(`ERROR: ${falseNegatives} false negatives detected!`)
    process.exit(1)
  }

  return { bits: bytes, m, k }
}

function serializeBloomFilter({ bits, m, k }) {
  // Header: "BF01" (4 bytes) + k (1 byte) + m (4 bytes big-endian)
  const header = Buffer.alloc(9)
  header.write('BF01', 0, 'ascii')
  header[4] = k
  header.writeUInt32BE(m, 5)

  return Buffer.concat([header, Buffer.from(bits)])
}

// --- Main --------------------------------------------------------------------

function main() {
  const keys = listMirrorFiles()
  console.log(`Found ${keys.length} files (excluding pk/)`)

  if (keys.length === 0) {
    console.error('No files found. Check the local mirror root or object-store access.')
    process.exit(1)
  }

  const filter = buildBloomFilter(keys)
  const buf = serializeBloomFilter(filter)

  writeFileSync(OUTPUT_FILE, buf)
  console.log(`\nWritten ${OUTPUT_FILE} (${buf.length} bytes, ${(buf.length / 1024).toFixed(1)} KB)`)

  // Upload if --upload flag is set
  if (process.argv.includes('--upload')) {
    const objectDest = objectUri(STORE, YEAR, BLOOM_OBJECT_NAME)
    console.log(`\nUploading to ${objectDest}...`)
    runObjectStore(STORE, ['s3', 'cp', OUTPUT_FILE, objectDest, '--content-type',
      'application/octet-stream', '--cache-control', 'public, max-age=31536000, immutable'], { stdio: 'inherit' })
    console.log('Upload complete.')
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
