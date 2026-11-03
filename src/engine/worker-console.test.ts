import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

interface WorkerScope {
  Module?: {
    print?: (message: string) => void
    printErr?: (message: string) => void
  }
  onmessage?: (event: { data: Record<string, unknown> }) => void
  postMessage: ReturnType<typeof vi.fn>
}

function loadController(name: string, fs?: unknown) {
  const source = readFileSync(resolve('wasm-build', name), 'utf8')
  const scope: WorkerScope = { postMessage: vi.fn() }
  const workerConsole = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }

  new Function('self', 'importScripts', 'console', 'performance', 'FS', source)(
    scope,
    vi.fn(),
    workerConsole,
    { now: () => 0 },
    fs,
  )

  return { scope, workerConsole }
}

describe('engine worker console output', () => {
  it('keeps routine pdfTeX preload events out of the browser console', () => {
    const { scope, workerConsole } = loadController('pdftex-worker.js')

    scope.onmessage?.({
      data: { cmd: 'loadformat', data: new Uint8Array([1, 2, 3]).buffer },
    })
    scope.onmessage?.({
      data: {
        cmd: 'loadbloom',
        data: new Uint8Array([0x42, 0x46, 0x30, 0x31, 1, 0, 0, 0, 8, 0]).buffer,
      },
    })

    expect(workerConsole.log).not.toHaveBeenCalled()
    expect(workerConsole.warn).not.toHaveBeenCalled()
    expect(scope.postMessage).toHaveBeenCalledWith({ result: 'ok', cmd: 'loadformat' })
  })

  it.each([
    'bibtex-worker.js',
    'bibtex8-worker.js',
    'makeindex-worker.js',
  ])('captures %s engine output without duplicating it to the browser console', (controller) => {
    const { scope, workerConsole } = loadController(controller)

    scope.Module?.print?.('engine output')
    scope.Module?.printErr?.('engine warning')

    expect(workerConsole.log).not.toHaveBeenCalled()
    expect(workerConsole.warn).not.toHaveBeenCalled()
  })

  it('retains a warning for a malformed pdfTeX bloom filter', () => {
    const { scope, workerConsole } = loadController('pdftex-worker.js')

    scope.onmessage?.({
      data: {
        cmd: 'loadbloom',
        data: new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 8, 0]).buffer,
      },
    })

    expect(workerConsole.warn).toHaveBeenCalledOnce()
  })

  it('answers ok for a pdfTeX directory that already exists', () => {
    const nodes = new Map<string, 'dir' | 'file'>([['/work/figure', 'file']])
    const fs = {
      mkdir: (path: string) => {
        if (nodes.has(path)) throw new Error('EEXIST')
        nodes.set(path, 'dir')
      },
      stat: (path: string) => {
        const mode = nodes.get(path)
        if (!mode) throw new Error('ENOENT')
        return { mode }
      },
      isDir: (mode: string) => mode === 'dir',
    }
    const { scope, workerConsole } = loadController('pdftex-worker.js', fs)

    for (const url of ['chapters', 'chapters', 'figure']) {
      scope.onmessage?.({ data: { cmd: 'mkdir', url } })
    }

    expect(scope.postMessage.mock.calls).toEqual([
      [{ result: 'ok', cmd: 'mkdir' }],
      [{ result: 'ok', cmd: 'mkdir' }],
      [{ result: 'failed', cmd: 'mkdir' }],
    ])
    expect(workerConsole.error.mock.calls).toEqual([['Not able to mkdir figure']])
  })

  it('returns expected pdfTeX failures through the worker protocol without console dumps', () => {
    const source = readFileSync(resolve('wasm-build/pdftex-worker.js'), 'utf8')

    expect(source).not.toContain('console.error(self.memlog)')
    for (const internalMessage of [
      '[preamble] build log contains fatal errors',
      '[preamble] format build failed',
      '[compile] Initial format build failed',
      'Failed to read PDF output',
      'Compilation failed, with status code',
      'Failed to read format file',
      'Compilation format failed, with status code',
    ]) {
      expect(source).not.toContain(internalMessage)
    }
  })
})
