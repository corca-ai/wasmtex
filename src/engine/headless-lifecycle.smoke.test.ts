import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WasmTexCompiler } from '../headless'
import { installNodeWorkerHost } from './node-host'
import { smokeTexliveProfile } from './smoke-texlive-profile'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const document = (name: string) => `\\documentclass{article}
\\begin{document}
\\section{${name}}\\label{${name}}
${name} project.
\\end{document}`

describe.runIf(process.env.NODE_COMPILE_SMOKE === '1')('headless project lifecycle on WASM', () => {
  it('does not publish the previous PDF after a warm early fatal stop and recovers', async () => {
    const profile = smokeTexliveProfile()
    const host = installNodeWorkerHost({
      publicDir: process.env.WASMTEX_SMOKE_PUBLIC_DIR ?? join(root, 'public'),
      assetBaseUrl: 'http://assets.local/',
    })
    const source = document('valid').replace(
      'valid project.',
      '\\typeout{! ==> Fatal error occurred, no output PDF file produced!}\nvalid project.',
    )
    const compiler = new WasmTexCompiler({
      assetBaseUrl: 'http://assets.local/',
      engine: 'pdflatex',
      texliveVersion: profile.version,
      texliveUrl: profile.url,
      files: { 'main.tex': source },
    })
    try {
      await compiler.init()
      const first = await compiler.compile()
      expect(first.success, first.log).toBe(true)
      expect(first.pdf?.length).toBeGreaterThan(0)
      expect(compiler.getProjectIndex().resolveLabel('valid')).toBeDefined()
      compiler.setFile('main.tex', source.replace('{article}', '{wasmtexmissingclass168}'))
      const failed = await compiler.compile()
      expect(failed.log).toContain('Fatal error occurred, no output PDF file produced!')
      expect(failed.success).toBe(false)
      expect(failed.pdf).toBeNull()
      expect(failed.synctex).toBeNull()
      expect(compiler.getProjectIndex().resolveLabel('valid')).toBeUndefined()
      compiler.setFile('main.tex', document('recovered'))
      const recovered = await compiler.compile()
      expect(recovered.success, recovered.log).toBe(true)
      expect(recovered.pdf?.length).toBeGreaterThan(0)
      expect(await compiler.readOutput('main.aux')).toContain('\\newlabel{recovered}')
      expect(compiler.getProjectIndex().resolveLabel('recovered')).toBeDefined()
    } finally {
      compiler.dispose()
      host.dispose()
    }
  }, 180_000)

  it('recovers after an interrupted compile and then reuses the engine for another project', async () => {
    const profile = smokeTexliveProfile()
    const host = installNodeWorkerHost({
      publicDir: process.env.WASMTEX_SMOKE_PUBLIC_DIR ?? join(root, 'public'),
      assetBaseUrl: 'http://assets.local/',
    })
    let reportCompile!: () => void
    let armed = false
    const compiling = new Promise<void>((resolve) => {
      reportCompile = resolve
    })
    const compiler = new WasmTexCompiler({
      assetBaseUrl: 'http://assets.local/',
      engine: 'pdflatex',
      incremental: true,
      texliveVersion: profile.version,
      texliveUrl: profile.url,
      onLoadProgress: (event) => {
        // A class/package download after init comes from the running TeX job.
        // Observe its real worker event instead of cancelling before compile dispatch.
        if (armed && event.phase === 'file') reportCompile()
      },
      files: { 'main.tex': document('original'), 'removed.tex': 'old project only' },
    })
    try {
      await compiler.init()
      armed = true
      const pending = compiler.compile()
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      await compiling
      armed = false
      await compiler.loadProject({ 'main.tex': document('replacement') })
      await rejected
      for (const name of ['replacement', 'warm']) {
        if (name === 'warm') await compiler.loadProject({ 'main.tex': document(name) })
        const result = await compiler.compile()
        expect(result.success, result.log).toBe(true)
        expect(result.pdf?.length).toBeGreaterThan(0)
        const aux = await compiler.readOutput('main.aux')
        expect(aux).toContain(`\\newlabel{${name}}`)
        expect(aux).not.toContain('\\newlabel{original}')
        expect(compiler.listFiles()).not.toContain('removed.tex')
        expect(result.telemetry?.completionSnapshot?.identity.root).toBe('main.tex')
        expect(compiler.getCompletionSnapshotState().status).toBe('fresh')
      }
    } finally {
      compiler.dispose()
      host.dispose()
    }
  }, 180_000)
})
