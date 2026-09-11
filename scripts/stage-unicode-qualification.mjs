#!/usr/bin/env node
// Assemble test-only assets from verified source builds, reusing the exact
// baseline formats. This does not produce a publishable engine release.
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateBuildReceipt } from './lib/engine-build-receipt.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const options = {}
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]
  const value = process.argv[index + 1]
  assert(['--baseline', '--xetex', '--luahbtex', '--output-public', '--year', '--source'].includes(key), `unknown option: ${key}`)
  assert(value && !value.startsWith('--'), `${key} requires a value`)
  assert(!(key in options), `duplicate option: ${key}`)
  options[key] = value
}
for (const key of ['--baseline', '--output-public', '--year', '--source']) {
  assert(options[key], `${key} is required`)
}
const families = ['xetex', 'luahbtex'].filter(family => options[`--${family}`])
assert(families.length > 0, 'at least one source-built family is required')
const year = options['--year']
assert(['2025', '2026'].includes(year), 'unsupported year')
assert(/^[a-f0-9]{40}$/.test(options['--source']), '--source must be a full source commit')
const baseline = resolve(options['--baseline'])
const output = resolve(options['--output-public'], 'wasmtex', year)
const config = JSON.parse(readFileSync(join(repo, `scripts/corresponding-source-${year}.json`), 'utf8'))
const sourcePin = readFileSync(join(repo, config.texliveSource.commitFile), 'utf8').trim()
const compositions = []
assert(!existsSync(output), `qualification output must be new: ${output}`)

for (const family of families) {
  const candidate = resolve(options[`--${family}`])
  for (const input of [baseline, candidate]) {
    assert(output !== input && !output.startsWith(input + sep), 'output must be outside input directories')
  }
  const receiptName = `BUILD-RECEIPT.${family}.json`
  const before = JSON.parse(readFileSync(join(baseline, receiptName), 'utf8'))
  const after = JSON.parse(readFileSync(join(candidate, receiptName), 'utf8'))
  for (const [receipt, actualDirectory] of [[before, baseline], [after, candidate]]) {
    assert.deepEqual(validateBuildReceipt(receipt, { config, actualDirectory }), [], `${family}: invalid receipt or artifact`)
    assert.equal(receipt.family, family)
    assert.equal(receipt.texliveSourceCommit, sourcePin)
  }
  assert.equal(after.sourceRevision, options['--source'], `${family}: wrong source revision`)
  assert.deepEqual(after.mirror, before.mirror, `${family}: mirror changed`)
  const binary = family === 'luahbtex' ? 'luatex' : 'xetex'
  const format = `wasmtex-${binary}.fmt.gz`
  assert(before.files.some(file => file.name === format), `${family}: missing baseline format provenance`)
  for (const suffix of ['.js', '.wasm', '.worker.js']) {
    assert(after.files.some(file => file.name === `wasmtex-${binary}${suffix}`), `${family}: incomplete engine build`)
  }
  for (const file of after.files.filter(file => file.name.endsWith('.wasm'))) {
    assert(WebAssembly.validate(readFileSync(join(candidate, file.name))), `${file.name}: invalid WASM`)
  }
  compositions.push({ family, candidate, before, after, format })
}

mkdirSync(dirname(output), { recursive: true })
cpSync(baseline, output, { recursive: true })
// Baseline release metadata would describe different bytes after replacement.
for (const name of ['manifest.json', 'LICENSE-MANIFEST.json', ...families.map(family => `BUILD-RECEIPT.${family}.json`)]) {
  rmSync(join(output, name), { force: true })
}
for (const { candidate, after, format } of compositions) {
  for (const file of after.files) {
    if (/\.fmt(?:\.gz)?$/.test(file.name)) continue
    cpSync(join(candidate, file.name), join(output, file.name))
  }
  assert.deepEqual(readFileSync(join(output, format)), readFileSync(join(baseline, format)))
}
writeFileSync(join(output, 'QUALIFICATION-INPUTS.json'), JSON.stringify({
  releaseQualified: false,
  sourceRevision: options['--source'],
  texliveYear: year,
  compositions: compositions.map(({ family, before, after, format }) => ({
    family,
    baselineReceipt: before,
    sourceBuildReceipt: after,
    reusedFormat: before.files.find(file => file.name === format),
    ignoredBuildFormats: after.files.filter(file => /\.fmt(?:\.gz)?$/.test(file.name)),
  })),
}, null, 2) + '\n')
console.log(`Staged test-only ${year} engines with unchanged baseline formats: ${output}`)
