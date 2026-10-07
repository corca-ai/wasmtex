import type { TexliveVersion } from '../types'

export type EngineBinary =
  | 'pdftex'
  | 'bibtex'
  | 'bibtex8'
  | 'makeindex'
  | 'xetex'
  | 'dvipdfm'
  | 'luatex'

function assetStem(baseUrl: string, version: TexliveVersion, binary: EngineBinary): string {
  return `${baseUrl}wasmtex/${version}/wasmtex-${binary}`
}

export function engineWorkerUrl(
  baseUrl: string,
  version: TexliveVersion,
  binary: EngineBinary,
): string {
  return `${assetStem(baseUrl, version, binary)}.worker.js`
}

export function engineFormatUrl(
  baseUrl: string,
  version: TexliveVersion,
  binary: 'pdftex' | 'xetex' | 'luatex',
): string {
  return `${assetStem(baseUrl, version, binary)}.fmt`
}

/** Formats can retain their published source while a compatible engine is upgraded. */
export function formatAssetBase(baseUrl: string, override?: string): string {
  if (override === undefined) return baseUrl
  return override.endsWith('/') ? override : `${override}/`
}

/** Absolute, normalized identity where the host provides a base for relative URLs. */
export function normalizedFormatUrl(url: string, override?: string): string | undefined {
  if (override === undefined) return undefined
  try {
    return new URL(url, globalThis.document?.baseURI ?? globalThis.location?.href).href
  } catch {
    return url
  }
}
