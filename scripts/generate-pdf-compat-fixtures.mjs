#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const outputDirectory = process.argv[2]
if (!outputDirectory) {
  console.error('Usage: node scripts/generate-pdf-compat-fixtures.mjs OUTPUT_DIR')
  process.exit(2)
}

function classicPdf(objects, trailer = '') {
  let pdf = Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')
  const offsets = new Array(objects.length).fill(0)
  for (let index = 1; index < objects.length; index += 1) {
    if (objects[index] == null) continue
    offsets[index] = pdf.length
    pdf = Buffer.concat([
      pdf,
      Buffer.from(`${index} 0 obj\n`, 'ascii'),
      Buffer.isBuffer(objects[index]) ? objects[index] : Buffer.from(objects[index], 'latin1'),
      Buffer.from('\nendobj\n', 'ascii'),
    ])
  }
  const xrefOffset = pdf.length
  const entries = offsets
    .map((offset, index) =>
      index === 0 || offset === 0
        ? '0000000000 65535 f \n'
        : `${String(offset).padStart(10, '0')} 00000 n \n`,
    )
    .join('')
  pdf = Buffer.concat([
    pdf,
    Buffer.from(
      `xref\n0 ${objects.length}\n${entries}trailer\n<< /Size ${objects.length} /Root 1 0 R ${trailer} >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      'ascii',
    ),
  ])
  return pdf
}

function stream(dictionary, bytes) {
  return Buffer.concat([
    Buffer.from(`<< ${dictionary} /Length ${bytes.length} >>\nstream\n`, 'ascii'),
    bytes,
    Buffer.from('\nendstream', 'ascii'),
  ])
}

function appendField(chunks, value, width) {
  const bytes = Buffer.alloc(width)
  let rest = value
  for (let index = width - 1; index >= 0; index -= 1) {
    bytes[index] = rest & 0xff
    rest = Math.floor(rest / 256)
  }
  chunks.push(bytes)
}

function xrefObjectStreamPdf() {
  let pdf = Buffer.from('%PDF-1.5\n%\xe2\xe3\xcf\xd3\n', 'latin1')
  const offsets = new Array(7).fill(0)
  const pages = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
  const page =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Resources << >> /Contents 4 0 R >>'
  const header = `2 0 3 ${Buffer.byteLength(pages, 'ascii') + 1} `
  const objectStream = Buffer.from(`${header}${pages} ${page}`, 'ascii')

  const addObject = (number, body) => {
    offsets[number] = pdf.length
    pdf = Buffer.concat([
      pdf,
      Buffer.from(`${number} 0 obj\n`, 'ascii'),
      body,
      Buffer.from('\nendobj\n', 'ascii'),
    ])
  }
  addObject(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'))
  addObject(4, stream('', Buffer.from('0.9 0.3 0.2 rg 0 0 72 72 re f\n', 'ascii')))
  addObject(
    5,
    stream(`/Type /ObjStm /N 2 /First ${Buffer.byteLength(header, 'ascii')}`, objectStream),
  )

  offsets[6] = pdf.length
  const fields = []
  const entry = (type, second, third) => {
    appendField(fields, type, 1)
    appendField(fields, second, 4)
    appendField(fields, third, 2)
  }
  entry(0, 0, 65535)
  entry(1, offsets[1], 0)
  entry(2, 5, 0)
  entry(2, 5, 1)
  entry(1, offsets[4], 0)
  entry(1, offsets[5], 0)
  entry(1, offsets[6], 0)
  const xref = Buffer.concat(fields)
  addObject(6, stream('/Type /XRef /Size 7 /Root 1 0 R /W [1 4 2]', xref))
  pdf = Buffer.concat([
    pdf,
    Buffer.from(`startxref\n${offsets[6]}\n%%EOF\n`, 'ascii'),
  ])
  return pdf
}

const scannerProgram = Buffer.from(
  '10 2.5 true /N#61me (A\\000B) [1 2] << /K (V) >> ProbeOp\n',
  'ascii',
)
const compressedProgram = deflateSync(scannerProgram, { level: 9 })
const classic = classicPdf(
  [
    null,
    '<< /Type /Catalog /Pages 2 0 R /Types [null true 7 2.5 /A#20Name (A\\000B) <410042> 7 0 R] /Literal (A\\000B\\n\\(\\)\\\\) /Hex <410042> /Order << /Z 1 /A 2 /M 3 >> /ProbeStream 6 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 144] /Resources << >> /Contents 4 0 R >>',
    stream('', Buffer.from('0.2 0.6 0.9 rg 0 0 72 144 re f\n', 'ascii')),
    '<< /Producer (WasmTex compatibility fixture) >>',
    stream('/Filter /FlateDecode', compressedProgram),
    '<< /Indirect true /Value 42 >>',
  ],
  '/Info 5 0 R',
)

const encrypted = Buffer.from(
  'JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgPDc2Y2IyMmMyMmZjZWMyNWFlM2VkNWQwMjRkNzc3MjhmODNkNTEyNDdhY2Q5Mzc2Y2I5NTZlZmQ3MmY5Mj4KPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9Db3VudCAxCi9LaWRzIFsgNCAwIFIgXQo+PgplbmRvYmoKMyAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1Jlc291cmNlcyA8PAo+PgovTWVkaWFCb3ggWyAwLjAgMC4wIDcyIDE0NCBdCi9QYXJlbnQgMiAwIFIKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL1YgMgovUiAzCi9MZW5ndGggMTI4Ci9QIDQyOTQ5NjcyOTIKL0ZpbHRlciAvU3RhbmRhcmQKL08gPDBiYTM4MzVmODhmOTAzODhlNzRlNTQ1ODQxMjVjZTE0MmJlMGRlMjRjNmIwZDM3NzQ2ZTA3NWI4OTE3NTY2NzE+Ci9VIDw4N2M4ZjNiNWQ5OWNjMjEwNWVmMjA5ZDYwNWI2ZmYzZDI4YmY0ZTVlNGU3NThhNDE2NDAwNGU1NmZmZmEwMTA4Pgo+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAxMDkgMDAwMDAgbiAKMDAwMDAwMDE2OCAwMDAwMCBuIAowMDAwMDAwMjE3IDAwMDAwIG4gCjAwMDAwMDAzMTAgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA2Ci9Sb290IDMgMCBSCi9JbmZvIDEgMCBSCi9JRCBbIDw2NjMxMzAzMTM3MzUzNDMwMzk2NDM1MzMzOTM4MzEzMjY1MzYzNzYxMzUzMzM0NjM2MzMxMzUzNTMwMzU2NTM1PiA8NjYzMTMwMzEzNzM1MzQzMDM5NjQzNTMzMzkzODMxMzI2NTM2Mzc2MTM1MzMzNDYzNjMzMTM1MzUzMDM1NjUzNT4gXQovRW5jcnlwdCA1IDAgUgo+PgpzdGFydHhyZWYKNTI1CiUlRU9GCg==',
  'base64',
)

const damaged = Buffer.from(classic)
const startxref = damaged.lastIndexOf(Buffer.from('startxref\n', 'ascii'))
const numberStart = startxref + Buffer.byteLength('startxref\n', 'ascii')
const numberEnd = damaged.indexOf(0x0a, numberStart)
damaged.fill(0x20, numberStart, numberEnd)
damaged.write('0', numberStart, 'ascii')

const directory = resolve(outputDirectory)
mkdirSync(directory, { recursive: true })
writeFileSync(resolve(directory, 'classic.pdf'), classic)
writeFileSync(resolve(directory, 'xref-object-stream.pdf'), xrefObjectStreamPdf())
writeFileSync(resolve(directory, 'encrypted.pdf'), encrypted)
writeFileSync(resolve(directory, 'damaged-repairable.pdf'), damaged)

const depth = 300
writeFileSync(
  resolve(directory, 'deep.pdf'),
  classicPdf([
    null,
    `<< /Type /Catalog /Pages 2 0 R /Deep ${'['.repeat(depth)}0${']'.repeat(depth)} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Resources << >> >>',
  ]),
)
