#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const xetex = process.argv[2]
const outputDirectory = process.argv[3]
if (!xetex || !outputDirectory) {
  console.error(
    'Usage: node scripts/build-xetex-pdf-visual-fixture.mjs /path/to/xetex /output/directory',
  )
  process.exit(2)
}

function makePdf(pages) {
  const pageObject = (index) => index + 3
  const contentObject = (index) => index + 3 + pages.length
  const objects = [
    '',
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${pageObject(index)} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    ...pages.map(
      (page, index) =>
        `<< /Type /Page /Parent 2 0 R ${page.boxes} ${page.rotate ?? ''} /Resources << >> /Contents ${contentObject(index)} 0 R >>`,
    ),
    ...pages.map((page) => {
      const length = Buffer.byteLength(page.content, 'latin1')
      return `<< /Length ${length} >>\nstream\n${page.content}\nendstream`
    }),
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

const directory = resolve(outputDirectory)
mkdirSync(directory, { recursive: true })

writeFileSync(
  resolve(directory, 'all-boxes.pdf'),
  makePdf([
    {
      boxes:
        '/MediaBox [0 0 240 180] /CropBox [12 8 228 172] /BleedBox [24 16 216 164] /TrimBox [36 24 204 156] /ArtBox [48 32 192 148]',
      content: [
        '0.92 0.20 0.18 rg 0 0 240 180 re f',
        '0.15 0.70 0.28 rg 12 8 216 164 re f',
        '0.12 0.42 0.90 rg 24 16 192 148 re f',
        '0.70 0.22 0.82 rg 36 24 168 132 re f',
        '0.98 0.78 0.12 rg 48 32 144 116 re f',
        '0 0 0 rg 52 38 26 74 re f 86 38 8 38 re f 102 38 34 8 re f',
      ].join('\n'),
    },
  ]),
)

const rotationColors = [
  [0.90, 0.20, 0.15],
  [0.15, 0.65, 0.25],
  [0.15, 0.35, 0.90],
  [0.75, 0.20, 0.80],
]
writeFileSync(
  resolve(directory, 'rotations.pdf'),
  makePdf(
    [0, 90, 180, 270].map((rotation, index) => {
      const [red, green, blue] = rotationColors[index]
      return {
        boxes: '/MediaBox [0 0 96 144]',
        rotate: `/Rotate ${rotation}`,
        content: [
          `${red} ${green} ${blue} rg 0 0 96 144 re f`,
          '1 1 1 rg 8 10 24 112 re f 8 10 72 18 re f',
          '0 0 0 rg 58 88 28 44 re f',
        ].join('\n'),
      }
    }),
  ),
)

writeFileSync(
  resolve(directory, 'multipage.pdf'),
  makePdf([
    {
      boxes: '/MediaBox [0 0 120 160]',
      content: '0.10 0.55 0.88 rg 0 0 120 160 re f\n1 1 1 rg 8 8 24 144 re f',
    },
    {
      boxes: '/MediaBox [0 0 180 120]',
      content: '0.96 0.48 0.08 rg 0 0 180 120 re f\n0 0 0 rg 132 8 40 104 re f',
    },
  ]),
)

const inclusions = [
  ['all-boxes.pdf', 1, 'media'],
  ['all-boxes.pdf', 1, 'crop'],
  ['all-boxes.pdf', 1, 'bleed'],
  ['all-boxes.pdf', 1, 'trim'],
  ['all-boxes.pdf', 1, 'art'],
  ['rotations.pdf', 1, 'media'],
  ['rotations.pdf', 2, 'media'],
  ['rotations.pdf', 3, 'media'],
  ['rotations.pdf', 4, 'media'],
  ['multipage.pdf', 1, 'media'],
  ['multipage.pdf', 2, 'media'],
]
const tex = [
  '\\catcode`\\{=1',
  '\\catcode`\\}=2',
  '\\nonstopmode',
  ...inclusions.flatMap(([file, page, box]) => [
    `\\setbox0=\\hbox{\\XeTeXpdffile "${file}" page ${page} ${box}}`,
    '\\shipout\\box0',
  ]),
  '\\end',
  '',
].join('\n')
writeFileSync(resolve(directory, 'visual-probe.tex'), tex)

const result = spawnSync(
  resolve(xetex),
  ['-ini', '-etex', '-no-pdf', '-interaction=nonstopmode', 'visual-probe.tex'],
  {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_SOURCE_DATE: '1',
      SOURCE_DATE_EPOCH: '946684800',
      TEXINPUTS: '.',
      TEXMFOUTPUT: directory,
    },
    timeout: 60_000,
  },
)
if (result.error) throw result.error
if (result.status !== 0) {
  process.stderr.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  process.exit(result.status ?? 1)
}
