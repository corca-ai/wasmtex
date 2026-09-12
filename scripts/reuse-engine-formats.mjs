#!/usr/bin/env node
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { composeFormatReceipt, validateBuildReceipt } from './lib/engine-build-receipt.mjs'

const args = Object.fromEntries(Array.from({ length: (process.argv.length - 2) / 2 }, (_, i) =>
  [process.argv[2 + i * 2], process.argv[3 + i * 2]]))
for (const key of ['--year', '--assets', '--formats', '--family']) {
  if (!args[key]) throw new Error(`missing ${key}`)
}
if (!['2025', '2026'].includes(args['--year'])) throw new Error('unsupported annual line')
if (!['pdftex', 'xetex', 'luahbtex'].includes(args['--family'])) throw new Error('unsupported format family')
const config = JSON.parse(readFileSync(new URL(`./corresponding-source-${args['--year']}.json`, import.meta.url)))
const filename = `BUILD-RECEIPT.${args['--family']}.json`
const assets = resolve(args['--assets'])
const baseline = resolve(args['--formats'])
if (assets === baseline) throw new Error('generation inputs must be distinct directories')
const engine = JSON.parse(readFileSync(join(assets, filename)))
const formats = JSON.parse(readFileSync(join(baseline, filename)))
for (const [receipt, actualDirectory] of [[engine, assets], [formats, baseline]]) {
  const failures = validateBuildReceipt(receipt, { config, actualDirectory })
  if (failures.length) throw new Error(failures.join('\n'))
}
const composed = composeFormatReceipt({ engine, formats, config })
for (const file of composed.files) {
  if (/\.fmt(?:\.gz)?$/.test(file.name)) copyFileSync(join(baseline, file.name), join(assets, file.name))
}
const failures = validateBuildReceipt(composed, { config, actualDirectory: assets })
if (failures.length) throw new Error(failures.join('\n'))
writeFileSync(join(assets, filename), `${JSON.stringify(composed, null, 2)}\n`)
console.log(`${args['--year']} ${engine.family}: engine ${engine.sourceRevision}, unchanged formats ${formats.sourceRevision}`)
