#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const xetex = process.argv[2]
const expectedPath = process.argv[3]
if (!xetex) {
  console.error(
    'Usage: node scripts/test-xetex-pdf-geometry.mjs /path/to/xetex [expected.json]',
  )
  process.exit(2)
}

function makePdf(pages) {
  const objects = [
    '',
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${index + 3} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    ...pages.map((page) => `<< /Type /Page /Parent 2 0 R ${page} >>`),
  ]
  let pdf = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'
  const offsets = new Array(objects.length).fill(0)
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, 'latin1')
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

const queries = [
  ['all-media', 'all-boxes.pdf', 1, 'media'],
  ['all-crop', 'all-boxes.pdf', 1, 'crop'],
  ['all-bleed', 'all-boxes.pdf', 1, 'bleed'],
  ['all-trim', 'all-boxes.pdf', 1, 'trim'],
  ['all-art', 'all-boxes.pdf', 1, 'art'],
  ['rotate-0', 'rotations.pdf', 1, 'media'],
  ['rotate-90', 'rotations.pdf', 2, 'media'],
  ['rotate-180', 'rotations.pdf', 3, 'media'],
  ['rotate-270', 'rotations.pdf', 4, 'media'],
  ['fallback-crop', 'fallback.pdf', 1, 'crop'],
  ['fallback-bleed', 'fallback.pdf', 1, 'bleed'],
  ['fallback-trim', 'fallback.pdf', 1, 'trim'],
  ['fallback-art', 'fallback.pdf', 1, 'art'],
  ['clamp-first', 'multipage.pdf', 0, 'media'],
  ['clamp-last-high', 'multipage.pdf', 999, 'media'],
  ['clamp-last-negative', 'multipage.pdf', -1, 'media'],
]

const directory = mkdtempSync(join(tmpdir(), 'wasmtex-xetex-geometry-'))
try {
  writeFileSync(
    join(directory, 'all-boxes.pdf'),
    makePdf([
      '/MediaBox [10 20 210 420] /CropBox [20 30 200 400] /BleedBox [25 35 195 395] /TrimBox [30 40 190 390] /ArtBox [35 45 185 385]',
    ]),
  )
  writeFileSync(
    join(directory, 'rotations.pdf'),
    makePdf([0, 90, 180, 270].map((rotation) => `/MediaBox [0 0 72 144] /Rotate ${rotation}`)),
  )
  writeFileSync(
    join(directory, 'fallback.pdf'),
    makePdf(['/MediaBox [0 0 100 200] /CropBox [1 2 90 180]']),
  )
  writeFileSync(
    join(directory, 'multipage.pdf'),
    makePdf(['/MediaBox [0 0 100 200]', '/MediaBox [0 0 300 400]']),
  )

  const tex = [
    '\\catcode`\\{=1',
    '\\catcode`\\}=2',
    '\\nonstopmode',
    ...queries.map(
      ([name, file, page, box]) =>
        `\\setbox0=\\hbox{\\XeTeXpdffile "${file}" page ${page} ${box}}%\n` +
        `\\immediate\\write16{GEOM:${name}:\\the\\wd0:\\the\\ht0:\\the\\dp0}`,
    ),
    '\\end',
    '',
  ].join('\n')
  writeFileSync(join(directory, 'probe.tex'), tex)

  const result = spawnSync(
    resolve(xetex),
    ['-ini', '-etex', '-no-pdf', '-interaction=nonstopmode', 'probe.tex'],
    {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, TEXINPUTS: '.', TEXMFOUTPUT: directory },
      timeout: 60_000,
    },
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '')
    process.stderr.write(result.stderr ?? '')
    process.exit(result.status ?? 1)
  }

  const measurements = Object.fromEntries(
    [...result.stdout.matchAll(/^GEOM:(\S+?):(\S+?):(\S+?):(\S+)$/gm)].map((match) => [
      match[1],
      { width: match[2], height: match[3], depth: match[4] },
    ]),
  )
  if (Object.keys(measurements).length !== queries.length) {
    process.stderr.write(result.stdout)
    throw new Error(`expected ${queries.length} measurements, got ${Object.keys(measurements).length}`)
  }
  const output = `${JSON.stringify(measurements, null, 2)}\n`
  process.stdout.write(output)

  if (expectedPath) {
    const expected = JSON.parse(readFileSync(resolve(expectedPath), 'utf8'))
    if (JSON.stringify(measurements) !== JSON.stringify(expected)) {
      process.stderr.write(`XeTeX PDF geometry mismatch; expected:\n${JSON.stringify(expected, null, 2)}\n`)
      process.exitCode = 1
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true })
}
