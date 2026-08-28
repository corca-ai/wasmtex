const SHA256 = /^[a-f0-9]{64}$/i
const EXPECTED_FAMILIES = ['bibtex', 'bibtex8', 'luahbtex', 'makeindex', 'pdftex', 'xetex']

function validateMirror(mirror, year, label) {
  const revision = mirror?.revision ?? ''
  const separator = revision.indexOf('-')
  const revisionYear = revision.slice(0, separator)
  const identity = revision.slice(separator + 1)
  if (separator < 0 || revisionYear !== year || !/^[a-f0-9]{16}$/.test(identity)) {
    throw new Error(`${year}: invalid ${label} mirror revision`)
  }
  if (!SHA256.test(mirror?.provenanceSha256 ?? '')) {
    throw new Error(`${year}: invalid ${label} mirror provenance`)
  }
  if (
    !/^https:\/\//.test(mirror?.url ?? '') ||
    !mirror.url.includes(`/${mirror.revision}/${year}/`)
  ) {
    throw new Error(`${year}: ${label} mirror URL does not contain its immutable identity`)
  }
  return mirror
}

export function validateEngineReleaseComponents(config, year) {
  if (config?.schemaVersion !== 1) throw new Error('release components schemaVersion must be 1')
  const release = config.years?.[year]
  if (!release) throw new Error(`release components omit TeX Live ${year}`)
  validateMirror(release.mirror, year, 'release')

  const artifactNames = new Set()
  const downloadIds = new Set()
  const runIds = new Set()
  for (const download of release.downloads ?? []) {
    if (!/^[a-z][a-z0-9-]*$/.test(download.id ?? '') || downloadIds.has(download.id)) {
      throw new Error(`${year}: invalid or duplicate component download ID`)
    }
    downloadIds.add(download.id)
    if (!Number.isSafeInteger(download.runId) || download.runId <= 0) {
      throw new Error(`${year}: invalid component workflow run ID`)
    }
    runIds.add(download.runId)
    if (!Array.isArray(download.artifacts) || download.artifacts.length === 0) {
      throw new Error(`${year}: component download has no artifacts`)
    }
    for (const artifact of download.artifacts) {
      if (!/^wasm-[a-z0-9-]+$/.test(artifact) || artifactNames.has(artifact)) {
        throw new Error(`${year}: invalid or duplicate component artifact ${String(artifact)}`)
      }
      artifactNames.add(artifact)
    }
  }
  const expectedDownloadIds = ['bibtex8', 'luahbtex', 'makeindex', 'pdftex-bibtex', 'xetex']
  if (JSON.stringify([...downloadIds].sort()) !== JSON.stringify(expectedDownloadIds)) {
    throw new Error(`${year}: component downloads do not cover each workflow family exactly`)
  }
  const suffix = year === '2025' ? '' : `-${year}`
  const expectedArtifacts = [
    `wasm-pdftex${suffix}`,
    `wasm-bibtex${suffix}`,
    `wasm-bibtex8${suffix}`,
    `wasm-makeindex${suffix}`,
    `wasm-xetex${suffix}`,
    `wasm-luatex${suffix}`,
  ].sort()
  if (JSON.stringify([...artifactNames].sort()) !== JSON.stringify(expectedArtifacts)) {
    throw new Error(`${year}: component artifacts do not cover the annual engine set exactly`)
  }
  if (runIds.size !== 5) throw new Error(`${year}: expected five independently pinned workflow runs`)
  return release
}

export function resolveEngineBuildMirror(release, year, overrides = {}) {
  const entries = Object.entries({
    url: overrides.url?.trim(),
    revision: overrides.revision?.trim(),
    provenanceSha256: overrides.provenanceSha256?.trim(),
  })
  const supplied = entries.filter(([, value]) => value).length
  if (supplied !== 0 && supplied !== entries.length) {
    throw new Error(`${year}: mirror override must provide URL, revision, and provenance together`)
  }
  return supplied === 0
    ? release.mirror
    : validateMirror(Object.fromEntries(entries), year, 'override')
}

export function validateComposedEngineRelease(inspected, release) {
  const failures = []
  const expectedMirror = JSON.stringify(release.mirror)
  for (const receipt of inspected.receipts) {
    if (JSON.stringify(receipt.value.mirror ?? null) !== expectedMirror) {
      failures.push(`${receipt.name}: receipt mirror does not match the pinned release mirror`)
    }
  }
  const families = inspected.receipts.map((receipt) => receipt.value.family).sort()
  if (JSON.stringify(families) !== JSON.stringify(EXPECTED_FAMILIES)) {
    failures.push('build receipts do not cover the composed engine families exactly')
  }
  return failures
}

export function buildRunsFor(release) {
  return Object.fromEntries(
    release.downloads.map((download) => [download.id, download.runId]),
  )
}
