#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const xetex = process.argv[2]
const directory = process.argv[3]
if (!xetex || !directory) {
  console.error('Usage: node scripts/test-xetex-pdf-extended.mjs XETEX FIXTURE_DIR')
  process.exit(2)
}

const work = resolve(directory)
const tex = [
  '\\catcode`\\{=1',
  '\\catcode`\\}=2',
  '\\nonstopmode',
  '\\count0=\\XeTeXpdfpagecount "classic.pdf" ',
  '\\immediate\\write16{EXT:count-classic:\\the\\count0}',
  '\\count0=\\XeTeXpdfpagecount "xref-object-stream.pdf" ',
  '\\immediate\\write16{EXT:count-modern:\\the\\count0}',
  '\\count0=\\XeTeXpdfpagecount "deep.pdf" ',
  '\\immediate\\write16{EXT:count-deep:\\the\\count0}',
  '\\count0=\\XeTeXpdfpagecount "encrypted.pdf" ',
  '\\immediate\\write16{EXT:count-encrypted:\\the\\count0}',
  '\\count0=\\XeTeXpdfpagecount "damaged-repairable.pdf" ',
  '\\immediate\\write16{EXT:count-damaged:\\the\\count0}',
  '\\count0=0',
  '\\setbox0=\\hbox{\\XeTeXpdffile "classic.pdf" page 1 media}',
  '\\immediate\\write16{EXT:classic-box:\\the\\wd0:\\the\\ht0:\\the\\dp0}',
  '\\shipout\\box0',
  '\\setbox0=\\hbox{\\XeTeXpdffile "xref-object-stream.pdf" page 1 media}',
  '\\immediate\\write16{EXT:modern-box:\\the\\wd0:\\the\\ht0:\\the\\dp0}',
  '\\shipout\\box0',
  '\\end',
  '',
].join('\n')
writeFileSync(resolve(work, 'extended-probe.tex'), tex)

const run = spawnSync(
  resolve(xetex),
  ['-ini', '-etex', '-no-pdf', '-interaction=nonstopmode', 'extended-probe.tex'],
  {
    cwd: work,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_SOURCE_DATE: '1',
      SOURCE_DATE_EPOCH: '946684800',
      TEXINPUTS: '.',
      TEXMFOUTPUT: work,
    },
    timeout: 60_000,
  },
)
if (run.error) throw run.error
if (run.status !== 0) {
  process.stderr.write(run.stdout ?? '')
  process.stderr.write(run.stderr ?? '')
  process.exit(run.status ?? 1)
}

const values = Object.fromEntries(
  [...run.stdout.matchAll(/^EXT:([^:]+):(.+)$/gm)].map((match) => [match[1], match[2]]),
)
const required = [
  'count-classic',
  'count-modern',
  'count-deep',
  'count-encrypted',
  'count-damaged',
  'classic-box',
  'modern-box',
]
for (const key of required) {
  if (!(key in values)) {
    process.stderr.write(run.stdout ?? '')
    throw new Error(`missing XeTeX extended result: ${key}`)
  }
}

const clean = {
  classic: { pages: Number(values['count-classic']), box: values['classic-box'] },
  modern: { pages: Number(values['count-modern']), box: values['modern-box'] },
  deep: { pages: Number(values['count-deep']) },
}
const diagnostics = {
  encryptedPages: Number(values['count-encrypted']),
  damagedPages: Number(values['count-damaged']),
}
writeFileSync(resolve(work, 'clean.json'), `${JSON.stringify(clean, null, 2)}\n`)
writeFileSync(resolve(work, 'diagnostics.json'), `${JSON.stringify(diagnostics, null, 2)}\n`)

if (readFileSync(resolve(work, 'extended-probe.xdv')).length === 0) {
  throw new Error('XeTeX extended probe produced an empty XDV')
}
