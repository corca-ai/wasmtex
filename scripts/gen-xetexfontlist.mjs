#!/usr/bin/env node
/**
 * Generate `xetexfontlist.txt` — the font database WasmTex's XeTeX font manager
 * (XeTeXFontMgr_FC) reads to resolve fonts BY NAME (e.g. `\setmainfont{Latin Modern
 * Roman}`). Without it, only by-filename loading works in the browser (no fontconfig
 * cache). We build it from the mirrored OpenType/TrueType/Type1 fonts with `fc-scan`,
 * which already reports fontconfig-scale weight/width/slant.
 *
 * Record format (one field per line), per XeTeXFontMgr_FC.cpp:
 *   fontId / path / fontIndex / {n family names} / {n style names} / {n full names}
 *   / psName / subFamily / weight / width / slant / isReg / isBold / isItalic
 *   / designSize / minSize / maxSize / subFamilyID
 *
 * Usage (needs fontconfig's fc-scan):
 *   node scripts/gen-xetexfontlist.mjs [FONT_ROOT]            # default /tmp/texlive-s3/pdftex
 *   AWS_PROFILE=cc node scripts/gen-xetexfontlist.mjs --upload
 *
 * Uploads to s3://<bucket>/<year>/pdftex/26/xetexfontlist.txt (kpse tex format).
 */
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { objectStoreConfig, objectUri, runObjectStore } from './lib/object-store.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FONT_ROOT =
  process.argv.find((a) => !a.startsWith('--') && a.endsWith('pdftex')) || '/tmp/texlive-s3/pdftex'
const FONT_DIRS = ['47', '36', '32'] // opentype, truetype, type1
const OUT = process.env.XETEX_FONTLIST_OUTPUT || join(root, 'xetexfontlist.txt')
const STORE = objectStoreConfig()
const YEAR = process.env.TEXLIVE_YEAR || '2025'

const SEP = '\x1f' // ASCII unit separator — won't appear in font metadata
const FIELDS = ['file', 'index', 'family', 'style', 'fullname', 'postscriptname', 'weight', 'width', 'slant']
const FMT = `${FIELDS.map((k) => `%{${k}}`).join(SEP)}\n`

/** Split a fontconfig list value (comma-separated) into unique non-empty parts. */
function splitList(v) {
  const out = []
  const seen = new Set()
  for (const part of (v || '').split(',')) {
    const s = part.trim()
    if (s && !seen.has(s)) {
      seen.add(s)
      out.push(s)
    }
  }
  return out
}

function basename(p) {
  return p.slice(p.lastIndexOf('/') + 1)
}

/** Build one xetexfontlist record (array of lines) for a scanned font, or null. */
function record(fontId, fields) {
  const [file, index, family, style, fullname, psname, weight, width, slant] = fields
  const families = splitList(family)
  if (families.length === 0) return null
  const styles = splitList(style)
  const fulls = splitList(fullname)
  // fontconfig can report fractional weight/width/slant; the XeTeX parser reads
  // them with `>> int` and desyncs on a decimal point, so round to integers.
  const w = Math.round(Number(weight)) || 0
  const wd = Math.round(Number(width)) || 100
  const sl = Math.round(Number(slant)) || 0
  const isItalic = sl > 0 ? 1 : 0
  const isBold = w >= 200 ? 1 : 0
  const isReg = !isBold && !isItalic ? 1 : 0
  return [
    String(fontId),
    basename(file),
    String(Math.round(Number(index)) || 0),
    String(families.length),
    ...families,
    String(styles.length),
    ...styles,
    String(fulls.length),
    ...fulls,
    psname || families[0],
    styles[0] || 'Regular',
    String(w),
    String(wd),
    String(sl),
    String(isReg),
    String(isBold),
    String(isItalic),
    '0', // designSize (optical size unused)
    '0', // minSize
    '0', // maxSize
    '0', // subFamilyID
    // NOTE: the current XeTeXFontMgr_FC.cpp path reads subFamilyID TWICE (an upstream
    // copy-paste bug), so each record needs FIVE trailing numeric fields, not four.
    // Omitting this 5th field desyncs the parser after the first record.
    '0', // subFamilyID (read again by the buggy parser)
  ]
}

function main() {
  try {
    execSync('fc-scan --version', { stdio: 'ignore' })
  } catch {
    console.error('fc-scan (fontconfig) is required. Install fontconfig.')
    process.exit(1)
  }

  const out = []
  let fontId = 0
  let scanned = 0
  for (const fmt of FONT_DIRS) {
    const dir = join(FONT_ROOT, fmt)
    if (!existsSync(dir)) {
      console.log(`  (skip ${dir} — not present)`)
      continue
    }
    console.log(`Scanning ${dir} ...`)
    const raw = execFileSync('fc-scan', ['--format', FMT, dir], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
    })
    for (const line of raw.split('\n')) {
      if (!line.includes(SEP)) continue
      scanned++
      const rec = record(fontId, line.split(SEP))
      if (rec) {
        out.push(...rec)
        fontId++
      }
    }
  }

  writeFileSync(OUT, `${out.join('\n')}\n`)
  console.log(`\nScanned ${scanned} faces, wrote ${fontId} font records to ${OUT}`)

  if (process.argv.includes('--upload')) {
    const dest = objectUri(STORE, YEAR, 'pdftex', '26', 'xetexfontlist.txt')
    console.log(`Uploading to ${dest} ...`)
    runObjectStore(STORE, ['s3', 'cp', OUT, dest, '--content-type', 'text/plain',
      '--cache-control', 'public, max-age=31536000, immutable'], { stdio: 'inherit' })
    console.log('Upload complete. Regenerate the bloom filter + invalidate the CDN next.')
  }
}

main()
