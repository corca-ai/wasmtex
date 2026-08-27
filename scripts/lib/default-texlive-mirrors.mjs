const DEFAULT_TEXLIVE_URLS = Object.freeze({
  '2025': 'https://texlive.corca.ai/snapshots/2025-92e10d3241a312f0/2025/',
  '2026': 'https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/',
})

export function defaultTexliveUrl(version) {
  const url = DEFAULT_TEXLIVE_URLS[version]
  if (!url) throw new Error(`unsupported TeX Live version: ${version}`)
  return url
}
