import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { PDFDocument, PDFArray, decodePDFRawStream } from 'pdf-lib'

// Consume the distributable package, without relying on repository module resolution.
const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', './packages/eps-converter'], { encoding: 'utf8' }))[0]
const temp = mkdtempSync(join(tmpdir(), 'wasmtex-eps-consumer-'))
execFileSync('tar', ['-xzf', packed.filename, '-C', temp])
const pkg = join(temp, 'package')
const { loadEpsConverter } = await import(pathToFileURL(join(pkg, 'dist/index.js')))
const module = await WebAssembly.compile(readFileSync(join(pkg, 'assets/stet_bg.wasm')))
const converter = await loadEpsConverter(pathToFileURL(join(pkg, 'assets/stet.js')).href, module)
const signal = new AbortController().signal
const eps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 30 20
1 0 0 setrgbcolor 0 0 30 20 rectfill
%%EOF
`
const convert = (source) => converter.convert({ bytes: Buffer.from(source), signal })

try {
  await test('packed converter ships verified payloads, notices and native build inputs', () => {
    const manifest = JSON.parse(readFileSync(join(pkg, 'assets/manifest.json')))
    for (const [name, record] of Object.entries(manifest.files)) {
      const bytes = readFileSync(join(pkg, 'assets', name))
      assert.equal(bytes.length, record.bytes)
      assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256)
    }
    for (const [name, hash] of Object.entries(manifest.nativeSources))
      assert.equal(createHash('sha256').update(readFileSync(join(pkg, 'native', name))).digest('hex'), hash)
    assert.match(readFileSync(join(pkg, 'assets/THIRD_PARTY_NOTICES.txt'), 'utf8'), /Linked Rust crates/)
    assert.match(readFileSync(join(pkg, 'assets/LICENSE-URW-FONTS.txt'), 'utf8'), /SIL OPEN FONT LICENSE/)
  })
  await test('installed declarations typecheck without SDK or UI dependencies', () => {
    const consumer = join(temp, 'consumer.mts')
    writeFileSync(consumer, `import { loadEpsConverter, type EpsConverter } from './package/dist/index.js';
      const converter: EpsConverter = await loadEpsConverter('https://assets.example/stet.js');
      const callback: (request: { path: string; bytes: Uint8Array; signal: AbortSignal }) => Promise<Uint8Array> = converter.convert;
      void callback; void converter.memoryBytes;`)
    execFileSync('node_modules/.bin/tsc', ['--noEmit', '--strict', '--target', 'es2022', '--module', 'NodeNext', '--skipLibCheck', 'false', consumer], { stdio: 'pipe' })
  })
  await test('real conversion preserves bounds, vector graphics and deterministic output', async () => {
    const bytes = await convert(eps)
    const pdf = await PDFDocument.load(bytes)
    assert.equal(pdf.getPageCount(), 1)
    assert.deepEqual(pdf.getPage(0).getSize(), { width: 30, height: 20 })
    assert.deepEqual(await convert(eps), bytes)
    assert.ok(converter.memoryBytes <= 128 * 1024 * 1024)
  })
  await test('DOS EPS binary wrapper and nested EPS preserve outer bounds', async () => {
    const body = Buffer.from(eps.replace('%%EOF', '%%BeginDocument: inner.eps\n%%BoundingBox: 2 2 5 5\n2 2 3 3 rectfill\n%%EndDocument\n%%EOF'))
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0xc6d3d0c5)
    header.writeUInt32LE(30, 4)
    header.writeUInt32LE(body.length, 8)
    header.writeUInt16LE(0xffff, 28)
    const pdf = await PDFDocument.load(await converter.convert({ bytes: Buffer.concat([header, body]), signal }))
    assert.equal(pdf.getPageCount(), 1)
    assert.deepEqual(pdf.getPage(0).getSize(), { width: 30, height: 20 })
  })
  await test('Type 3 and Type 42 scientific figures render vector glyphs with their original bounds', async () => {
    for (const type of [3, 42]) {
      const bytes = readFileSync(new URL(`fixtures/type${type}.eps`, import.meta.url))
      const pdf = await PDFDocument.load(await converter.convert({ bytes, signal }))
      assert.equal(pdf.getPageCount(), 1)
      assert.deepEqual(pdf.getPage(0).getSize(), { width: 216, height: 144 })
      const contents = pdf.getPage(0).node.Contents()
      const streams = contents instanceof PDFArray ? contents.asArray() : [contents]
      const commands = streams.map((ref) => Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString()).join('\n')
      assert.ok((commands.match(/\b(?:m|l|c)\b/g) ?? []).length > 100, 'expected plot and outlined glyph paths')
    }
  })
  await test('errors and cancellation return no successful-looking partial PDF', async () => {
    await assert.rejects(convert(eps.replace('%%EOF', 'undefinedEpsOperator')), /undefinedEpsOperator/)
    await assert.rejects(convert(''), /nonempty/)
    await assert.rejects(convert(eps.replace('%%EOF', 'showpage showpage')), /exactly one page/)
    await assert.rejects(converter.convert({ bytes: Buffer.from(eps), signal: AbortSignal.abort() }), { name: 'AbortError' })
    assert.equal((await PDFDocument.load(await convert(eps))).getPageCount(), 1)
  })
} finally {
  rmSync(temp, { recursive: true, force: true })
  rmSync(packed.filename)
}
