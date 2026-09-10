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

async function compileEdits(publicDir: string, engine: 'xelatex' | 'lualatex') {
  const { installNodeWorkerHost } = await import('./node-host')
  const { WasmTexCompiler } = await import('../headless')
  const { CompileWorkerDriver } = await import('./wasmtex-worker')
  const runs = vi.spyOn(CompileWorkerDriver.prototype, 'run')
  // dvipdfmx can compress its document dates inside an object stream. Give both
  // real engines the same clock rather than weakening the PDF byte comparison.
  // Only temporary test controllers change; WASM/formats and release dirs do not.
  const staged = mkdtempSync(join(tmpdir(), 'wasmtex-heap-smoke-'))
  cpSync(publicDir, staged, { recursive: true })
  for (const binary of ['xetex', 'dvipdfm', 'luatex']) {
    const controller = resolve(staged, `wasmtex/${PROFILE.version}/wasmtex-${binary}.worker.js`)
    writeFileSync(controller, `Date.now = () => 946684800000;\n${readFileSync(controller, 'utf8')}`)
  }
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
\usepackage{fontspec}
\setmainfont{Latin Modern Roman}
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

describe.runIf(!!BASELINE && !!CANDIDATE)('Unicode heap representation preservation', () => {
  it.each([
    'xelatex',
    'lualatex',
  ] as const)('%s preserves outputs across body and preamble edits with the baseline format', async (engine) => {
    const binary = engine === 'xelatex' ? 'xetex' : 'luatex'
    for (const suffix of REBUILT_ENGINE ? ['.fmt.gz'] : ['.wasm', '.js', '.fmt.gz']) {
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
