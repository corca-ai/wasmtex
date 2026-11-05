#!/usr/bin/env node
// Source archives must exist before their real hashes can be registered. This
// prepares an explicitly uncleared workflow checkout, never a promoted release.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateEngineReleaseComponents } from './lib/engine-release-components.mjs'

// `run` replaces the paired pdfTeX/BibTeX download and `luatexRun` the LuaHBTeX one;
// either may be omitted when another family is supplied. A new run also builds a new format, so its family must
// keep a reused format or be named in `rebuiltFormats`: a change of format bytes, never
// an optimization.
export function prepareEngineSourceCandidate(components, license, year, run, luatexRun, rebuiltFormats = [], extraRuns = {}) {
  if (!['2025', '2026'].includes(year)) throw new Error('unsupported annual engine line')
  const extraFamilies = ['xetex', 'bibtex8', 'makeindex', 'metafont']
  if (Object.keys(extraRuns).some((id) => !extraFamilies.includes(id))) throw new Error('unknown candidate family')
  const runs = [['pdftex-bibtex', run, 'pdftex', 'pdftex'], ['luahbtex', luatexRun, 'luatex', 'luahbtex'],
    ...extraFamilies.map((id) => [id, extraRuns[id], id, id === 'xetex' ? id : null])]
    .filter(([, value]) => value !== undefined)
  if (runs.length === 0) throw new Error('pdftex run must be a positive safe integer')
  for (const [, value, name] of runs) {
    if (!/^[1-9][0-9]*$/.test(value ?? '') || !Number.isSafeInteger(Number(value))) {
      throw new Error(`${name} run must be a positive safe integer`)
    }
  }
  const candidate = structuredClone(components)
  const release = validateEngineReleaseComponents(candidate, year)
  for (const [id, value] of runs) release.downloads.find((entry) => entry.id === id).runId = Number(value)
  for (const family of rebuiltFormats) {
    if (!runs.some(([, , , runFamily]) => runFamily === family)) {
      throw new Error(`${family} needs a new run to rebuild its format`)
    }
  }
  for (const [, , , family] of runs) {
    if (family === null) continue
    const reused = release.reusedFormats?.some((entry) => entry.family === family)
    if (!reused && !rebuiltFormats.includes(family)) {
      throw new Error(`${family} has no reused format, so this run would change its format bytes`)
    }
  }
  release.reusedFormats = release.reusedFormats?.filter((entry) => !rebuiltFormats.includes(entry.family))
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
  const pdftexRun = process.env.PDFTEX_RUN || undefined
  const luatexRun = process.env.LUATEX_RUN || undefined
  const rebuiltFormats = (process.env.REBUILT_FORMATS || '').split(',').filter(Boolean)
  const candidate = prepareEngineSourceCandidate(
    read(componentsPath), read(licensePath), year, pdftexRun, luatexRun, rebuiltFormats, {
      xetex: process.env.XETEX_RUN || undefined,
      bibtex8: process.env.BIBTEX8_RUN || undefined,
      makeindex: process.env.MAKEINDEX_RUN || undefined,
      metafont: process.env.METAFONT_RUN || undefined,
    },
  )
  for (const [path, value] of [[componentsPath, candidate.components], [licensePath, candidate.license]]) {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
  }
  console.log(`Prepared uncleared ${year} source candidate from pdftex/bibtex run ${pdftexRun ?? 'pinned'}, luahbtex run ${luatexRun ?? 'pinned'}`)
}
