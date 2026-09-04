#!/usr/bin/env node
/**
 * Register a built engine release, in one edit instead of four.
 *
 * A release is described in four places that must agree: the pinned workflow
 * runs, the distribution profile, the license manifest's corresponding-source
 * binding, and the profile-id list the tests hold. Updating them by hand means
 * finding out one CI failure at a time which one was missed, which is how the
 * job-name release (#107) went: three separate red builds, each naming the next
 * file. This writes all four from one set of inputs.
 *
 * It does not decide anything. The run IDs, the release ID and the archive
 * hash are facts produced by the build and the source archive; this only puts
 * them where they belong, consistently.
 *
 * Usage:
 *   node scripts/register-engine-release.mjs \
 *     --year 2026 --profile-id 2026-20260826-8b79469 \
 *     --label "TeX Live 2026 latest (2026-08-26, engine 8b79469)" \
 *     --release-id 2026-8b7946970153c52e \
 *     --source-sha256 <sha> \
 *     --run pdftex-bibtex=33885489901 --run xetex=33885502236 \
 *     --run luahbtex=33885505118 \
 *     [--from 2026-20260826] [--source-revision <sha> ...]
 *
 * `--from` names the published profile this one is derived from; families with
 * no `--run` keep that profile's pinned run, which is what the corresponding
 * source rules require for a family whose inputs did not change.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function fail(message) {
  console.error(`register-engine-release: ${message}`)
  process.exit(1)
}

function options(argv) {
  const single = {}
  const runs = {}
  const sourceRevisions = []
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--')) fail(`unexpected argument: ${key}`)
    if (value === undefined || value.startsWith('--')) fail(`${key} requires a value`)
    const name = key.slice(2)
    if (name === 'run') {
      const [family, runId] = value.split('=')
      if (!family || !/^\d+$/.test(runId ?? '')) fail(`--run wants family=runId, got ${value}`)
      runs[family] = Number(runId)
    } else if (name === 'source-revision') {
      sourceRevisions.push(value)
    } else {
      single[name] = value
    }
  }
  return { runs, single, sourceRevisions }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

const { runs, single, sourceRevisions } = options(process.argv.slice(2))
for (const required of ['year', 'profile-id', 'release-id', 'source-sha256']) {
  if (!single[required]) fail(`--${required} is required`)
}
const year = single.year
const releaseId = single['release-id']
if (!new RegExp(`^${year}-[a-f0-9]{16}$`).test(releaseId)) {
  fail(`--release-id must look like ${year}-<16 hex>`)
}
if (!/^[a-f0-9]{64}$/.test(single['source-sha256'])) fail('--source-sha256 must be 64 hex')

const profilesPath = join(root, `scripts/texlive-profiles-${year}.json`)
const profiles = readJson(profilesPath)
const from = single.from ?? profiles.distributionProfileId
const base = profiles.profiles.find((profile) => profile.id === from)
if (!base) fail(`no profile ${from} in ${profilesPath}`)
if (profiles.profiles.some((profile) => profile.id === single['profile-id'])) {
  fail(`profile ${single['profile-id']} already exists; a published profile is immutable`)
}

const buildRuns = { ...base.engine.buildRuns }
for (const [family, runId] of Object.entries(runs)) {
  if (!(family in buildRuns)) fail(`unknown build family: ${family}`)
  buildRuns[family] = runId
}

const registered = {
  ...JSON.parse(JSON.stringify(base)),
  id: single['profile-id'],
  label: single.label ?? base.label,
  engine: {
    releaseId,
    tag: `engine-${releaseId}`,
    sourceRevisions: sourceRevisions.length > 0 ? sourceRevisions : base.engine.sourceRevisions,
    correspondingSourceSha256: single['source-sha256'],
    buildRuns,
  },
}
profiles.profiles.push(registered)
profiles.distributionProfileId = registered.id
if (profiles.discovery?.profileId === from) profiles.discovery.profileId = registered.id
writeJson(profilesPath, profiles)

// 2. The pinned components the release assembler downloads.
const componentsPath = join(root, 'scripts/engine-release-components.json')
const components = readJson(componentsPath)
const downloads = components.years[year]?.downloads
if (!downloads) fail(`no ${year} downloads in ${componentsPath}`)
for (const entry of downloads) {
  if (entry.id in buildRuns) entry.runId = buildRuns[entry.id]
}
writeJson(componentsPath, components)

// 3. The corresponding-source binding recipients are given.
const licensePath = join(root, `public/wasmtex/${year}/LICENSE-MANIFEST.json`)
const license = readJson(licensePath)
license.correspondingSource = {
  ...license.correspondingSource,
  url: `https://github.com/corca-ai/wasmtex/releases/download/engine-${releaseId}/wasmtex-${releaseId}-source.tar.xz`,
  sha256: single['source-sha256'],
}
writeJson(licensePath, license)

// 4. The profile-id list the tests hold, so adding one stays a deliberate edit.
const testPath = join(root, 'scripts/texlive-profiles.test.mjs')
const test = readFileSync(testPath, 'utf8')
const ids = profiles.profiles.map((profile) => `'${profile.id}'`).join(', ')
const listed = new RegExp(`\\[\\s*'${year}-[^\\]]*\\]`, 'm')
if (!listed.test(test)) fail(`could not find the ${year} profile-id list in ${testPath}`)
writeFileSync(testPath, test.replace(listed, `[${ids}]`))

console.log(`Registered ${registered.id} (engine ${releaseId})`)
console.log(`  profiles          ${profilesPath}`)
console.log(`  pinned components ${componentsPath}`)
console.log(`  license manifest  ${licensePath}`)
console.log(`  profile-id list   ${testPath}`)
console.log('\nRun `npm run test:license-tools` to confirm the four agree.')
