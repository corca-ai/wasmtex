import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { smokeTexliveProfile } from './smoke-texlive-profile'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const fixtures = join(root, 'test/fixtures/project-switch-images')

async function compileSequence(publicDir: string) {
  const { installNodeWorkerHost } = await import('./node-host')
  const { WasmTexCompiler } = await import('../headless')
  const profile = smokeTexliveProfile()
  const documents = readdirSync(fixtures)
    .filter((name) => name.endsWith('.tex'))
    .sort()
    .map((name) => ({ name, source: readFileSync(join(fixtures, name), 'utf8') }))
  const first = documents[0]
  if (!first) throw new Error('Project-switch corpus is empty')
  installNodeWorkerHost({ publicDir, assetBaseUrl: 'http://assets.local/' })
  const compiler = new WasmTexCompiler({
    assetBaseUrl: 'http://assets.local/',
    engine: 'pdflatex',
    incremental: true,
    texliveVersion: profile.version,
    texliveUrl: profile.url,
    files: { 'main.tex': first.source },
    mainFile: 'main.tex',
  })
  const digests: string[] = []
  try {
    await compiler.init()
    for (const [index, document] of documents.entries()) {
      if (index) await compiler.loadProject({ 'main.tex': document.source })
      const result = await compiler.compile()
      expect(result.success, `${document.name}: ${result.log}`).toBe(true)
      expect(result.pdf?.length, document.name).toBeGreaterThan(0)
      if (!result.pdf) throw new Error(`${document.name}: missing PDF`)
      const pdf = Buffer.from(result.pdf)
        .toString('latin1')
        .replace(/\/(?:CreationDate|ModDate)\s*\([^)]*\)/g, '')
        .replace(/\/ID\s*\[[^\]]*\]/g, '')
      digests.push(createHash('sha256').update(pdf).digest('hex'))
    }
  } finally {
    compiler.dispose()
  }
  return digests
}

describe.runIf(process.env.NODE_COMPILE_SMOKE === '1')('project switches before PDF images', () => {
  it('preserves all PDFs when varied projects share a compiler', async () => {
    const assets = process.env.WASMTEX_SMOKE_PUBLIC_DIR ?? join(root, 'public')
    const baseline = process.env.WASMTEX_HEAP_BASELINE_DIR
    const expected = baseline ? await compileSequence(baseline) : undefined
    const actual = await compileSequence(assets)
    if (expected) expect(actual).toEqual(expected)
  }, 300_000)
})
