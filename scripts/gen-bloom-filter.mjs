#!/usr/bin/env node
/**
 * Generate a bloom filter from the TeX Live CDN file listing.
 *
 * The bloom filter lets the WASM worker skip sync XHR for files that
 * definitely don't exist on the CDN, eliminating 403 console errors.
 *
 * Usage:
 *   node scripts/gen-bloom-filter.mjs                  # generate bloom-filter.bin
 *   node scripts/gen-bloom-filter.mjs --upload          # generate + upload to S3
 *
 * Prerequisites:
 *   AWS CLI configured with access to the texlive S3 bucket.
 *
 * Binary format:
 *   [4 bytes] magic "BF01"
 *   [1 byte]  k (number of hash functions)
 *   [4 bytes] m (number of bits), big-endian uint32
 *   [ceil(m/8) bytes] bit array
 *
 * Hash: FNV-1a double hashing — h_i = (h1 + i * h2) mod m
 */

import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const S3_BUCKET = 's3://corca-wasmtex-texlib'
const S3_PREFIX = '2025/pdftex/'
const OUTPUT_FILE = join(__dirname, '..', 'bloom-filter.bin')

// Bloom filter parameters
const FALSE_POSITIVE_RATE = 0.01

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

// --- S3 file listing ---------------------------------------------------------

function listS3Files() {
  console.log(`Listing files from ${S3_BUCKET}/${S3_PREFIX}...`)

  const raw = execSync(`aws s3 ls ${S3_BUCKET}/${S3_PREFIX} --recursive`, {
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
    const rel = fullKey.replace(/^2025\/pdftex\//, '')

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
  const keys = listS3Files()
  console.log(`Found ${keys.length} files (excluding pk/)`)

  if (keys.length === 0) {
    console.error('No files found. Check AWS credentials and bucket access.')
    process.exit(1)
  }

  const filter = buildBloomFilter(keys)
  const buf = serializeBloomFilter(filter)

  writeFileSync(OUTPUT_FILE, buf)
  console.log(`\nWritten ${OUTPUT_FILE} (${buf.length} bytes, ${(buf.length / 1024).toFixed(1)} KB)`)

  // Upload if --upload flag is set
  if (process.argv.includes('--upload')) {
    const s3Dest = `${S3_BUCKET}/2025/bloom-filter.bin`
    console.log(`\nUploading to ${s3Dest}...`)
    execSync(
      `aws s3 cp ${OUTPUT_FILE} ${s3Dest} --content-type application/octet-stream --cache-control "public, max-age=86400"`,
      { stdio: 'inherit' },
    )
    console.log('Upload complete.')
  }
}

main()
