import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BackendRegistry, BIBER_STAGE } from './backend-registry'
import { type BiberRequest, createBiberBackend, runRemoteBiber } from './biber-backend'
import { MemoryCacheStore, withCache } from './content-cache'

/**
 * Biber server e2e (#175) — proves a consumer can point the bibliography stage at **their own
 * Biber server** and that the content-addressed cache dedupes identical runs. Two layers:
 *
 * 1. **Hermetic contract e2e (runs in CI).** A localhost HTTP endpoint mimics a Biber server;
 *    the consumer's exact wiring — `withCache(createBiberBackend({ endpoint }), store)` under
 *    `BIBER_STAGE` — drives it over a **real `fetch`** round-trip (not an injected
 *    `fetchImpl`). Asserts the `{ bcf, bibFiles }` request shape + headers cross the wire and
 *    that two identical requests yield exactly **one** server invocation.
 * 2. **Opt-in real-engine e2e (skipped in CI).** Gated by `BIBER_E2E_ENDPOINT`, it drives the
 *    full `WasmTexCompiler` against a real Biber endpoint and asserts a biblatex +
 *    `backend=biber` document gets a Biber-accurate `.bbl` injected:
 *
 *      BIBER_E2E_ENDPOINT=https://biber.example/api/biber \
 *        npx vitest run src/engine/biber-server.e2e.test.ts
 *
 *    Version pinning: Biber ↔ biblatex are coupled through the `.bcf` version, and a mismatched
 *    Biber refuses the control file. The endpoint (and any production image) MUST pin Biber to
 *    the biblatex shipped by the engine's TeX Live target (**TL2025** on the CDN) — bake the
 *    pinned Biber into the server image so drift fails loudly instead of silently skipping.
 */

interface ServerHit {
  stage: string | undefined
  cacheKey: string | undefined
  body: BiberRequest
}

describe('Biber server connection (hermetic localhost e2e)', () => {
  let server: Server
  let endpoint: string
  const hits: ServerHit[] = []

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c as Buffer))
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as BiberRequest
        hits.push({
          stage: req.headers['x-wasmtex-stage'] as string | undefined,
          cacheKey: req.headers['x-wasmtex-cache-key'] as string | undefined,
          body,
        })
        // Stand-in for Biber: emit one `\entry` per cited key parsed from the POSTed `.bcf`,
        // so the response is a function of the request — proving the `.bcf` crossed the wire.
        const keys = [...body.bcf.matchAll(/<bcf:citekey\b[^>]*>([^<]+)<\/bcf:citekey>/g)].map(
          (m) => m[1],
        )
        const bbl = `\\begin{refsection}\n${keys
          .map((k) => `\\entry{${k}}{book}{}{}\n\\endentry`)
          .join('\n')}\n\\enddatalist\n\\end{refsection}\n`
        // `connection: close` so node's keep-alive sockets don't keep server.close() hanging.
        res.writeHead(200, { 'content-type': 'text/plain', connection: 'close' })
        res.end(bbl)
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/biber`
  })

  afterAll(() => {
    server.close()
  })

  it('createBiberBackend POSTs { bcf, bibFiles } over real HTTP and returns the .bbl', async () => {
    hits.length = 0
    const backend = createBiberBackend({ endpoint }) // no fetchImpl → real global fetch
    const req: BiberRequest = {
      bcf: '<bcf:citekey order="1">knuth84</bcf:citekey>',
      bibFiles: { 'refs.bib': '@book{knuth84, title={Literate Programming}}' },
    }
    const bbl = await backend.run(req)
    expect(bbl).toContain('\\entry{knuth84}{book}{}{}')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.stage).toBe(BIBER_STAGE)
    expect(hits[0]!.body).toEqual(req)
  })

  it('withCache dedupes identical { bcf, bibFiles } to a single server invocation', async () => {
    hits.length = 0
    const reg = new BackendRegistry()
    reg.register(BIBER_STAGE, withCache(createBiberBackend({ endpoint }), new MemoryCacheStore()))
    const req: BiberRequest = {
      bcf: '<bcf:citekey order="1">knuth84</bcf:citekey>',
      bibFiles: { 'refs.bib': '@book{knuth84, title={T}}' },
    }
    const first = await runRemoteBiber(reg, req)
    const second = await runRemoteBiber(reg, req)
    expect(first).toContain('\\entry{knuth84}')
    expect(second).toBe(first)
    expect(hits).toHaveLength(1) // the second identical run is served from the cache

    // A *different* request must still reach the server — proves the key actually varies
    // (a constant cache key would wrongly dedupe distinct work to one `.bbl`).
    const other: BiberRequest = { ...req, bcf: '<bcf:citekey order="1">lamport94</bcf:citekey>' }
    expect(await runRemoteBiber(reg, other)).toContain('\\entry{lamport94}')
    expect(hits).toHaveLength(2)
  })

  it('forwards an x-wasmtex-cache-key header for a shared (cross-collaborator) cache', async () => {
    hits.length = 0
    const backend = createBiberBackend({
      endpoint,
      cacheKey: (r) => `biber:${Object.keys(r.bibFiles).length}`,
    })
    await backend.run({ bcf: '<bcf:citekey>x</bcf:citekey>', bibFiles: { 'a.bib': '@book{x}' } })
    expect(hits[0]!.cacheKey).toBe('biber:1')
  })
})

// Opt-in: drive the full compiler against a real Biber endpoint. Skipped unless the env var is
// set (mirrors node-compile.smoke.test.ts — needs network to the TeX Live CDN + built engine
// assets in public/ + a reachable, version-pinned Biber server).
const REAL_ENDPOINT = process.env.BIBER_E2E_ENDPOINT

describe.runIf(REAL_ENDPOINT)('real Biber server e2e (opt-in, #175)', () => {
  it('compiles a biblatex+biber document to a Biber-accurate .bbl', async () => {
    const { installNodeWorkerHost } = await import('./node-host')
    const { WasmTexCompiler } = await import('../headless')

    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const ASSET = 'http://assets.local/'
    installNodeWorkerHost({ publicDir: join(root, 'public'), assetBaseUrl: ASSET })

    const backends = new BackendRegistry()
    backends.register(BIBER_STAGE, createBiberBackend({ endpoint: REAL_ENDPOINT! }))

    const compiler = new WasmTexCompiler({
      engine: 'pdflatex',
      assetBaseUrl: ASSET,
      texliveUrl: 'https://d1jectpaw0dlvl.cloudfront.net/2025/',
      backends,
      files: {
        'main.tex': [
          '\\documentclass{article}',
          '\\usepackage[backend=biber]{biblatex}',
          '\\addbibresource{refs.bib}',
          '\\begin{document}',
          'As shown in \\cite{knuth84}, literate programming matters.',
          '\\printbibliography',
          '\\end{document}',
          '',
        ].join('\n'),
        'refs.bib':
          '@book{knuth84, author={Knuth, Donald E.}, title={Literate Programming}, ' +
          'year={1984}, publisher={CSLI}}\n',
      },
    })
    try {
      await compiler.init()
      const result = await compiler.compile()
      expect(result.success).toBe(true)
      const bbl = compiler.getFile('main.bbl')
      expect(typeof bbl).toBe('string')
      // The registered server Biber produced the bibliography and the compiler injected it.
      expect(bbl as string).toContain('knuth84')
      expect(bbl as string).toMatch(/\\entry\{knuth84\}/)
    } finally {
      compiler.dispose()
    }
  }, 90_000)
})
