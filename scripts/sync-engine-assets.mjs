#!/usr/bin/env node
/**
 * Sync WasmTex engine assets from a deployed base URL into a local directory,
 * verifying each file against the published `manifest.json` (SHA-256).
 *
 * This is the consumer-facing way to self-host matching engine binaries (the WASM
 * engines + dvipdfmx + BibTeX + prebuilt `.fmt`/`.fmt.gz`): point it at any host
 * that serves the assets + manifest (the project's GitHub Pages / CDN, or your
 * own mirror), and you get a verified, deterministic set — no `gh run download`
 * head-sha matching by hand. See docs/engine.md.
 *
 * Usage:
 *   node scripts/sync-engine-assets.mjs --from <baseUrl> [--version 2025] [--dest <dir>] [--concurrency 8]
 *
 *   --from         base URL serving `wasmtex/<version>/manifest.json`
 *                  (e.g. https://corca-ai.github.io/wasmtex/)
 *   --version      TeX Live version (default 2025)
 *   --dest         output dir (default public/wasmtex/<version>)
 *
 * Exits non-zero if the manifest is missing or any file fails its hash check.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const from = arg('from')
if (!from) {
  console.error('Required: --from <baseUrl>  (e.g. https://corca-ai.github.io/wasmtex/)')
  process.exit(1)
}
const version = arg('version', '2025')
const concurrency = Number(arg('concurrency', '8'))
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = arg('dest', join(root, `public/wasmtex/${version}`))
const base = `${from.replace(/\/$/, '')}/wasmtex/${version}`

async function main() {
  const manifestUrl = `${base}/manifest.json`
  const resp = await fetch(manifestUrl)
  if (!resp.ok) {
    console.error(`Cannot fetch manifest: ${manifestUrl} (HTTP ${resp.status})`)
    process.exit(1)
  }
  const manifest = await resp.json()
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    console.error('Manifest has no files.')
    process.exit(1)
  }
  if (!manifest.legal || typeof manifest.legal.manifest !== 'string') {
    console.error('Manifest has no engine licensing metadata.')
    process.exit(1)
  }
  if (manifest.legal.releaseStatus !== 'release-cleared') {
    const blockerIds = Array.isArray(manifest.legal.releaseBlockers)
      ? manifest.legal.releaseBlockers.map((blocker) => blocker.id).filter(Boolean).join(', ')
      : 'unspecified'
    console.error(
      `Engine release is not cleared for redistribution (${manifest.legal.releaseStatus}; blockers: ${blockerIds}).`,
    )
    process.exit(1)
  }
  mkdirSync(dest, { recursive: true })
  console.log(`Syncing ${manifest.files.length} files (version ${version}) → ${dest}`)

  const failures = []
  let next = 0
  const worker = async () => {
    while (next < manifest.files.length) {
      const { name, sha256, bytes } = manifest.files[next++]
      try {
        const r = await fetch(`${base}/${name}`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const buf = new Uint8Array(await r.arrayBuffer())
        const got = createHash('sha256').update(buf).digest('hex')
        if (got !== sha256) throw new Error(`sha256 mismatch (expected ${sha256.slice(0, 12)}, got ${got.slice(0, 12)})`)
        if (typeof bytes === 'number' && buf.length !== bytes) throw new Error(`size ${buf.length} != ${bytes}`)
        writeFileSync(join(dest, name), buf)
        console.log(`  ✓ ${name}`)
      } catch (e) {
        failures.push(`${name}: ${e.message}`)
        console.error(`  ✗ ${name}: ${e.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, manifest.files.length) }, worker))

  if (failures.length) {
    console.error(`\nFAILED: ${failures.length} file(s) could not be synced/verified.`)
    process.exit(1)
  }
  console.log(`\nOK: ${manifest.files.length} files synced and verified.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
