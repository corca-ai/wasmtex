export function selectSupplementalArtifacts(artifactManifest, provenanceManifest) {
  const declaredKeys = new Set((provenanceManifest.files ?? []).map(({ key }) => key))
  return (artifactManifest.artifacts ?? []).filter(
    ({ key }) => key.startsWith('pdftex/') && !declaredKeys.has(key),
  )
}
