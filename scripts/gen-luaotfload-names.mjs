#!/usr/bin/env node
/**
 * Generate `luaotfload-names.lua` — the luaotfload font-names database that lets
 * LuaLaTeX resolve fonts BY NAME (`\setmainfont{Latin Modern Roman}`) instead of
 * only by filename. It is the LuaLaTeX analog of `gen-xetexfontlist.mjs` (which
 * does the same for XeLaTeX). See docs/engine.md "Font resolution".
 *
 * Why a prebuilt DB: luaotfload normally builds this table by scanning font
 * directories at runtime, which the on-demand WASM model cannot do (kpse resolves
 * *requests*, it can't list dirs). So we generate the DB offline with a real
 * luaotfload and ship it; at runtime the worker drops it into luaotfload's cache
 * path. Entries scanned from a texmf tree get `location = "texmf"`, so luaotfload
 * resolves them through `kpse.find_file(basename)` → our CDN hook → fonts under
 * dir 47/36/4. (System-location entries can't resolve in WASM and simply fall
 * back; they are harmless.)
 *
 * EXACT-MIRROR (issue #73): pass `--fonts-dir <dir>` (with opentype/*.otf +
 * truetype/*.ttf — the CDN mirror's fonts) to scan EXACTLY the mirror set. The DB
 * font set then equals the mirror (zero dangling entries — names that resolve in
 * the DB but 404 on the CDN; zero uncovered — mirror fonts with no DB entry). The
 * generation wipes the image's own texmf fonts AND /usr/share/fonts (urw-base35
 * etc., which luaotfload finds via fontconfig and would otherwise leak in as
 * dangling entries). Without --fonts-dir, the image's own (possibly different TeX
 * Live year's) texmf is scanned — quick, but not mirror-exact.
 *
 * VERSION COUPLING (important): the DB's `meta.version` and the schema are tied to
 * the luaotfload release. We ship the PLAIN `.lua` (source), NOT the compiled
 * `.luc` — Lua bytecode bakes in pointer/int widths and is NOT portable from the
 * x86_64 generator to the wasm32 engine. The plain source is loaded by the engine's
 * own luaotfload (which would compile its own .luc if it wanted one). The generator
 * luaotfload version MUST match the engine's (see EXPECTED_* below); bump these when
 * the engine's TeX Live source is bumped.
 *
 * Usage:
 *   # 0. (exact-mirror) Sync the mirror fonts where AWS creds exist, then move them
 *   #    to the Docker host as <dir>/opentype/*.otf + <dir>/truetype/*.ttf:
 *   #    AWS_PROFILE=cc aws s3 sync s3://<bucket>/<year>/pdftex/47/ <dir>/opentype/
 *   #    AWS_PROFILE=cc aws s3 sync s3://<bucket>/<year>/pdftex/36/ <dir>/truetype/
 *   # 1. Generate in a Docker environment. Produces ./luaotfload-names.lua
 *   node scripts/gen-luaotfload-names.mjs --generate --fonts-dir <dir>   # exact-mirror (#73)
 *   node scripts/gen-luaotfload-names.mjs --generate                     # quick, not exact
 *   # 2. Upload from a host with AWS creds (AWS_PROFILE=cc)
 *   AWS_PROFILE=cc node scripts/gen-luaotfload-names.mjs --db ./luaotfload-names.lua --upload
 *   # (or do both at once where both Docker and creds exist)
 *   AWS_PROFILE=cc node scripts/gen-luaotfload-names.mjs --generate --fonts-dir <dir> --upload
 *
 * Uploads to s3://<bucket>/<year>/pdftex/51/luaotfload-names.lua (kpse lua format).
 * After uploading, the file is fetched DIRECTLY by the worker (not via kpse), so no
 * bloom-filter entry is required for the DB itself — but the fonts it references are
 * already mirrored under 47/36/4.
 */
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { objectStoreConfig, objectUri, runObjectStore } from './lib/object-store.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.env.LUAOTFLOAD_NAMES_OUTPUT || join(root, 'luaotfload-names.lua')
const STORE = objectStoreConfig()
const YEAR = process.env.TEXLIVE_YEAR || '2025'
// Must match the engine's bundled luaotfload (see wasm-build/texlive-source.ref).
// TeX Live 2025 → luaotfload 3.29 → names DB schema version 6.
const EXPECTED_LUAOTFLOAD = process.env.EXPECTED_LUAOTFLOAD || '3.29'
const EXPECTED_DB_VERSION = process.env.EXPECTED_DB_VERSION || '6'
const TEXLIVE_IMAGE = process.env.TEXLIVE_IMAGE || 'texlive/texlive:latest'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const optVal = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

/** Run the docker generation and write the plain .lua. `script` must emit ONLY the
 *  gzip bytes on stdout (human output → stderr), and `mounts` are extra `-v` args. */
function runDockerGenerate(script, mounts) {
  try {
    execSync('docker --version', { stdio: 'ignore' })
  } catch {
    console.error('docker is required for --generate.')
    process.exit(1)
  }
  const gz = execFileSync(
    'docker',
    ['run', '--rm', ...mounts, '-e', 'OSFONTDIR=', TEXLIVE_IMAGE, 'bash', '-lc', script],
    { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
  )
  writeFileSync(`${OUT}.gz`, gz)
  execSync(`gunzip -f ${OUT}.gz`, { stdio: 'inherit' })
  normalize(OUT)
  console.log(`Wrote ${OUT} (${(statSync(OUT).size / 1024 / 1024).toFixed(2)} MB)`)
}

/** Remove wall-clock and copied-file mtimes that luaotfload records but does not
 * use when WasmTex loads this read-only database. Font identity and metadata stay
 * unchanged, while rebuilding the same mirror yields byte-identical output. */
function normalize(path) {
  const before = readFileSync(path, 'utf8')
  let metadataDates = 0
  let fileTimestamps = 0
  const after = before
    .replace(/\["(?:created|modified)"\]="[^"]+"/g, (value) => {
      metadataDates++
      return value.replace(/="[^"]+"$/, '="1970-01-01 00:00:00"')
    })
    .replace(/\["timestamp"\]=\d+/g, () => {
      fileTimestamps++
      return '["timestamp"]=0'
    })
  if (metadataDates !== 2 || fileTimestamps === 0) {
    throw new Error(
      `Unexpected luaotfload DB metadata: dates=${metadataDates}, timestamps=${fileTimestamps}`,
    )
  }
  writeFileSync(path, after)
  console.log(`Normalized ${metadataDates} metadata dates and ${fileTimestamps} font mtimes.`)
}

/** Generate the names DB. With `fontsDir` (the mirror fonts: opentype/*.otf +
 *  truetype/*.ttf), scan EXACTLY those — the result is a DB that matches the CDN
 *  mirror with zero dangling/uncovered entries (issue #73). Without it, scan the
 *  image's own texmf (quicker, but the image's TeX Live year may differ from the
 *  mirror → some dangling/uncovered entries; fine for a quick test). */
function generate(fontsDir) {
  if (!fontsDir) {
    console.warn(
      'No --fonts-dir: generating against the image texmf (NOT mirror-exact — may leave ' +
        'dangling/uncovered by-name entries). Pass --fonts-dir for the exact-mirror DB.',
    )
    console.log(`Generating luaotfload names DB in ${TEXLIVE_IMAGE} (luaotfload-tool --update) ...`)
    runDockerGenerate(
      [
        'set -e',
        'export OSFONTDIR=',
        'luaotfload-tool --update --force >/tmp/upd.log 2>&1 || { tail -20 /tmp/upd.log >&2; exit 1; }',
        'd=$(find / -type d -path "*luatex-cache/generic/names" 2>/dev/null | head -1)',
        '[ -f "$d/luaotfload-names.lua.gz" ] || { echo "no names DB produced" >&2; exit 1; }',
        'cat "$d/luaotfload-names.lua.gz"',
      ].join('\n'),
      [],
    )
    return
  }
  if (!existsSync(join(fontsDir, 'opentype')) && !existsSync(join(fontsDir, 'truetype'))) {
    console.error(`--fonts-dir ${fontsDir} must contain opentype/ and/or truetype/ (the mirror fonts).`)
    process.exit(1)
  }
  console.log(`Generating EXACT-mirror DB from ${fontsDir} in ${TEXLIVE_IMAGE} ...`)
  // Scan ONLY the mirror fonts: wipe the image's texmf font trees AND /usr/share/fonts
  // (the urw-base35 system fonts luaotfload finds via fontconfig — these would be
  // dangling entries since they aren't on the CDN mirror), drop the mirror fonts in,
  // rebuild ls-R, then update. Result: DB font set == mirror font set.
  runDockerGenerate(
    [
      'set -e',
      'TD=$(find /usr/local/texlive -maxdepth 2 -type d -name texmf-dist | head -1)/fonts',
      'rm -rf "$TD/opentype" "$TD/truetype" "$TD/type1"',
      'rm -rf /usr/share/fonts/* 2>/dev/null || true',
      'mkdir -p "$TD/opentype/mirror" "$TD/truetype/mirror"',
      'cp /mirror/opentype/*.otf "$TD/opentype/mirror/" 2>/dev/null || true',
      'cp /mirror/truetype/*.ttf "$TD/truetype/mirror/" 2>/dev/null || true',
      'cp /mirror/truetype/*.ttc "$TD/truetype/mirror/" 2>/dev/null || true',
      'mktexlsr >/dev/null 2>&1',
      'luaotfload-tool --update --force >/tmp/upd.log 2>&1 || { tail -20 /tmp/upd.log >&2; exit 1; }',
      'd=$(find / -type d -path "*luatex-cache/generic/names" 2>/dev/null | head -1)',
      '[ -f "$d/luaotfload-names.lua.gz" ] || { echo "no names DB produced" >&2; exit 1; }',
      'cat "$d/luaotfload-names.lua.gz"',
    ].join('\n'),
    ['-v', `${resolve(fontsDir)}:/mirror:ro`],
  )
}

/** Verify the generated DB matches the engine's luaotfload (version + coverage). */
function verify(path) {
  if (!existsSync(path)) {
    console.error(`DB not found: ${path} (run with --generate first, or pass --db <path>)`)
    process.exit(1)
  }
  const text = readFileSync(path, 'utf8')
  const ver = text.match(/\["version"\]=(\d+)/)?.[1]
  if (ver !== EXPECTED_DB_VERSION) {
    console.error(
      `DB schema version mismatch: got ${ver}, engine expects ${EXPECTED_DB_VERSION} ` +
        `(luaotfload ${EXPECTED_LUAOTFLOAD}). The engine would reject this DB and rescan. ` +
        'Regenerate with a matching luaotfload, or bump EXPECTED_* if the engine was bumped.',
    )
    process.exit(1)
  }
  // Sanity: a few stable families must be present (catches an empty/partial scan).
  for (const probe of ['latinmodernroman', 'lmroman10-regular.otf', 'texgyretermes']) {
    if (!text.includes(probe)) {
      console.error(`DB is missing expected font marker "${probe}" — scan looks incomplete.`)
      process.exit(1)
    }
  }
  const mb = (statSync(path).size / 1024 / 1024).toFixed(2)
  console.log(`Verified DB: schema version ${ver}, ${mb} MB, common families present. ✓`)
}

function upload(path) {
  const dest = objectUri(STORE, YEAR, 'pdftex', '51', 'luaotfload-names.lua')
  console.log(`Uploading to ${dest} ...`)
  // Plain Lua text; CloudFront gzip-compresses it on the wire (~240 KB).
  runObjectStore(STORE, ['s3', 'cp', path, dest, '--content-type', 'text/plain',
    '--cache-control', 'public, max-age=31536000, immutable'], { stdio: 'inherit' })
  console.log(
    'Upload complete. The DB is fetched directly by the worker (no bloom entry needed). ' +
      'Invalidate the CDN path /' + YEAR + '/pdftex/51/luaotfload-names.lua for immediate effect.',
  )
}

function main() {
  if (!flag('--generate') && !optVal('--db') && !flag('--upload')) {
    console.error('Nothing to do. Use --generate and/or --upload (see header for usage).')
    process.exit(1)
  }
  if (flag('--generate')) generate(optVal('--fonts-dir'))
  const dbPath = optVal('--db') || OUT
  if (flag('--normalize') && !flag('--generate')) normalize(dbPath)
  verify(dbPath)
  if (flag('--upload')) upload(dbPath)
}

main()
