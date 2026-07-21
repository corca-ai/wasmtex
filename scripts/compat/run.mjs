#!/usr/bin/env node
/**
 * Compatibility harness — measure what fraction of real LaTeX documents compile,
 * and bucket the failures by root cause.
 *
 * It spins up the Vite dev server, drives the real headless engine in Chromium
 * against the live TeX Live CDN, and classifies every compile log via
 * `src/compat/classify.ts`. The output (compat/report.{json,md}) is a ranked,
 * actionable backlog: "X% need XeLaTeX", "top missing packages are …", etc.
 *
 * Usage:
 *   node scripts/compat/run.mjs                       # built-in seed corpus
 *   node scripts/compat/run.mjs --corpus /path/dir    # external corpus (e.g. arXiv dumps)
 *   node scripts/compat/run.mjs --limit 200           # cap number of cases
 *   node scripts/compat/run.mjs --self-test           # fail (exit 1) on any expect.json mismatch
 *   node scripts/compat/run.mjs --timeout 90000       # per-case wall-clock budget (ms)
 *
 * A "case" is a directory containing at least one .tex file (recursively). The
 * main file is `main.tex`, else the .tex containing \documentclass, else the first
 * .tex. An optional expect.json ({ "class": "..." }) enables self-test.
 */
import { chromium } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { classifyCompile, FAILURE_CLASS_ORDER } from '../../src/compat/classify.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', '..')

const TEXT_EXTS = new Set([
  '.tex', '.bib', '.bst', '.cls', '.sty', '.def', '.clo', '.cfg', '.ltx',
  '.bbx', '.cbx', '.dbx', '.eps', '.txt', '.tikz', '.pgf',
])
const BIN_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.pdf', '.gif', '.bmp', '.tif', '.tiff', '.webp',
  '.otf', '.ttf', '.ttc',
])
const MAX_BIN_BYTES = 5 * 1024 * 1024

function parseArgs(argv) {
  const args = { corpus: join(root, 'compat/corpus'), limit: Infinity, timeout: 90_000, selfTest: false, resetEvery: 50, out: join(root, 'compat') }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--corpus') args.corpus = argv[++i]
    else if (a === '--limit') args.limit = Number(argv[++i])
    else if (a === '--timeout') args.timeout = Number(argv[++i])
    else if (a === '--reset-every') args.resetEvery = Number(argv[++i])
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--self-test') args.selfTest = true
  }
  return args
}

/** Recursively list files under dir, returning paths relative to dir. */
function listFilesRel(dir) {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else out.push(relative(dir, full))
    }
  }
  walk(dir)
  return out
}

function pickMainFile(dir, texFiles) {
  if (texFiles.includes('main.tex')) return 'main.tex'
  const withClass = texFiles.find((f) => {
    try {
      return /\\documentclass/.test(readFileSync(join(dir, f), 'utf8'))
    } catch {
      return false
    }
  })
  return withClass ?? texFiles[0]
}

/** Build a case descriptor from a directory, or null if it has no .tex. */
function buildCase(name, dir) {
  const rels = listFilesRel(dir).filter((f) => f !== 'expect.json')
  const texFiles = rels.filter((f) => extname(f).toLowerCase() === '.tex')
  if (texFiles.length === 0) return null

  const text = {}
  const bin = {}
  for (const rel of rels) {
    const ext = extname(rel).toLowerCase()
    const full = join(dir, rel)
    if (TEXT_EXTS.has(ext)) {
      text[rel] = readFileSync(full, 'utf8')
    } else if (BIN_EXTS.has(ext)) {
      if (statSync(full).size > MAX_BIN_BYTES) continue
      bin[rel] = readFileSync(full).toString('base64')
    }
    // Unknown extensions are skipped (logs, aux, output artifacts, etc.).
  }

  let expected = null
  let expectedSignal = null
  const expectPath = join(dir, 'expect.json')
  if (existsSync(expectPath)) {
    try {
      const exp = JSON.parse(readFileSync(expectPath, 'utf8'))
      expected = exp.class ?? null
      expectedSignal = exp.signal ?? null
    } catch {
      // malformed expect.json — treat as unlabeled
    }
  }

  return { name, dir, mainFile: pickMainFile(dir, texFiles), text, bin, expected, expectedSignal }
}

function discoverCases(corpusDir, limit) {
  if (!existsSync(corpusDir)) throw new Error(`Corpus directory not found: ${corpusDir}`)
  const cases = []
  for (const name of readdirSync(corpusDir).sort()) {
    const dir = join(corpusDir, name)
    if (!statSync(dir).isDirectory()) continue
    const c = buildCase(name, dir)
    if (c) cases.push(c)
    if (cases.length >= limit) break
  }
  return cases
}

async function waitForReady(page) {
  await page.waitForFunction(() => !!window.__compat, null, { timeout: 60_000 })
}

async function recover(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
  } catch {
    // ignore; waitForReady will surface a hard failure
  }
  await waitForReady(page)
}

async function runCase(page, url, c, timeoutMs) {
  const payload = { text: c.text, bin: c.bin, mainFile: c.mainFile }
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('__timeout__')), timeoutMs)
  })
  try {
    const outcome = await Promise.race([
      page.evaluate((p) => window.__compat.compile(p), payload),
      timeout,
    ])
    clearTimeout(timer)
    return { outcome, timedOut: false, crashed: false }
  } catch (err) {
    clearTimeout(timer)
    const isTimeout = String(err?.message ?? err).includes('__timeout__')
    await recover(page, url)
    return {
      outcome: { success: false, hasPdf: false, log: isTimeout ? '' : String(err?.message ?? err), compileTime: timeoutMs, pdfBytes: 0 },
      timedOut: isTimeout,
      crashed: !isTimeout,
    }
  }
}

function pct(n, total) {
  return total === 0 ? '0.0' : ((n / total) * 100).toFixed(1)
}

function aggregateMissing(records, cls) {
  const counts = new Map()
  for (const r of records) {
    if (r.class !== cls) continue
    for (const name of r.missing) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function renderReport(records, meta) {
  const total = records.length
  const byClass = new Map()
  for (const r of records) byClass.set(r.class, (byClass.get(r.class) ?? 0) + 1)
  const ok = byClass.get('ok') ?? 0

  const lines = []
  lines.push('# WasmTex compatibility report', '')
  lines.push(`- Corpus: \`${meta.corpus}\``)
  lines.push(`- Cases: **${total}**`)
  lines.push(`- Compiled (ok): **${ok} (${pct(ok, total)}%)**`)
  lines.push(`- Per-case timeout: ${meta.timeout} ms`)
  lines.push('')
  lines.push('## Failures by root cause', '')
  lines.push('| Class | Count | % |')
  lines.push('|---|---:|---:|')
  for (const cls of FAILURE_CLASS_ORDER) {
    const n = byClass.get(cls) ?? 0
    if (n === 0) continue
    lines.push(`| ${cls} | ${n} | ${pct(n, total)} |`)
  }
  lines.push('')

  const renderTop = (title, cls) => {
    const top = aggregateMissing(records, cls).slice(0, 25)
    if (top.length === 0) return
    lines.push(`## ${title}`, '')
    for (const [name, n] of top) lines.push(`- \`${name}\` × ${n}`)
    lines.push('')
  }
  renderTop('Top missing packages (Stage 1 mirror backlog)', 'missing-package')
  renderTop('Top missing fonts (Stage 1 mirror backlog)', 'missing-font')
  renderTop('Top missing project files', 'missing-file')

  const engineBacklog = records.filter((r) => r.class === 'needs-xelatex-lualatex')
  if (engineBacklog.length) {
    lines.push('## Documents needing XeLaTeX/LuaLaTeX (Stage 2 backlog)', '')
    for (const r of engineBacklog.slice(0, 50)) lines.push(`- ${r.name}`)
    lines.push('')
  }

  lines.push('## Per-case results', '')
  lines.push('| Case | Class | ok | ms | Evidence |')
  lines.push('|---|---|:--:|---:|---|')
  for (const r of records) {
    const okMark = r.class === 'ok' ? '✅' : '❌'
    const ev = (r.evidence[0] ?? '').replace(/\|/g, '\\|').slice(0, 80)
    lines.push(`| ${r.name} | ${r.class} | ${okMark} | ${r.compileTime} | ${ev} |`)
  }
  lines.push('')

  const failed = records.filter((r) => r.class !== 'ok')
  if (failed.length) {
    lines.push('## Failure log excerpts', '')
    for (const r of failed) {
      lines.push(`<details><summary><code>${r.name}</code> — ${r.class}</summary>`, '')
      lines.push('```')
      lines.push((r.logExcerpt || '(no log captured)').slice(0, 1200))
      lines.push('```', '</details>', '')
    }
  }
  return lines.join('\n')
}

function renderSelfTest(records) {
  const checked = records.filter((r) => r.expected != null || r.expectedSignal != null)
  const mismatches = checked.filter((r) => {
    if (r.expected != null && r.expected !== r.class) return true
    if (r.expectedSignal != null && !r.signals.includes(r.expectedSignal)) return true
    return false
  })
  return { checked, mismatches }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  console.log(`Discovering cases under ${args.corpus} ...`)
  const cases = discoverCases(args.corpus, args.limit)
  console.log(`Found ${cases.length} case(s).`)
  if (cases.length === 0) process.exit(0)

  console.log('Starting Vite dev server...')
  const server = await createServer({ root, configFile: join(root, 'vite.config.ts') })
  await server.listen()
  const port = server.httpServer.address().port
  const url = `http://localhost:${port}/compat/harness.html`
  console.log(`Harness page: ${url}`)

  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`  [browser:error] ${m.text()}`)
  })

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await waitForReady(page)

  const records = []
  let done = 0
  for (const c of cases) {
    if (done > 0 && done % args.resetEvery === 0) {
      await page.evaluate(() => window.__compat.reset()).catch(() => {})
    }
    const { outcome, timedOut, crashed } = await runCase(page, url, c, args.timeout)
    const cls = classifyCompile({
      success: outcome.success,
      hasPdf: outcome.hasPdf,
      log: outcome.log,
      timedOut,
      crashed,
    })
    const rec = {
      name: c.name,
      mainFile: c.mainFile,
      class: cls.class,
      success: outcome.success,
      compileTime: outcome.compileTime,
      evidence: cls.evidence,
      signals: cls.signals,
      missing: cls.missing,
      expected: c.expected,
      expectedSignal: c.expectedSignal,
      logExcerpt: outcome.log.replace(/\s+/g, ' ').trim().slice(0, 1200),
    }
    records.push(rec)
    done++
    const mism =
      (c.expected && c.expected !== cls.class) ||
      (c.expectedSignal && !cls.signals.includes(c.expectedSignal))
    const tag = mism ? `  ⚠ expected ${c.expected ?? ''}${c.expectedSignal ? ` +signal ${c.expectedSignal}` : ''}` : ''
    console.log(`  [${done}/${cases.length}] ${c.name}: ${cls.class} (${outcome.compileTime}ms)${tag}`)
  }

  await browser.close()
  await server.close()

  if (!existsSync(args.out)) mkdirSync(args.out, { recursive: true })
  const jsonPath = join(args.out, 'report.json')
  const mdPath = join(args.out, 'report.md')
  writeFileSync(jsonPath, JSON.stringify({ meta: { corpus: args.corpus, timeout: args.timeout }, records }, null, 2))
  writeFileSync(mdPath, renderReport(records, { corpus: args.corpus, timeout: args.timeout }))

  const total = records.length
  const ok = records.filter((r) => r.class === 'ok').length
  console.log(`\n=== Summary ===`)
  console.log(`Compiled: ${ok}/${total} (${pct(ok, total)}%)`)
  console.log(`Report: ${mdPath}`)
  console.log(`        ${jsonPath}`)

  const { checked, mismatches } = renderSelfTest(records)
  if (checked.length) {
    console.log(`\n=== Self-test (${checked.length} labeled cases) ===`)
    for (const m of mismatches) {
      const want = `${m.expected ?? '*'}${m.expectedSignal ? ` +signal ${m.expectedSignal}` : ''}`
      console.log(`  ✗ ${m.name}: got ${m.class} (signals: ${m.signals.join(',')}), expected ${want}`)
    }
    console.log(mismatches.length === 0 ? '  all labeled cases matched ✅' : `  ${mismatches.length} mismatch(es)`)
    if (args.selfTest && mismatches.length > 0) process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
