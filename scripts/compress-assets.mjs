#!/usr/bin/env node
// Gzip-compress large static assets for preloading.
// Creates .gz copies alongside the originals (originals are kept for fallback).
//
// Usage: node scripts/compress-assets.mjs

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { gzipSync } from 'zlib'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const targets = [
  // The pdfTeX .fmt has high entropy, so gzip saves <2% and is not worth shipping.
  // XeTeX/LuaTeX formats compress materially and their build workflows create .fmt.gz.
  // fetchGzWithFallback() handles either deployment shape by falling back to raw .fmt.
  //
  // pdftex.map is now fetched directly from CDN (warmup pre-loads it in the engine).
  // The public/texlive/ bundle has been removed — all TeX Live files come from CDN.
]

let totalSaved = 0

for (const rel of targets) {
  const src = join(root, rel)
  const dst = src + '.gz'

  try {
    const raw = readFileSync(src)
    const gz = gzipSync(raw, { level: 9 })
    writeFileSync(dst, gz)

    const rawSize = raw.length
    const gzSize = gz.length
    const pct = ((1 - gzSize / rawSize) * 100).toFixed(1)
    totalSaved += rawSize - gzSize

    console.log(`${rel}: ${(rawSize / 1024).toFixed(0)} KB → ${(gzSize / 1024).toFixed(0)} KB (${pct}% smaller)`)
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`SKIP ${rel} (not found)`)
    } else {
      throw err
    }
  }
}

console.log(`\nTotal saved: ${(totalSaved / 1024 / 1024).toFixed(1)} MB`)
