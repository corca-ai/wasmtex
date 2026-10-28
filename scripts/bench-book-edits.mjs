#!/usr/bin/env node
/** Browser/WASM repeat-edit lab. See docs/engine-testing.md. No source rewriting. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index < 0 ? fallback : process.argv[index + 1]
}
const assets = resolve(arg('assets', 'public'))
const mirror = arg('texlive-url')
if (!mirror || !/\/snapshots\/[^/]+\/(2025|2026)\/$/.test(mirror))
  throw new Error('--texlive-url must identify an immutable annual snapshot')
const year = new URL(mirror).pathname.split('/').at(-2)
const repetitions = Number(arg('repetitions', '3'))
const pageLimit = Number(arg('page-limit', '0'))
const checkpointCount = Number(arg('checkpoints', '1'))
const checkpointMiB = Number(arg('checkpoint-mib', '64'))
if (![pageLimit, checkpointCount, checkpointMiB].every(Number.isSafeInteger) ||
    pageLimit < 0 || pageLimit > 10000 || checkpointCount < 1 || checkpointCount > 64 ||
    checkpointMiB < 1 || checkpointMiB > 512) throw new Error('Invalid preview/checkpoint bounds')
if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 20)
  throw new Error('--repetitions must be 1..20')
const out = resolve(arg('out', 'report/book-edits'))
const cache = resolve(arg('cache', 'report/book-mirror-cache'))
await Promise.all([mkdir(out, { recursive: true }), mkdir(cache, { recursive: true })])
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const normalizedPdfHash = (bytes) =>
  hash(
    bytes
      .toString('latin1')
      .replace(/\/(?:CreationDate|ModDate)\s*\([^)]*\)/g, '')
      .replace(/\/ID\s*\[[^\]]*\]/g, ''),
  )

const files = {}
const project = arg('project')
const mainFile = arg('main', 'main.tex')
const editPath = arg('edit', 'chapters/ch6.tex')
const from = arg('from', 'Every function')
const to = arg('to', 'Each  function')
if (!from || !to || from === to) throw new Error('--from and --to must differ')
if (project) {
  async function visit(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const path = join(directory, entry.name)
      const key = prefix + entry.name
      if (entry.isDirectory()) await visit(path, `${key}/`)
      else if (/\.(?:tex|sty|cls|bib|bst)$/.test(entry.name))
        files[key] = await readFile(path, 'utf8')
    }
  }
  await visit(resolve(project))
} else {
  const text =
    'Every function preserves the structure of its argument. Composition respects identity and associativity. The following equation describes a useful transformation.'
  files[mainFile] =
    '\\documentclass{book}\n\\usepackage{amsmath,makeidx}\n\\makeindex\n\\begin{document}\n\\tableofcontents\n' +
    Array.from({ length: 12 }, (_, i) => `\\include{chapters/ch${i + 1}}`).join('\n') +
    '\n\\printindex\n\\end{document}\n'
  for (let i = 1; i <= 12; i++)
    files[`chapters/ch${i}.tex`] =
      `\\chapter{Chapter ${i}}\n` +
      Array.from(
        { length: 6 },
        (_, j) =>
          `\\section{Section ${j}}\n${text}\\index{composition}\n\n${Array(4).fill(text).join('\n\n')}\n\\begin{equation}f(x)=\\sum_{k=1}^{20}\\frac{k^2}{k+1}\\end{equation}\n`,
      ).join('\n')
}
if (!(mainFile in files) || !files[editPath]?.includes(from))
  throw new Error('Missing main document, edit file, or --from text')
const inputs = Object.fromEntries(
  Object.entries(files).map(([path, content]) => [path, hash(content)]),
)
const misses = []
const inFlight = new Map()
async function mirrorFile(url) {
  const key = join(cache, hash(url))
  try {
    return JSON.parse(await readFile(key, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (inFlight.has(url)) return inFlight.get(url)
  const task = (async () => {
    misses.push(url)
    const response = await fetch(url)
    if (![200, 404].includes(response.status)) throw new Error(`${response.status}: ${url}`)
    const result = {
      status: response.status,
      body: Buffer.from(await response.arrayBuffer()).toString('base64'),
    }
    await writeFile(key, JSON.stringify(result))
    return result
  })()
  inFlight.set(url, task)
  try {
    return await task
  } finally {
    inFlight.delete(url)
  }
}
const server = await createServer({
  root,
  configFile: false,
  server: { port: 0 },
  plugins: [
    {
      name: 'book-lab',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          try {
            const path = new URL(request.url, 'http://localhost').pathname
            if (path === '/book-lab') {
              response.setHeader('Content-Type', 'text/html')
              response.end('<html><body>Book edit lab</body></html>')
              return
            }
            if (path.startsWith('/engines/')) {
              const file = resolve(assets, `.${path.slice('/engines'.length)}`)
              if (relative(assets, file).startsWith('..')) throw new Error('Invalid asset path')
              response.setHeader(
                'Content-Type',
                file.endsWith('.js')
                  ? 'text/javascript'
                  : file.endsWith('.wasm')
                    ? 'application/wasm'
                    : 'application/octet-stream',
              )
              response.end(await readFile(file))
              return
            }
            if (path.startsWith('/mirror/')) {
              const result = await mirrorFile(mirror + path.slice('/mirror/'.length))
              response.statusCode = result.status
              response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
              response.end(Buffer.from(result.body, 'base64'))
              return
            }
            next()
          } catch (error) {
            response.statusCode = 500
            response.end(String(error))
          }
        })
      },
    },
  ],
})
let browser
const manifest = await readFile(join(assets, 'wasmtex', year, 'manifest.json'))
const report = {
  sdkHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sdkDiffHash: hash(execFileSync('git', ['diff', 'HEAD'], { cwd: root })),
  assetManifestHash: hash(manifest),
  workerHash: hash(await readFile(join(assets, 'wasmtex', year, 'wasmtex-pdftex.worker.js'))),
  pageLimit, checkpointCount, checkpointMiB,
  sdkEntry: arg('sdk-entry', '/src/headless.ts'),
  heap: arg('heap', 'true') !== 'false',
  repetitions,
  mirror,
  year,
  assets,
  project: project ? resolve(project) : 'synthetic-12-chapter',
  mainFile,
  editPath,
  from,
  to,
  inputs,
  runs: [],
}
try {
  await server.listen()
  browser = await chromium.launch()
  report.browser = browser.version()
  const page = await browser.newPage()
  page.on('console', (message) => {
    if (message.text().startsWith('book-lab:')) console.log(message.text())
  })
  await page.exposeFunction('saveBookSample', async (sample) => {
    const pdf = Buffer.from(sample.pdfBase64, 'base64')
    delete sample.pdfBase64
    sample.pdfHash = hash(pdf)
    sample.typesetHash = normalizedPdfHash(pdf)
    sample.upstreamMisses = misses.splice(0)
    if (!sample.cold && sample.upstreamMisses.length)
      throw new Error('Warm sample fetched new upstream inputs')
    report.runs.push(sample)
    await writeFile(join(out, `sample-${sample.index}.pdf`), pdf)
    await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2))
    console.log(
      JSON.stringify({
        index: sample.index,
        wallMs: sample.wallMs,
        passes: sample.passes.map((pass) => Math.round(pass.ms)),
        pdfBytes: pdf.length,
      }),
    )
  })
  await page.exposeFunction('saveBookPreview', async ({ index, revision, base64 }) => {
    await writeFile(join(out, `preview-${index}-${revision}.pdf`), Buffer.from(base64, 'base64'))
  })
  await page.goto(`http://localhost:${server.httpServer.address().port}/book-lab`)
  await page.evaluate(
    async (input) => {
      const { WasmTexCompiler } = await import(input.entry)
      const compiler = new WasmTexCompiler({
        engine: 'pdflatex',
        files: input.files,
        mainFile: input.mainFile,
        assetBaseUrl: '/engines/',
        texliveVersion: input.year,
        texliveUrl: `${location.origin}/mirror/`,
        incremental: true,
        heapCheckpoints: input.heap,
        heapCheckpointOptions: { maxCheckpoints: input.checkpointCount, maxBytes: input.checkpointMiB * 2 ** 20, minHeadBytes: 0 },
        tikzExternalization: { mode: 'auto', workers: 1, idleMs: 0 },
        persistentCache: false,
      })
      let timer
      let session
      let forkSetup
      try {
        await compiler.init()
        // Observe actual engine passes, including heap resumes, without changing results.
        const engine = compiler.engine
        let passes = []
        for (const method of ['compile', 'compileFromHeapCheckpoint']) {
          const original = engine[method]?.bind(engine)
          if (!original) continue
          engine[method] = async (...args) => {
            console.log(`book-lab: ${method} start`)
            const start = performance.now()
            const result = await original(...args)
            passes.push({
              method,
              ms: performance.now() - start,
              success: result.success,
              phaseTimings: result.phaseTimings,
              errors: result.errors,
              log: result.success ? undefined : result.log,
            })
            return result
          }
        }
        for (let index = 0; index <= input.repetitions; index++) {
          if (index > 0) {
            const [before, after] = index % 2 ? [input.from, input.to] : [input.to, input.from]
            input.files[input.editPath] = input.files[input.editPath].replace(before, after)
            compiler.setFile(input.editPath, input.files[input.editPath])
          }
          passes = []
          const start = performance.now()
          const canonical = Promise.race([
            compiler.compile({
              incrementalPreparation: {
                path: input.editPath,
                offset: input.files[input.editPath].indexOf(index % 2 ? input.to : input.from),
              },
            }),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error('Compile exceeded 10 minutes')), 600_000)
            }),
          ])
          const previews = []
          if (session && index > 0) {
            for (let revision = 0; revision < 3; revision++) {
              const current = input.files[input.editPath]
              const alternate = current.includes(input.to)
                ? current.replace(input.to, input.from) : current.replace(input.from, input.to)
              session.setFile(input.editPath, revision % 2 ? alternate : current)
              const began = performance.now()
              const preview = await session.previewPages(input.pageLimit)
              previews.push({ wallMs: performance.now() - began, accepted: !!preview, bytes: preview?.pdf.length })
              if (preview) {
                let text = ''
                for (let at = 0; at < preview.pdf.length; at += 32768)
                  text += String.fromCharCode(...preview.pdf.subarray(at, at + 32768))
                await globalThis.saveBookPreview({ index, revision, base64: btoa(text) })
              }
            }
          }
          const result = await canonical
          clearTimeout(timer)
          const wallMs = performance.now() - start
          if (index === 0 && input.pageLimit) {
            const began = performance.now()
            session = await compiler.createPagePreviewSession({ path: input.editPath,
              offset: input.files[input.editPath].indexOf(input.from) })
            forkSetup = { wallMs: performance.now() - began, ready: !!session }
            if (!session) throw new Error('Requested preview fork unavailable')
          }
          if (!result.success || !result.pdf) throw new Error(result.log)
          const outputs = {}
          for (const extension of ['aux', 'toc', 'ind'])
            outputs[extension] = await compiler.readOutput(
              input.mainFile.replace(/\.tex$/, `.${extension}`),
            )
          const pdfBase64 = btoa(
            Array.from({ length: Math.ceil(result.pdf.length / 32768) }, (_, j) =>
              String.fromCharCode(...result.pdf.subarray(j * 32768, (j + 1) * 32768)),
            ).join(''),
          )
          await globalThis.saveBookSample({
            index,
            cold: index === 0,
            wallMs,
            forkSetup, previews, retention: result.heapCheckpointRetention,
            passes,
            outputs,
            errors: result.errors,
            heap: compiler.heap?.held,
            pdfBase64,
          })
        }
      } finally {
        clearTimeout(timer)
        session?.dispose()
        compiler.dispose()
      }
    },
    {
      files,
      mainFile,
      editPath,
      from,
      to,
      repetitions,
      year,
      heap: arg('heap', 'true') !== 'false',
      entry: arg('sdk-entry', '/src/headless.ts'),
      pageLimit, checkpointCount, checkpointMiB,
    },
  )
} finally {
  await browser?.close()
  await server.close()
}
