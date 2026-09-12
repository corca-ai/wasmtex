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

const LTO_MAP = ' - 100 20 lto.tmp:(wtpdf_document_open_file)\n'
const INPUTS = 'glue.o\n/build/wasm/libs/xpdf/libxpdf.a(XRef.cc.o)\n/emsdk/upstream/emscripten/cache/sysroot/lib/wasm32-emscripten/lto/libc.a(memcpy.o)\n'
const ltoEntry = {
  family: 'luahbtex', mapFile: 'wasmtex-luatex.map', mapText: LTO_MAP,
  receiptFile: 'BUILD-RECEIPT.luahbtex.json', receipt: {...receipt, family: 'luahbtex'},
}

test('requires input evidence when LTO removes archive attribution', () => {
  assert.throws(() => createLinkInventory([ltoEntry]), /LTO map requires/)
  assert.throws(() => createLinkInventory([{...ltoEntry, inputTraceFile: 'inputs', inputTraceText: 'not linker output'}]), /LTO map requires/)
  const result = createLinkInventory([{...ltoEntry, inputTraceFile: 'wasmtex-luatex.link-inputs', inputTraceText: INPUTS}])
  assert.equal(result.maps[0].inputTraceSha256.length, 64)
  assert.deepEqual(result.maps[0].archives.map(x => x.path), [
    'emscripten-sysroot/lto/libc.a', 'texlive-build/libs/xpdf/libxpdf.a',
  ])
  assert.deepEqual(result.maps[0].directObjects, ['glue.o'])
  assert.ok(result.maps[0].archives.every(x => x.symbolReferences === 0))
})

test('cannot hide a forbidden library behind LTO', () => {
  assert.throws(() => createLinkInventory([{
    ...ltoEntry, inputTraceFile: 'inputs',
    inputTraceText: INPUTS + '/build/wasm/libs/pplib/libpplib.a(ppdoc.o)\n',
  }]), /forbidden legacy marker/)
})
