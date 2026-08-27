#!/usr/bin/env node
/**
 * Audit the TeX Live S3 mirror coverage, by kpathsea format id.
 *
 * Turns "we don't know how complete the mirror is" into a snapshot: object count
 * and size per format, with the human name of each format and a flag for formats
 * that are expected but absent (e.g. OpenType/TrueType fonts, which the XeLaTeX /
 * LuaLaTeX engines in Stage 2 will need).
 *
 * Read-only. Requires AWS credentials:
 *   AWS_PROFILE=cc node scripts/audit-mirror.mjs
 *   AWS_PROFILE=cc node scripts/audit-mirror.mjs --bucket corca-fastlatex-texlib --year 2025
 *
 * Writes compat/mirror-coverage.md and prints a summary.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { objectStoreConfig, objectUri, runObjectStore } from './lib/object-store.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// kpathsea kpse_file_format_type ids (subset the mirror uses / may need).
const FORMAT_NAMES = {
  3: 'TFM font metrics (.tfm)',
  4: 'AFM font metrics (.afm)',
  6: 'BibTeX databases (.bib)',
  7: 'BibTeX styles (.bst)',
  10: 'format dumps (.fmt)',
  11: 'font maps (.map)',
  26: 'TeX sources (.sty/.cls/.tex/...)',
  32: 'Type1 fonts (.pfb)',
  33: 'virtual fonts (.vf)',
  36: 'TrueType fonts (.ttf)',
  44: 'encodings (.enc)',
  47: 'OpenType fonts (.otf)',
  51: 'Lua files (.lua)',
}

// Formats the current pdfTeX engine depends on — their absence is a real gap.
const PDFTEX_FORMATS = [3, 6, 7, 11, 26, 32, 33, 44]
// Formats the Stage 2 XeLaTeX/LuaLaTeX engines will additionally need.
const UNICODE_ENGINE_FORMATS = [4, 36, 47, 51]

// Curated common packages that MUST be on the mirror (dir 26) — a coverage gate
// so per-tree gaps are caught before users hit them. Weighted toward the
// Unicode/CJK packages that exercise each engine tex-tree (xeCJK→tex/xelatex,
// xetexko→tex/xetex, luatexja→tex/luatex, kotex→tex/latex), which is where the
// gaps have been (tex/xetex was omitted from the sync → xetexko missing).
const CURATED_PACKAGES = [
  'amsmath.sty', 'amssymb.sty', 'hyperref.sty', 'xcolor.sty', 'graphicx.sty', 'geometry.sty',
  'fontspec.sty', 'unicode-math.sty', 'polyglossia.sty',
  'xeCJK.sty', 'xetexko.sty', 'luatexja.sty', 'kotex.sty',
]

function parseArgs(argv) {
  const args = { year: '2025', check: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--bucket') process.env.TEXLIVE_OBJECT_BUCKET = argv[++i]
    else if (argv[i] === '--endpoint') process.env.TEXLIVE_OBJECT_ENDPOINT = argv[++i]
    else if (argv[i] === '--prefix') process.env.TEXLIVE_OBJECT_PREFIX = argv[++i]
    else if (argv[i] === '--year') args.year = argv[++i]
    else if (argv[i] === '--check') args.check = true
  }
  return args
}

/** Verify each curated package's file is present in dir 26. Returns the missing
 *  set. Lists dir 26 once (filenames are the last whitespace field). */
function checkCuratedPackages(store, year) {
  const present = new Set()
  for (const line of list(store, year, '26').split('\n')) {
    const name = line.trim().split(/\s+/).pop()
    if (name) present.add(name)
  }
  return CURATED_PACKAGES.filter((f) => !present.has(f))
}

function list(store, year, ...parts) {
  return runObjectStore(store, ['s3', 'ls', `${objectUri(store, year, 'pdftex', ...parts)}/`], {
    encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  })
}

/** Top-level "PRE <id>/" entries under the pdftex prefix. */
function listFormats(store, year) {
  const out = list(store, year)
  const ids = []
  for (const line of out.split('\n')) {
    const m = line.match(/PRE\s+([^/]+)\//)
    if (m) ids.push(m[1])
  }
  return ids
}

/** { objects, bytes } for one format prefix, via `aws s3 ls --summarize`. */
function summarize(store, year, fmt) {
  const out = runObjectStore(store,
    ['s3', 'ls', `${objectUri(store, year, 'pdftex', fmt)}/`, '--recursive', '--summarize'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  const objs = out.match(/Total Objects:\s*(\d+)/)
  const size = out.match(/Total Size:\s*(\d+)/)
  return { objects: objs ? Number(objs[1]) : 0, bytes: size ? Number(size[1]) : 0 }
}

function humanBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB']
  let v = n
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${v.toFixed(1)} ${units[u]}`
}

function main() {
  const { year, check } = parseArgs(process.argv.slice(2))
  const store = objectStoreConfig()
  console.log(`Auditing ${objectUri(store, year, 'pdftex')}/ ...`)

  const presentIds = new Set(listFormats(store, year))
  const rows = []
  let totalObjects = 0
  let totalBytes = 0

  // Union of present + expected, so missing expected formats show up as rows.
  const allIds = new Set([
    ...presentIds,
    ...PDFTEX_FORMATS.map(String),
    ...UNICODE_ENGINE_FORMATS.map(String),
  ])
  const sorted = [...allIds].sort((a, b) => Number(a) - Number(b))

  for (const fmt of sorted) {
    const name = FORMAT_NAMES[Number(fmt)] ?? '(unknown format id)'
    if (!presentIds.has(fmt)) {
      rows.push({ fmt, name, objects: 0, bytes: 0, present: false })
      continue
    }
    const { objects, bytes } = summarize(store, year, fmt)
    totalObjects += objects
    totalBytes += bytes
    rows.push({ fmt, name, objects, bytes, present: true })
    console.log(`  fmt ${fmt.padStart(2)}: ${String(objects).padStart(7)} objs  ${humanBytes(bytes).padStart(9)}  ${name}`)
  }

  const md = renderMarkdown({ store, year, rows, totalObjects, totalBytes })
  const outDir = join(root, 'compat')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'mirror-coverage.md')
  writeFileSync(outPath, md)

  console.log(`\nTotal: ${totalObjects} objects, ${humanBytes(totalBytes)}`)
  console.log(`Snapshot: ${outPath}`)

  const missingPdftex = PDFTEX_FORMATS.filter((f) => !presentIds.has(String(f)))
  const missingUnicode = UNICODE_ENGINE_FORMATS.filter((f) => !presentIds.has(String(f)))
  if (missingPdftex.length) {
    console.log(`\n⚠ pdfTeX-critical formats MISSING: ${missingPdftex.join(', ')}`)
  }
  if (missingUnicode.length) {
    console.log(`ℹ Stage 2 (XeLaTeX/LuaLaTeX) formats not yet mirrored: ${missingUnicode.join(', ')} ` +
      `(${missingUnicode.map((f) => FORMAT_NAMES[f]).join('; ')})`)
  }

  // Curated common-package coverage gate.
  const missingPkgs = checkCuratedPackages(store, year)
  if (missingPkgs.length) {
    console.log(`\n⚠ Curated packages MISSING from the mirror: ${missingPkgs.join(', ')}`)
  } else {
    console.log(`\n✓ All ${CURATED_PACKAGES.length} curated packages present.`)
  }

  // In --check (gate) mode, a real gap is a non-zero exit for CI/ops.
  if (check && (missingPdftex.length || missingPkgs.length)) {
    console.error('\nFAILED: mirror coverage gaps (see above).')
    process.exit(1)
  }
}

function renderMarkdown({ store, year, rows, totalObjects, totalBytes }) {
  const lines = []
  lines.push('# TeX Live mirror coverage', '')
  lines.push(`- Object prefix: \`${objectUri(store, year, 'pdftex')}/\``)
  if (process.env.TEXLIVE_DEPLOYED_URL) lines.push(`- Served by: \`${process.env.TEXLIVE_DEPLOYED_URL}\``)
  lines.push(`- Total: **${totalObjects} objects**, **${humanBytes(totalBytes)}**`)
  lines.push('')
  lines.push('| fmt | kpathsea format | objects | size | status |')
  lines.push('|---:|---|---:|---:|---|')
  for (const r of rows) {
    const status = r.present ? 'present' : '**MISSING**'
    lines.push(`| ${r.fmt} | ${r.name} | ${r.objects} | ${humanBytes(r.bytes)} | ${status} |`)
  }
  lines.push('')
  lines.push('## Notes', '')
  lines.push('- pdfTeX-critical formats: 3, 6, 7, 11, 26, 32, 33, 44.')
  lines.push('- XeLaTeX/LuaLaTeX additionally need 4 (afm), 36 (truetype), 47 (opentype), 51 (lua).')
  lines.push('- The sync mirrors `tex/{latex,generic,plain,xetex,xelatex,luatex,lualatex}` — so')
  lines.push('  engine-specific packages (`xeCJK`, `xetexko`, `luatexja`, …) are included.')
  lines.push('- Run `--check` to gate a curated common-package set (catches per-tree gaps).')
  lines.push('')
  return lines.join('\n')
}

main()
