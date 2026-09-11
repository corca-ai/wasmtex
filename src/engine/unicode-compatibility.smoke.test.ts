import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { docFor } from '../../e2e/golden-corpus'
import {
  type UnicodeCompatibilityCase as Case,
  type UnicodeEngine as Engine,
  PROJECT_FONT_SHA256,
  unicodeCompatibilityCases,
} from '../../e2e/unicode-compatibility-corpus'
import type { CompileResult } from '../types'
import { smokeTexliveProfile } from './smoke-texlive-profile'

const BASELINE = process.env.WASMTEX_HEAP_BASELINE_DIR
const CANDIDATE = process.env.WASMTEX_SMOKE_PUBLIC_DIR
const RUN = process.env.WASMTEX_UNICODE_COMPAT === '1'
if (RUN && (!BASELINE || !CANDIDATE)) {
  throw new Error(
    'Unicode qualification requires explicit baseline and candidate asset directories',
  )
}
const PROFILE = smokeTexliveProfile()
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')
async function cases(engine: Engine): Promise<Case[]> {
  const response = await fetch(`${PROFILE.url}pdftex/47/lmroman10-regular.otf`)
  expect(response.ok).toBe(true)
  const font = new Uint8Array(await response.arrayBuffer())
  expect(hash(font)).toBe(PROJECT_FONT_SHA256)
  return unicodeCompatibilityCases(engine, font)
}

function assertOutcome(fixture: Case, result: CompileResult) {
  if (fixture.error) expect(result.errors.length, fixture.name).toBeGreaterThan(0)
  else {
    expect(result.success, `${fixture.name}: ${result.log}`).toBe(true)
    expect(result.pdf?.length, fixture.name).toBeGreaterThan(0)
  }
}

function observable(result: CompileResult) {
  return {
    success: result.success,
    pdf: result.pdf
      ? hash(
          Buffer.from(result.pdf)
            .toString('latin1')
            .replace(/\/(?:CreationDate|ModDate)\s*\([^)]*\)/g, '')
            .replace(/\/ID\s*\[[^\]]*\]/g, ''),
        )
      : null,
    errors: result.errors,
    synctex: result.synctex ? hash(result.synctex) : null,
    geometry: result.telemetry?.geometry,
    diagnostics: result.telemetry?.diagnostics,
    dependencies: result.telemetry?.dependencies,
    inputFiles: result.inputFiles,
    inputFilesComplete: result.inputFilesComplete,
    glyphCoverage: result.glyphCoverage,
  }
}

function assertKnownBaselineDefect(
  fixture: Case,
  outputs: Array<{ name: string; pdf: string | null }>,
) {
  if (fixture.stalePdfFrom) {
    expect(outputs.at(-1)?.pdf, 'known baseline stale-PDF defect').toEqual(
      outputs.find((output) => output.name === fixture.stalePdfFrom)?.pdf,
    )
  }
}

async function compileCorpus(publicDir: string, engine: Engine) {
  const { installNodeWorkerHost } = await import('./node-host')
  const { WasmTexCompiler } = await import('../headless')
  const { CompileWorkerDriver } = await import('./wasmtex-worker')
  const staged = mkdtempSync(join(tmpdir(), 'wasmtex-unicode-compat-'))
  cpSync(publicDir, staged, { recursive: true })
  for (const family of ['xetex', 'luatex', 'dvipdfm']) {
    const file = join(staged, `wasmtex/${PROFILE.version}/wasmtex-${family}.worker.js`)
    writeFileSync(file, `Date.now = () => 946684800000;\n${readFileSync(file, 'utf8')}`)
  }
  const runs = vi.spyOn(CompileWorkerDriver.prototype, 'run')
  const assetBaseUrl = 'http://assets.local/'
  const host = installNodeWorkerHost({ publicDir: staged, assetBaseUrl })
  const compiler = new WasmTexCompiler({
    engine,
    assetBaseUrl,
    texliveVersion: PROFILE.version,
    texliveUrl: PROFILE.url,
    files: { 'main.tex': docFor(engine) },
    mainFile: 'main.tex',
  })
  try {
    await compiler.init()
    const outputs = []
    for (const fixture of await cases(engine)) {
      for (const [file, content] of Object.entries(fixture.files)) compiler.setFile(file, content)
      compiler.setMainFile(fixture.mainFile ?? 'main.tex')
      for (let repeat = 0; repeat < 2; repeat++) {
        const result = await compiler.compile()
        assertOutcome(fixture, result)
        const auxiliary = fixture.auxiliary ? await compiler.readOutput(fixture.auxiliary) : null
        if (fixture.auxiliary) expect(auxiliary?.length, fixture.name).toBeGreaterThan(0)
        outputs.push({
          name: fixture.name,
          repeat,
          ...observable(result),
          aux: await compiler.readOutput('main.aux'),
          auxiliary,
        })
        assertKnownBaselineDefect(fixture, outputs)
      }
      console.log(`COMPAT ${PROFILE.version} ${engine} ${fixture.name}`)
    }
    expect(runs.mock.calls.some(([command]) => command === 'compileformat')).toBe(false)
    return outputs
  } finally {
    compiler.dispose()
    host.dispose()
    runs.mockRestore()
    rmSync(staged, { recursive: true, force: true })
  }
}

describe.runIf(RUN)('Unicode engine compatibility with baseline formats', () => {
  it.each([
    'xelatex',
    'lualatex',
  ] as const)('%s preserves the feature corpus and recovery', async (engine) => {
    const family = engine === 'xelatex' ? 'xetex' : 'luatex'
    const format = `wasmtex/${PROFILE.version}/wasmtex-${family}.fmt.gz`
    expect(hash(readFileSync(join(CANDIDATE!, format)))).toBe(
      hash(readFileSync(join(BASELINE!, format))),
    )
    const baseline = await compileCorpus(BASELINE!, engine)
    const candidate = await compileCorpus(CANDIDATE!, engine)
    expect(candidate).toEqual(baseline)
  }, 900_000)
})
