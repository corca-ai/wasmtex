import assert from 'node:assert/strict'
import test from 'node:test'
import { createLinkInventory, inspectLinkMap } from './lib/link-inventory.mjs'

const MAP = `    Addr      Off     Size Out     In      Symbol
       -     306b       28         glue.o:(entry)
       -     4000       20         /build/wasm/libs/xpdf/libxpdf.a(XRef.cc.o):(read)
       -     4020       10         /emsdk/upstream/emscripten/cache/sysroot/lib/wasm32-emscripten/libc.a(memcpy.o):(copy)
       -     4030       10         /build/wasm/libs/xpdf/libxpdf.a(XRef.cc.o):(lookup)
`

const receipt = {
  family: 'xetex',
  sourceRevision: 'a'.repeat(40),
  buildId: 'b'.repeat(64),
}

test('extracts normalized static archives and direct objects from a wasm link map', () => {
  const result = inspectLinkMap(MAP)
  assert.deepEqual(result.forbiddenMarkers, [])
  assert.deepEqual(result.directObjects, ['glue.o'])
  assert.deepEqual(
    result.archives.map(({ path, members, symbolReferences }) => ({
      path,
      members,
      symbolReferences,
    })),
    [
      {
        path: 'emscripten-sysroot/libc.a',
        members: ['memcpy.o'],
        symbolReferences: 1,
      },
      {
        path: 'texlive-build/libs/xpdf/libxpdf.a',
        members: ['XRef.cc.o'],
        symbolReferences: 2,
      },
    ],
  )
})

test('binds every map to a common receipt source revision', () => {
  const inventory = createLinkInventory([
    {
      family: 'xetex',
      mapFile: 'wasmtex-xetex.map',
      mapText: MAP,
      receiptFile: 'BUILD-RECEIPT.xetex.json',
      receipt,
    },
  ])
  assert.equal(inventory.sourceRevision, receipt.sourceRevision)
  assert.equal(inventory.maps[0].mapSha256.length, 64)
  assert.equal(inventory.maps[0].receiptFamily, 'xetex')
})

test('rejects legacy pplib markers', () => {
  assert.throws(
    () =>
      createLinkInventory([
        {
          family: 'xetex',
          mapFile: 'wasmtex-xetex.map',
          mapText: `${MAP}/build/wasm/libs/pplib/libpplib.a(ppdoc.o):(ppdoc_load)\n`,
          receiptFile: 'BUILD-RECEIPT.xetex.json',
          receipt,
        },
      ]),
    /forbidden legacy marker/,
  )
})
