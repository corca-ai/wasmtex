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
