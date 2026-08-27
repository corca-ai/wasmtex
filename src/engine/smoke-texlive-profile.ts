export type SmokeTexliveProfile = {
  version: '2025' | '2026'
  url: string
}

const DEFAULT_PROFILE: SmokeTexliveProfile = {
  version: '2025',
  url: 'https://d1jectpaw0dlvl.cloudfront.net/2025/',
}

export function smokeTexliveProfile(
  env: Partial<
    Record<'WASMTEX_SMOKE_TEXLIVE_VERSION' | 'WASMTEX_SMOKE_TEXLIVE_URL', string>
  > = process.env,
): SmokeTexliveProfile {
  const version = env.WASMTEX_SMOKE_TEXLIVE_VERSION
  const url = env.WASMTEX_SMOKE_TEXLIVE_URL

  if (version === undefined && url === undefined) return DEFAULT_PROFILE
  if (version === undefined || url === undefined) {
    throw new Error(
      'WASMTEX_SMOKE_TEXLIVE_VERSION and WASMTEX_SMOKE_TEXLIVE_URL must be set together',
    )
  }
  if (version !== '2025' && version !== '2026') {
    throw new Error(`unsupported WASMTEX_SMOKE_TEXLIVE_VERSION: ${version}`)
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`invalid WASMTEX_SMOKE_TEXLIVE_URL: ${url}`)
  }
  if (parsed.protocol !== 'https:' || !parsed.pathname.split('/').includes(version)) {
    throw new Error(`WASMTEX_SMOKE_TEXLIVE_URL must be an HTTPS URL for TeX Live ${version}`)
  }

  return { version, url }
}
