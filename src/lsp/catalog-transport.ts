export interface CatalogIdentity {
  schemaVersion: number
  texliveYear: string
  mirrorRevision: string
}

export interface CatalogTextStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}

export class CatalogIdentityError extends Error {}

export function validCatalogIdentity(
  value: unknown,
  schemaVersion: number,
): value is CatalogIdentity {
  if (!value || typeof value !== 'object') return false
  const identity = value as Partial<CatalogIdentity>
  return (
    identity.schemaVersion === schemaVersion &&
    /^\d{4}$/.test(identity.texliveYear ?? '') &&
    /^\d{4}-[a-f0-9]{16}$/.test(identity.mirrorRevision ?? '')
  )
}

export function sameCatalogIdentity(a: CatalogIdentity, b: CatalogIdentity): boolean {
  return (
    a.schemaVersion === b.schemaVersion &&
    a.texliveYear === b.texliveYear &&
    a.mirrorRevision === b.mirrorRevision
  )
}

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export interface ReadCatalogTextOptions {
  baseUrl: string
  cacheNamespace: string
  identity: CatalogIdentity
  path: string
  fetchImpl: typeof fetch
  store?: CatalogTextStore
  expectedSha256?: string
  errorLabel: string
}

export async function readCatalogText(options: ReadCatalogTextOptions): Promise<string> {
  const { identity, path, expectedSha256 } = options
  const key = `${options.cacheNamespace}:${identity.schemaVersion}:${identity.texliveYear}:${identity.mirrorRevision}:${path}`
  const cached = await options.store?.get(key).catch(() => null)
  if (cached && (!expectedSha256 || (await sha256(cached)) === expectedSha256)) return cached
  const response = await options.fetchImpl(`${options.baseUrl}/${path}`)
  if (!response.ok) {
    throw new Error(`${options.errorLabel} fetch failed (${response.status}) for ${path}`)
  }
  const text = await response.text()
  if (expectedSha256 && (await sha256(text)) !== expectedSha256) {
    throw new Error(`${path} failed SHA-256 verification`)
  }
  await options.store?.set(key, text).catch(() => {})
  return text
}
