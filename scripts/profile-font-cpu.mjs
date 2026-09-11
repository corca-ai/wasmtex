#!/usr/bin/env node
// Standalone SDK diagnostic: explicit assets/mirror, no integrator checkout.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`)
  if (at < 0) return fallback
  const value = process.argv[at + 1]
  if (!value || value.startsWith('--')) throw Error(`Missing --${name}`)
  return value
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assets = resolve(arg('assets', 'public/wasmtex/2026'))
const mirror = new URL(arg('texlive-url', 'https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/'))
if (!mirror.pathname.endsWith('/')) throw Error('Mirror URL must end in /')
const year = arg('year', '2026')
if (!['2025', '2026'].includes(year)) throw Error('Unsupported year')
const out = resolve(arg('out', 'test-results/font-cpu'))
const cacheDir = resolve(arg('cache-dir', `${out}/mirror-cache`))
const repetitions = Number(arg('repetitions', '3'))
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20) throw Error('Invalid repetitions')
const selected = arg('engine', 'all')
const checkpointProbe = arg('checkpoint-probe', 'false') === 'true'
if (checkpointProbe && selected !== 'pdflatex-checkpoint') throw Error('Checkpoint probe requires --engine pdflatex-checkpoint')
const luaNamesProbe = arg('lua-names-probe', 'false') === 'true'
if (luaNamesProbe && selected !== 'lualatex') throw Error('Lua names probe requires --engine lualatex')
const variants = ['pdflatex', 'pdflatex-checkpoint', 'xelatex', 'lualatex'].filter((v) => selected === 'all' || selected === v)
if (!variants.length) throw Error('Unknown engine')
const traceOption = arg('trace', 'true')
if (!['true', 'false'].includes(traceOption)) throw Error('Trace must be true or false')
const traceEnabled = traceOption === 'true'
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
await mkdir(out, { recursive: true })
await mkdir(cacheDir, { recursive: true })
let locked = false
const network = []
const preparationRetries = []
const memo = new Map()
const mime = (name) => ({ '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' })[extname(name)] || 'application/octet-stream'
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname
    if (pathname.startsWith('/mirror/')) {
      const target = new URL(mirror.href)
      // Keep the configured origin fixed: a request path is never a URL.
      target.pathname = mirror.pathname + pathname.slice('/mirror/'.length)
      if (!target.pathname.startsWith(mirror.pathname)) { res.writeHead(400).end('Outside snapshot'); return }
      const url = target.href
      // No query-string rewriting or fallback to a different snapshot.
      const key = hash(url)
      let entry = memo.get(key)
      let source = 'memory'
      if (!entry) {
        try { entry = JSON.parse(await readFile(`${cacheDir}/${key}.json`, 'utf8')); source = 'disk' }
        catch (error) {
          if (error.code !== 'ENOENT') throw error
          if (locked) {
            network.push({ url, source: 'blocked-miss', status: 503 })
            res.writeHead(503).end('Unprepared mirror request'); return
          }
          let response
          for (let attempt = 0; attempt < 3; attempt++) {
            try { response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' }); break }
            catch (error) {
              preparationRetries.push({ url, attempt, error: String(error), cause: String(error.cause), details: error.cause?.errors?.map((e) => String(e)) })
              if (attempt === 2) throw error
            }
          }
          if (!response.ok && response.status !== 404) throw Error(`Mirror ${response.status}: ${url}`)
          const bytes = Buffer.from(await response.arrayBuffer())
          entry = { url, status: response.status, type: response.headers.get('content-type'), sha256: hash(bytes), body: bytes.toString('base64') }
          await writeFile(`${cacheDir}/${key}.json`, JSON.stringify(entry))
          source = 'upstream'
        }
        if (entry.url !== url || hash(Buffer.from(entry.body, 'base64')) !== entry.sha256) throw Error('Corrupt mirror cache')
        memo.set(key, entry)
      }
      network.push({ url, source, status: entry.status })
      res.writeHead(entry.status, { 'Content-Type': entry.type || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(Buffer.from(entry.body, 'base64'))
      return
    }
    if (pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>WasmTex CPU diagnostic</title>'); return }
    const prefix = pathname.startsWith(`/assets/wasmtex/${year}/`) ? `/assets/wasmtex/${year}/` : pathname.startsWith('/lib/') ? '/lib/' : null
    if (!prefix) { res.writeHead(404).end(); return }
    const base = prefix.startsWith('/assets/') ? assets : resolve(root, 'lib')
    const file = resolve(base, decodeURIComponent(pathname.slice(prefix.length)))
    if (!file.startsWith(base + sep)) { res.writeHead(403).end(); return }
    const bytes = await readFile(file)
    res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' }).end(bytes)
  } catch (error) {
    network.push({ url: req.url, error: String(error), cause: String(error.cause) })
    res.writeHead(error.code === 'ENOENT' ? 404 : 500).end(String(error))
  }
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const cdp = await browser.newBrowserCDPSession()
const report = {
  schemaVersion: 1, browser: browser.version(), assets, mirror: mirror.href, year, repetitions,
  traceEnabled, luaNamesProbe, checkpointProbe, fixedWorkerClock: !luaNamesProbe, preparationRetries, samples: [],
  sdkRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  harnessSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  node: process.version, platform: process.platform, architecture: process.arch,
  assetHashes: Object.fromEntries(await Promise.all((await readdir(assets)).filter((name) => /\.(wasm|js|fmt|gz|json)$/.test(name)).map(async (name) => [name, hash(await readFile(resolve(assets, name)))]))),
  limitations: [
    'Mirror responses are populated before measurement; measured runs prohibit upstream misses. Loopback HTTP transfers remain and are not counted as font CPU.',
    'New contexts have empty browser caches; same-worker repeat/edit retains SDK and MEMFS caches. No file aliases are pre-injected.',
    'Tracing adds overhead. These timings diagnose costs; they are not optimization speedup evidence.',
    'C/WASM sampling does not identify interpreted Lua functions. Inspect luaotfload separately before proposing a Lua cache.',
    'Worker clocks are fixed after initialization for reproducible PDF metadata; performance.now remains real.',
    'The small Latin/math corpus is a profiling probe, not release compatibility qualification.',
  ],
}
async function collectTrace(label, action) {
  if (!traceEnabled) return action()
  await cdp.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    categories: 'devtools.timeline,v8,disabled-by-default-v8.cpu_profiler,blink.user_timing',
  })
  try { return await action() }
  finally {
    const complete = new Promise((done) => cdp.once('Tracing.tracingComplete', done))
    await cdp.send('Tracing.end')
    const event = await complete
    const chunks = []
    for (;;) {
      const chunk = await cdp.send('IO.read', { handle: event.stream })
      chunks.push(chunk.base64Encoded ? Buffer.from(chunk.data, 'base64') : Buffer.from(chunk.data))
      if (chunk.eof) break
    }
    await cdp.send('IO.close', { handle: event.stream })
    await writeFile(`${out}/${label}.trace.json`, Buffer.concat(chunks))
    if (event.dataLossOccurred) throw Error('CPU trace lost data')
  }
}
async function runVariant(variant, repetition, measured) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const deadline = setTimeout(() => void context.close(), 240_000)
  const sample = { variant, repetition, measured, stages: [] }
  report.samples.push(sample)
  try {
    await page.goto(base)
    await page.evaluate(async () => { globalThis.Compiler = (await import('/lib/headless.js')).WasmTexCompiler })
    for (const stage of ['init', 'first', 'repeat', ...(checkpointProbe ? ['prepare-checkpoint'] : []), 'body-edit', 'preamble-edit']) {
      const networkStart = network.length
      const action = () => page.evaluate(async ({ stage, variant, year, base, luaNamesProbe, checkpointProbe }) => {
        const font = variant.startsWith('pdflatex')
          ? '\\usepackage[T1]{fontenc}\\usepackage{lmodern}'
          : '\\usepackage{fontspec}\\setmainfont{Latin Modern Roman}'
        let source = '\\documentclass{article}\n' + font + '\n\\usepackage{amsmath}\n\\begin{document}\nFont CPU probe. {\\bfseries Bold text.} {\\itshape Italic text.} $E=mc^2$.\n\\end{document}'
        if (checkpointProbe) source = source.replace('Font CPU probe.', ('A completed paragraph before the edit. '.repeat(30) + '\\par\n\n').repeat(6) + 'Completed paragraphs.\n\nFont CPU probe.')
        if (luaNamesProbe) source = source.replace('\\begin{document}', String.raw`\begin{document}
\directlua{
local p = "/tex/texmf-var/luatex-cache/generic/names/luaotfload-names.lua"
local chunk = assert(loadfile(p))
local clock = os.clock
local start = clock()
local binary = string.dump(chunk)
local dumpms = (clock() - start) * 1000
collectgarbage("collect")
start = clock()
for i = 1, 10 do local f = assert(loadfile(p)) end
local sourceMs = (clock() - start) * 100
collectgarbage("collect")
start = clock()
for i = 1, 10 do local f = assert(load(binary, "@" .. p, "b")) end
local binaryMs = (clock() - start) * 100
collectgarbage("collect")
start = clock()
for i = 1, 10 do local data = chunk() end
local executeMs = (clock() - start) * 100
texio.write_nl("FONT-NAMES-PROBE sourceMs=" .. sourceMs .. " binaryMs=" .. binaryMs .. " executeMs=" .. executeMs .. " dumpMs=" .. dumpms .. " bytes=" .. string.len(binary))
}`)
        const start = performance.now()
        if (stage === 'init') {
          globalThis.compiler = new globalThis.Compiler({
            engine: variant === 'pdflatex-checkpoint' ? 'pdflatex' : variant,
            incremental: variant === 'pdflatex-checkpoint',
            texliveVersion: year, texliveUrl: `${base}/mirror/`, assetBaseUrl: `${base}/assets/`,
            persistentCache: false, files: { 'main.tex': source },
          })
          await globalThis.compiler.init()
          return { ms: performance.now() - start }
        }
        if (stage === 'prepare-checkpoint') {
          const prepared = await globalThis.compiler.prepareIncrementalCompile('main.tex', source.indexOf('Font CPU probe.'))
          return { ms: performance.now() - start, checkpointPrepared: prepared }
        }
        if (stage === 'body-edit') globalThis.compiler.setFile('main.tex', source.replace('Font CPU probe.', 'Body edited: another font CPU probe.'))
        if (stage === 'preamble-edit') globalThis.compiler.setFile('main.tex', source.replace('\\documentclass{article}', '\\documentclass[12pt]{article}'))
        const result = await globalThis.compiler.compile()
        if (!result.success) throw Error(result.log)
        if (checkpointProbe && stage === 'body-edit' && !result.phaseTimings?.checkpointResume) throw Error('Body edit did not resume a checkpoint')
        const elapsed = performance.now() - start
        const bytes = result.pdf
        const digest = await crypto.subtle.digest('SHA-256', bytes)
        let text = ''
        for (let at = 0; at < bytes.length; at += 8192) text += String.fromCharCode(...bytes.subarray(at, at + 8192))
        const normalized = text.replace(/\/(?:CreationDate|ModDate)\s*\([^)]*\)/g, '').replace(/\/ID\s*\[[^\]]*\]/g, '')
        const normalizedDigest = await crypto.subtle.digest('SHA-256', Uint8Array.from(normalized, (c) => c.charCodeAt(0)))
        return {
          ms: elapsed, pdfBytes: bytes.length,
          pdfSha256: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(''),
          typesetSha256: Array.from(new Uint8Array(normalizedDigest), (b) => b.toString(16).padStart(2, '0')).join(''),
          log: result.log, phaseTimings: result.phaseTimings ?? null,
          preambleSnapshot: result.preambleSnapshot ?? null, preambleRebuilt: result.preambleRebuilt ?? null,
        }
      }, { stage, variant, year, base, luaNamesProbe, checkpointProbe })
      const result = measured ? await collectTrace(`${variant}-${repetition}-${stage}`, action) : await action()
      if (stage === 'init' && !luaNamesProbe) {
        // Match the existing deterministic benchmark convention. Change only the
        // JS clock used for output metadata, after engine initialization.
        for (const worker of page.workers()) await worker.evaluate(() => {
          const RealDate = Date
          globalThis.Date = class extends RealDate {
            constructor(...args) { super(...(args.length ? args : [1789084800000])) }
            static now() { return 1789084800000 }
          }
        })
      }
      if (variant === 'lualatex') {
        result.luaFontCacheFiles = []
        for (const worker of page.workers()) {
          result.luaFontCacheFiles.push(...await worker.evaluate(() => {
            const files = []
            function walk(path) {
              let entries
              try { entries = FS.readdir(path) } catch { return }
              for (const name of entries) {
                if (name === '.' || name === '..') continue
                const child = `${path}/${name}`
                const stat = FS.stat(child)
                if (FS.isDir(stat.mode)) walk(child)
                else files.push({ path: child, bytes: stat.size })
              }
            }
            walk('/tex/texmf-var/luatex-cache')
            return files
          }))
        }
      }
      const requests = network.slice(networkStart)
      sample.stages.push({ stage, ...result, requests })
      if (requests.some((r) => r.error || r.source === 'blocked-miss' || (measured && r.source === 'upstream'))) throw Error('Measured run encountered unprepared request')
      await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2))
      console.log(`${measured ? 'measure' : 'prepare'} ${variant} ${repetition} ${stage}: ${result.ms.toFixed(1)} ms, ${requests.length} local requests`)
    }
  } finally { clearTimeout(deadline); await context.close() }
}
try {
  // Exercise every mutation before closing the upstream boundary.
  for (const variant of variants) await runVariant(variant, -1, false)
  locked = true
  for (let repetition = 0; repetition < repetitions; repetition++) {
    for (const variant of variants) await runVariant(variant, repetition, true)
  }
} catch (error) { report.error = String(error); throw error }
finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2))
  await browser.close()
  await new Promise((done) => server.close(done))
}
