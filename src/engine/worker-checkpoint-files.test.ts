import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { expect, it } from 'vitest'

it.each([
  1, 2,
])('restores active output bytes instead of colliding project files (flags %i)', (flags) => {
  const files = new Map<string, string>()
  const streams: { fd: number; path: string; flags: number; position: number }[] = []
  const scope = createContext({
    performance,
    importScripts() {},
    FS: {
      mkdirTree() {},
      writeFile(path: string, bytes: string) {
        files.set(path, bytes)
      },
      open(path: string, flags: number) {
        const stream = { fd: streams.length + 3, path, flags, position: 0 }
        streams.push(stream)
        return stream
      },
      close() {},
    },
  })
  scope.self = scope
  runInContext(
    readFileSync(new URL('../../wasm-build/pdftex-worker.js', import.meta.url), 'utf8'),
    scope,
  )
  scope.closeFSStreams = () => {}
  scope.cleanDir = () => files.clear()
  scope._hc.hostWrites = {
    'book.pdf': 'imported old PDF',
    'chapter.tex': 'edited chapter',
    'figure.pdf': 'edited figure',
  }
  scope.snapshot = {
    files: {
      '/work/book.pdf': 'compiled PDF prefix',
      '/work/chapter.tex': 'original chapter',
      '/work/figure.pdf': 'original figure',
    },
    streams: [
      { fd: 3, path: '/work/book.pdf', flags, position: 19 },
      { fd: 4, path: '/work/figure.pdf', flags: 0, position: 3 },
    ],
  }
  runInContext('hcRestoreFS(snapshot)', scope)
  expect(files.get('/work/book.pdf')).toBe('compiled PDF prefix')
  expect(files.get('/work/chapter.tex')).toBe('edited chapter')
  expect(files.get('/work/figure.pdf')).toBe('edited figure')
  expect(streams.map(({ position }) => position)).toEqual([19, 3])
  // Repeated resumes must retain both the checkpoint and host-owned source bytes.
  expect(scope.snapshot.files['/work/book.pdf']).toBe('compiled PDF prefix')
  expect(scope._hc.hostWrites['book.pdf']).toBe('imported old PDF')
})
