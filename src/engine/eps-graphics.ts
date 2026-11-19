import type { CompileResult } from '../types'
import { normalizeProjectDependencyPath } from './dependency-manifest'
import type { TexEngine } from './engine-select'

export interface EpsConversionRequest {
  readonly path: string
  readonly bytes: Uint8Array
  readonly signal: AbortSignal
}

/** An optional host tool. Return one cropped PDF page or throw. No shell is involved. */
export type EpsConverter = (request: EpsConversionRequest) => Promise<Uint8Array>

interface EpsRequest {
  path: string
  output: string
}

/** Only act on driver diagnostics, never on a guessed macro, comment or file name. */
export function requestedEpsGraphics(log: string, engine: TexEngine): EpsRequest[] {
  const matches =
    engine === 'xelatex'
      ? log.matchAll(
          /^xdvipdfmx:warning: No image converter available for converting file "([^"\r\n]+)" to PDF format\./gm,
        )
      : log.matchAll(
          /^! Package (?:pdftex|luatex)\.def Error: File `([^']{1,2048})'\s+not\s+found:/gm,
        )
  const requests = new Map<string, string>()
  for (const match of matches) {
    const name = normalizeProjectDependencyPath(match[1]!.replaceAll(/\r?\n/g, ''))
    if (!name) continue
    if (engine === 'xelatex') {
      if (/\.eps$/i.test(name)) requests.set(name, name)
      continue
    }
    const suffix = /-(eps)-converted-to\.pdf$/i.exec(name)
    if (suffix) requests.set(`${name.slice(0, suffix.index)}.${suffix[1]}`, name)
  }
  return Array.from(requests, ([path, output]) => ({ path, output }))
}

/** XeTeX's graphics driver encodes file names as UTF-8 in quoted PSfile specials. */
export function xetexEpsSpecial(special: string): string | null {
  const filename = /^PSfile="([^"]{1,4096}\.eps)"(?:\s|$)/i.exec(special)?.[1]
  if (!filename) return null
  const decoded = /[^\u0020-\u007e]/.test(filename)
    ? new TextDecoder().decode(Uint8Array.from(filename, (char) => char.charCodeAt(0)))
    : filename
  return normalizeProjectDependencyPath(decoded)
}

export function epsSidecar(path: string): string {
  return path.replace(/\.(eps)$/i, '-$1-converted-to.pdf')
}

const PDF_HEADER = new TextEncoder().encode('%PDF-')

/** Bound the artifacts held in an engine filesystem. The host bounds converter execution. */
export const MAX_EPS_BYTES = 16 * 1024 * 1024
export const MAX_CONVERTED_EPS_BYTES = 32 * 1024 * 1024
export const MAX_EPS_GRAPHICS = 64

export function validConvertedEps(bytes: Uint8Array): boolean {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length <= PDF_HEADER.length ||
    bytes.length > MAX_CONVERTED_EPS_BYTES ||
    !PDF_HEADER.every((value, index) => bytes[index] === value)
  )
    return false
  return /%%EOF[\s\0]*$/.test(new TextDecoder().decode(bytes.subarray(-1024)))
}

export const EPS_CONVERSION_FAILED = 'eps-conversion-failed'

export function epsConversionFailure(
  result: CompileResult,
  path: string,
  reason: string,
): CompileResult {
  const message = `EPS conversion failed for ${path}: ${reason.slice(0, 500)}`
  return {
    ...result,
    success: false,
    pdf: null,
    synctex: null,
    synctexData: null,
    log: `${result.log}\n${message}`,
    errors: [
      ...result.errors,
      { code: EPS_CONVERSION_FAILED, line: 0, message, file: path, severity: 'error' },
    ],
  }
}
