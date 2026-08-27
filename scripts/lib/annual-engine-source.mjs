import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateSourceConfig } from './engine-build-receipt.mjs'

export function validateAnnualEngineSource(root, year) {
  if (!/^(2025|2026)$/.test(year ?? '')) throw new Error(`unsupported TeX Live year: ${year}`)
  const config = JSON.parse(readFileSync(resolve(root, `scripts/corresponding-source-${year}.json`)))
  validateSourceConfig(config)
  if (config.texliveYear !== year) throw new Error(`source config year does not match ${year}`)
  const refPath = resolve(root, config.texliveSource.commitFile)
  const ref = readFileSync(refPath, 'utf8').trim()
  if (!/^[a-f0-9]{40}$/.test(ref)) throw new Error(`${config.texliveSource.commitFile}: invalid commit`)
  if (!config.texliveSource.commitFile.endsWith(`-${year}.ref`)) {
    throw new Error(`TeX Live ${year} must use a year-specific source ref`)
  }
  return { config, ref }
}
