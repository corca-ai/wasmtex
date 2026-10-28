import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { expect, it } from 'vitest'

function controller() {
  const scope = createContext({ performance, importScripts() {} })
  scope.self = scope
  runInContext(
    readFileSync(new URL('../../wasm-build/pdftex-worker.js', import.meta.url), 'utf8'),
    scope,
  )
  return scope
}

it('bounds the rewound read by the following checkpoint, even in a contiguous chapter list', () => {
  const scope = controller()
  const lengths: number[] = []
  const node = {}
  scope.FS = {
    read: (_stream: unknown, _buffer: unknown, _offset: number, length: number) => {
      lengths.push(length)
      return length
    },
  }
  scope.Asyncify = {
    state: 2,
    State: { Normal: 0, Unwinding: 1, Rewinding: 2 },
    handleSleep: () => {
      scope.Asyncify.state = 0
    },
  }
  scope._hc.armed = [
    { id: 'first', offset: 4, node },
    { id: 'next', offset: 8, node },
  ]
  runInContext('hcInstallReadHook()', scope)
  expect(scope.FS.read({ node, position: 4 }, new Uint8Array(16), 0, 16)).toBe(4)
  expect(lengths).toEqual([4])
  expect(scope._hc.armed.map((entry: { id: string }) => entry.id)).toEqual(['next'])
})

it('still arms a following checkpoint on the first read after a heap resume', () => {
  const scope = controller()
  const node = {}
  scope.FS = {
    read: (_stream: unknown, _buffer: unknown, _offset: number, length: number) => length,
  }
  scope.Asyncify = {
    state: 2,
    State: { Normal: 0, Unwinding: 1, Rewinding: 2 },
    handleSleep: () => {
      scope.Asyncify.state = 0
    },
  }
  scope._hc.resuming = { node }
  scope._hc.armed = [{ id: 'next', offset: 8, node }]
  runInContext('hcInstallReadHook()', scope)
  expect(scope.FS.read({ node, position: 4 }, new Uint8Array(16), 0, 16)).toBe(4)
  expect(scope._hc.resuming).toBeNull()
})

it('skips a missed boundary without reading through the next one', () => {
  const scope = controller()
  const node = {}
  scope.FS = {
    read: () => {
      throw new Error('Read past the next suspension')
    },
  }
  scope.Asyncify = {
    state: 0,
    State: { Normal: 0, Unwinding: 1, Rewinding: 2 },
    handleSleep: (start: (wake: () => void) => void) => {
      start(() => {})
      scope.Asyncify.state = 1
    },
  }
  scope._hc.armed = [
    { id: 'missed', offset: 4, node },
    { id: 'next', offset: 8, node },
  ]
  runInContext('hcInstallReadHook()', scope)
  expect(scope.FS.read({ node, position: 8 }, new Uint8Array(16), 0, 16)).toBe(0)
  expect(scope._hc.pending.cp.id).toBe('next')
})

it('continues through multiple synchronous suspensions before awaiting document completion', async () => {
  const scope = controller()
  let complete!: (status: number) => void
  let waiters = 0
  scope.Asyncify = {
    currData: 1,
    whenDone: () => {
      waiters++
      return new Promise<number>((resolve) => {
        complete = resolve
      })
    },
  }
  scope.hcTakeSnapshot = (cp: { id: string; line: number }) => ({
    ...cp,
    bytes: 1,
    ms: 0,
    image: { pages: [] },
    fs: { files: {} },
  })
  scope._hc.pending = {
    cp: { id: 'first', line: 4 },
    wakeUp: () => {
      scope._hc.pending = {
        cp: { id: 'next', line: 5 },
        wakeUp: () => {
          scope.Asyncify.currData = null
          complete(0)
        },
      }
    },
  }
  expect(await runInContext('hcContinueWhileSuspended(0)', scope)).toBe(0)
  expect(scope._hc.taken.map((entry: { id: string }) => entry.id)).toEqual(['first', 'next'])
  expect(waiters).toBe(1)
})

it('records native reads before the recorder flushes, including a chapter read before suspension', () => {
  const scope = controller()
  scope.FS = {
    read: (_stream: unknown, _buffer: unknown, _offset: number, length: number) => length,
  }
  scope.Asyncify = { state: 0, State: { Normal: 0, Unwinding: 1, Rewinding: 2 } }
  scope._hc.trackingInputs = true
  scope._hc.readInputs = {}
  runInContext('hcInstallReadHook()', scope)
  scope.FS.read({ path: '/work/earlier.tex', node: {}, position: 0 }, new Uint8Array(10), 0, 10)
  scope._hc.trackingInputs = false
  scope.FS.read({ path: '/work/later.tex', node: {}, position: 0 }, new Uint8Array(10), 0, 10)
  expect(Object.keys(scope._hc.readInputs)).toEqual(['/work/earlier.tex'])
  scope.hcSparseImage = () => ({ bytes: 0 })
  scope.hcSnapshotFS = () => ({ files: {}, streams: [] })
  scope.stackSave = () => 0
  const snapshot = runInContext('hcTakeSnapshot({id:"cp", line:5, offset:100})', scope)
  expect(snapshot.inputs).toEqual(['/work/earlier.tex'])
  expect(snapshot.inputsComplete).toBe(true)
})

it('reaches the next boundary in the file being read even when another file has an earlier offset', () => {
  const scope = controller()
  const chapter = {},
    main = {}
  scope.FS = { read: (_s: unknown, _b: unknown, _o: number, length: number) => length }
  scope.Asyncify = {
    state: 0,
    State: { Normal: 0, Unwinding: 1, Rewinding: 2 },
    handleSleep: (start: (wake: () => void) => void) => {
      start(() => {})
      scope.Asyncify.state = 1
    },
  }
  scope._hc.armed = [
    { id: 'main', offset: 4, node: main },
    { id: 'chapter', offset: 20, node: chapter },
  ]
  runInContext('hcInstallReadHook()', scope)
  expect(scope.FS.read({ node: chapter, position: 0 }, new Uint8Array(100), 0, 100)).toBe(20)
  expect(scope.FS.read({ node: chapter, position: 20 }, new Uint8Array(100), 0, 100)).toBe(0)
  expect(scope._hc.pending.cp.id).toBe('chapter')
  expect(scope._hc.armed[0].id).toBe('main')
})

it('reads arm source metadata before enabling suspension hooks and only once per file', () => {
  const scope = controller()
  const reads: string[] = []
  scope.hcSupported = () => true
  scope.hcEnsureDataBuffer = () => {}
  scope.mainfile = 'main.tex'
  scope.TextEncoder = TextEncoder
  const nodes = { '/work/main.tex': {}, '/work/chapter.tex': {} }
  scope.FS = {
    read: () => 0,
    readFile: (path: string) => {
      expect(scope._hc.armed).toHaveLength(0)
      reads.push(path)
      return 'first\nsecond\nthird\n'
    },
    lookupPath: (path: keyof typeof nodes) => ({ node: nodes[path] }),
  }
  runInContext(
    'hcArm([{id:"m1",line:2},{id:"c1",line:2,path:"chapter.tex"},{id:"m2",line:3}],null)',
    scope,
  )
  expect(reads).toEqual(['/work/main.tex', '/work/chapter.tex'])
  expect(scope._hc.armed).toHaveLength(3)
})
