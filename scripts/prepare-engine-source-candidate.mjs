#!/usr/bin/env node
// Source archives must exist before their real hashes can be registered. This
// prepares an explicitly uncleared workflow checkout, never a promoted release.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateEngineReleaseComponents } from './lib/engine-release-components.mjs'

export function prepareEngineSourceCandidate(components, license, year, run) {
  if (!['2025', '2026'].includes(year)) throw new Error('unsupported annual engine line')
  if (!/^[1-9][0-9]*$/.test(run ?? '') || !Number.isSafeInteger(Number(run))) {
    throw new Error('pdftex run must be a positive safe integer')
  }
  const candidate = structuredClone(components)
  const release = validateEngineReleaseComponents(candidate, year)
  release.downloads.find((entry) => entry.id === 'pdftex-bibtex').runId = Number(run)
  validateEngineReleaseComponents(candidate, year)
  if (license.texliveVersion !== year) throw new Error('license annual engine line mismatch')
  const candidateLicense = {
    ...structuredClone(license),
    releaseStatus: 'development-only',
    releaseBlockers: [{
      id: 'candidate-source-not-promoted',
      detail: 'Source preparation only; publish and verify corresponding source and qualify the annual engine before promotion.',
    }],
  }
  delete candidateLicense.correspondingSource
  return { components: candidate, license: candidateLicense }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const year = process.env.TEXLIVE_YEAR
  // Validate the year before using it in a filesystem path.
  if (!['2025', '2026'].includes(year)) throw new Error('unsupported annual engine line')
  const componentsPath = resolve(root, 'scripts/engine-release-components.json')
  const licensePath = resolve(root, `public/wasmtex/${year}/LICENSE-MANIFEST.json`)
  const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
  const candidate = prepareEngineSourceCandidate(
    read(componentsPath), read(licensePath), year, process.env.PDFTEX_RUN,
  )
  for (const [path, value] of [[componentsPath, candidate.components], [licensePath, candidate.license]]) {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
  }
  console.log(`Prepared uncleared ${year} source candidate from pdftex/bibtex run ${process.env.PDFTEX_RUN}`)
}
