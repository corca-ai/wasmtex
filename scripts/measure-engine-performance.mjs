#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installNodeWorkerHost, WasmTexCompiler } from '../lib/node.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const engine = process.argv[2]
const outputFlag = process.argv.indexOf('--out')
const outputPath = outputFlag >= 0 ? process.argv[outputFlag + 1] : null
if (!['pdflatex', 'xelatex', 'lualatex'].includes(engine)) {
  console.error('Usage: node scripts/measure-engine-performance.mjs ENGINE [--out FILE]')
  process.exit(2)
}

const assetBaseUrl = 'http://assets.local/'
const publicDir = process.env.WASMTEX_PUBLIC_DIR || join(root, 'public')
const texliveVersion = process.env.TEXLIVE_VERSION === '2026' ? '2026' : '2025'
const texliveUrl =
  process.env.TEXLIVE_URL ||
  (texliveVersion === '2026'
    ? 'https://texlive.corca.ai/snapshots/2026-b4f6befbe7732169/2026/'
    : 'https://d1jectpaw0dlvl.cloudfront.net/2025/')
installNodeWorkerHost({ publicDir, assetBaseUrl })
const unicode = engine !== 'pdflatex'
const source = [
  `% !TEX program = ${engine}`,
  '\\documentclass{article}',
  '\\usepackage{amsmath}',
  ...(unicode ? ['\\usepackage{fontspec}', '\\setmainfont{Latin Modern Roman}'] : []),
  '\\begin{document}',
  'WasmTex performance budget. $E=mc^2$.',
  '\\[\\sum_{k=1}^{100} k = 5050\\]',
  '\\end{document}',
  '',
].join('\n')

const compiler = new WasmTexCompiler({
  engine,
  texliveVersion,
  assetBaseUrl,
  texliveUrl,
  files: { 'main.tex': source },
})

const started = performance.now()
await compiler.init()
const initMs = performance.now() - started
const firstStarted = performance.now()
const first = await compiler.compile()
const firstCompileMs = performance.now() - firstStarted
const secondStarted = performance.now()
const second = await compiler.compile()
const secondCompileMs = performance.now() - secondStarted
compiler.dispose()

const sample = {
  engine,
  success: first.success && second.success && !!second.pdf?.length,
  pdfBytes: second.pdf?.length ?? 0,
  initMs: Math.round(initMs),
  firstCompileMs: Math.round(firstCompileMs),
  secondCompileMs: Math.round(secondCompileMs),
  firstPhaseTimings: first.phaseTimings ?? null,
  secondPhaseTimings: second.phaseTimings ?? null,
  peakRssMiB: Math.ceil(process.resourceUsage().maxRSS / 1024),
}
const output = `${JSON.stringify(sample, null, 2)}\n`
if (outputPath) writeFileSync(resolve(root, outputPath), output)
else process.stdout.write(output)
if (!sample.success) process.exitCode = 1
