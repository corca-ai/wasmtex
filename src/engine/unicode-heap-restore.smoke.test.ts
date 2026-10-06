import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { CompileResult } from '../types'
import { smokeTexliveProfile } from './smoke-texlive-profile'

// Compare separately staged baseline/candidate assets without modifying release
// directories. The candidate must contain the edited authored worker controllers.
const BASELINE = process.env.WASMTEX_HEAP_BASELINE_DIR
const CANDIDATE = process.env.WASMTEX_SMOKE_PUBLIC_DIR
// Explicitly distinguish a source rebuild from a controller-only comparison.
// Both modes must reuse the baseline format and must never regenerate it.
const REBUILT_ENGINE = process.env.WASMTEX_HEAP_REBUILT_ENGINE === '1'
const PROFILE = smokeTexliveProfile()
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function pdfDigest(bytes: Uint8Array) {
  return hash(
    Buffer.from(bytes)
      .toString('latin1')
      .replace(/\/(?:CreationDate|ModDate)\s*\([^)]*\)/g, '')
      .replace(/\/ID\s*\[[^\]]*\]/g, ''),
  )
}

function observableOutput(result: CompileResult, aux: string | null) {
  return {
    pdf: pdfDigest(result.pdf!),
    aux,
    errors: result.errors,
    diagnostics: result.telemetry?.diagnostics,
    synctex: result.synctex ? hash(result.synctex) : null,
  }
}

function forceConverterGrowth(staged: string): void {
  const controller = resolve(staged, `wasmtex/${PROFILE.version}/wasmtex-dvipdfm.worker.js`)
  // Test-only allocator pressure before the first conversion: exceed the current
  // capacity on BOTH sides, dirty the allocation, release it, then let the real
  // controller reset and compile. Subsequent edits exercise reuse of grown pages.
  const probe = `
const originalConversion = compilePDFRoutine;
let allocationProbed = false;
compilePDFRoutine = function () {
  if (!allocationProbed) {
    const before = HEAPU8.length;
    const size = before + 65536;
    const pointer = _malloc(size);
    if (!pointer || HEAPU8.length <= before) throw new Error('Converter did not grow');
    HEAPU8.fill(0xa5, pointer, pointer + size);
    _free(pointer);
    allocationProbed = true;
  }
  return originalConversion();
};
`
  writeFileSync(controller, `${readFileSync(controller, 'utf8')}\n${probe}`)
}

async function compileEdits(
  publicDir: string,
  engine: 'pdflatex' | 'xelatex' | 'lualatex',
  growConverter = false,
) {
  const { installNodeWorkerHost } = await import('./node-host')
  const { WasmTexCompiler } = await import('../headless')
  const { CompileWorkerDriver } = await import('./wasmtex-worker')
  const runs = vi.spyOn(CompileWorkerDriver.prototype, 'run')
  // dvipdfmx can compress its document dates inside an object stream. Give both
  // real engines the same clock rather than weakening the PDF byte comparison.
  // Only temporary test controllers change; WASM/formats and release dirs do not.
  const staged = mkdtempSync(join(tmpdir(), 'wasmtex-heap-smoke-'))
  cpSync(publicDir, staged, { recursive: true })
  for (const binary of ['pdftex', 'xetex', 'dvipdfm', 'luatex']) {
    const controller = resolve(staged, `wasmtex/${PROFILE.version}/wasmtex-${binary}.worker.js`)
    writeFileSync(controller, `Date.now = () => 946684800000;\n${readFileSync(controller, 'utf8')}`)
  }
  if (growConverter) forceConverterGrowth(staged)
  const assetBaseUrl = 'http://assets.local/'
  const host = installNodeWorkerHost({ publicDir: staged, assetBaseUrl })
  const body = String.raw`\section{Introduction}\label{sec:intro}
Text with mathematics $E=mc^2$ and a reference to Section~\ref{sec:intro}.
\projectword.
`
  const macros = String.raw`\newcommand{\projectword}{Original word}`
  const compiler = new WasmTexCompiler({
    engine,
    assetBaseUrl,
    texliveVersion: PROFILE.version,
    texliveUrl: PROFILE.url,
    mainFile: 'main.tex',
    files: {
      'main.tex': String.raw`\documentclass{article}
${engine === 'pdflatex' ? String.raw`\usepackage[T1]{fontenc}\usepackage{lmodern}` : String.raw`\usepackage{fontspec}\setmainfont{Latin Modern Roman}`}
\input{macros.tex}
\begin{document}
\input{sections/body.tex}
\end{document}
`,
      'macros.tex': macros,
      'sections/body.tex': body,
    },
  })
  try {
    await compiler.init()
    const outputs = []
    for (let edit = 0; edit < 4; edit++) {
      if (edit === 1) compiler.setFile('sections/body.tex', `${body}\nAn edited paragraph.\n`)
      if (edit === 2) {
        compiler.setFile('macros.tex', String.raw`\newcommand{\projectword}{Replacement word}`)
      }
      if (edit === 3) {
        compiler.setFile('sections/body.tex', body)
        compiler.setFile('macros.tex', macros)
      }
      // A second run also checks stale C state after the changed document ran.
      for (let repeat = 0; repeat < 2; repeat++) {
        const result = await compiler.compile()
        expect(result.success, result.log).toBe(true)
        expect(result.pdf?.length).toBeGreaterThan(0)
        // A missing/invalid supplied pdfTeX format is returned after fallback
        // generation. It must never hide an incompatible baseline format here.
        expect(result.format).toBeUndefined()
        const aux = await compiler.readOutput('main.aux')
        expect(aux).not.toBeNull()
        outputs.push(observableOutput(result, aux))
      }
    }
    expect(outputs[6]).toEqual(outputs[0])
    expect(outputs[7]).toEqual(outputs[1])
    expect(outputs[2]?.pdf).not.toEqual(outputs[0]?.pdf)
    expect(outputs[4]?.pdf).not.toEqual(outputs[2]?.pdf)
    if (REBUILT_ENGINE && engine === 'lualatex') {
      // Exceed a 128 MiB initial heap, then return to the original document in
      // the same worker. This exercises growth and subsequent state restoration.
      compiler.setFile(
        'sections/body.tex',
        String.raw`\directlua{local s = string.rep("x", 160 * 1024 * 1024); tex.print(string.len(s))}`,
      )
      const grown = await compiler.compile()
      expect(grown.success, grown.log).toBe(true)
      expect(grown.pdf?.length).toBeGreaterThan(0)
      outputs.push(observableOutput(grown, await compiler.readOutput('main.aux')))
      compiler.setFile('sections/body.tex', body)
      const restored = await compiler.compile()
      expect(restored.success, restored.log).toBe(true)
      expect(observableOutput(restored, await compiler.readOutput('main.aux'))).toEqual(outputs[0])
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

/** One blank, font-free DVI page, exercising the real converter without TeX. */
function blankDvi(): Uint8Array {
  const bytes: number[] = []
  const uint32 = (value: number) =>
    bytes.push((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255)
  const units = () => {
    uint32(25400000)
    uint32(473628672)
    uint32(1000)
  }
  bytes.push(247, 2)
  units()
  bytes.push(0)
  const bop = bytes.length
  bytes.push(139, ...Array<number>(40).fill(0))
  uint32(0xffffffff)
  bytes.push(140)
  const post = bytes.length
  bytes.push(248)
  uint32(bop)
  units()
  uint32(0)
  uint32(0)
  bytes.push(0, 0, 0, 1)
  bytes.push(249)
  uint32(post)
  bytes.push(2, 223, 223, 223, 223)
  while (bytes.length % 4) bytes.push(223)
  return Uint8Array.from(bytes)
}

async function failedConverterRecovery(publicDir: string) {
  const { installNodeWorkerHost } = await import('./node-host')
  const { createCompileWorker } = await import('./tex-fmt-engine')
  const staged = mkdtempSync(join(tmpdir(), 'wasmtex-converter-growth-'))
  cpSync(publicDir, staged, { recursive: true })
  const file = join(staged, `wasmtex/${PROFILE.version}/wasmtex-dvipdfm.worker.js`)
  writeFileSync(file, `Date.now = () => 946684800000;\n${readFileSync(file, 'utf8')}`)
  forceConverterGrowth(staged)
  const assetBaseUrl = 'http://assets.local/'
  const host = installNodeWorkerHost({ publicDir: staged, assetBaseUrl })
  const driver = createCompileWorker('dvipdfm', {
    assetBaseUrl,
    texliveVersion: PROFILE.version,
    texliveUrl: PROFILE.url,
  })
  try {
    await driver.init()
    driver.setMainFile('main.xdv')
    const outputs = []
    for (const input of [new Uint8Array([247, 2]), blankDvi(), blankDvi()]) {
      await driver.writeFile('main.xdv', input)
      const result = await driver.run('compilepdf')
      outputs.push({
        success: result.success,
        log: result.log,
        pdf: result.out ? pdfDigest(result.out) : null,
      })
    }
    expect(outputs[0]?.success).toBe(false)
    expect(outputs[1]?.success, outputs[1]?.log).toBe(true)
    expect(outputs[1]?.pdf).not.toBeNull()
    expect(outputs[2]).toEqual(outputs[1])
    return outputs
  } finally {
    driver.terminate()
    host.dispose()
    rmSync(staged, { recursive: true, force: true })
  }
}

describe.runIf(!!BASELINE && !!CANDIDATE)('Engine heap representation preservation', () => {
  it('recovers from converter failure after memory growth', async () => {
    expect(await failedConverterRecovery(CANDIDATE!)).toEqual(
      await failedConverterRecovery(BASELINE!),
    )
  }, 120_000)

  it('preserves XeLaTeX output and recovery after converter memory growth', async () => {
    const baseline = await compileEdits(BASELINE!, 'xelatex', true)
    const candidate = await compileEdits(CANDIDATE!, 'xelatex', true)
    expect(candidate).toEqual(baseline)
  }, 240_000)

  it.each([
    'pdflatex',
    'xelatex',
    'lualatex',
  ] as const)('%s preserves outputs across body and preamble edits with the baseline format', async (engine) => {
    const binary = engine === 'pdflatex' ? 'pdftex' : engine === 'xelatex' ? 'xetex' : 'luatex'
    const formatSuffix = engine === 'pdflatex' ? '.fmt' : '.fmt.gz'
    for (const suffix of REBUILT_ENGINE ? [formatSuffix] : ['.wasm', '.js', formatSuffix]) {
      const path = `wasmtex/${PROFILE.version}/wasmtex-${binary}${suffix}`
      expect(hash(readFileSync(resolve(CANDIDATE!, path)))).toBe(
        hash(readFileSync(resolve(BASELINE!, path))),
      )
    }
    const baseline = await compileEdits(BASELINE!, engine)
    const candidate = await compileEdits(CANDIDATE!, engine)
    expect(candidate).toEqual(baseline)
  }, 240_000)
})
