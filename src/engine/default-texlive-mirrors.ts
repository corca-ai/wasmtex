import type { TexliveVersion } from '../types'

/**
 * Immutable R2 snapshots used when an integrator does not provide a mirror.
 * Keep 2025 byte-compatible with the former default; 2026 follows the current
 * qualified latest snapshot until that year is frozen at tlnet-final.
 */
const DEFAULT_TEXLIVE_URLS = {
  '2025': 'https://texlive.corca.ai/snapshots/2025-92e10d3241a312f0/2025/',
  '2026': 'https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/',
} as const satisfies Record<TexliveVersion, string>

export function defaultTexliveUrl(version: TexliveVersion): string {
  return DEFAULT_TEXLIVE_URLS[version]
}
