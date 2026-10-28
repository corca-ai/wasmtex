import type { TexError } from '../types'

/** A disposable prefix may retain errors already visible in its complete PDF.
 * Positive source locations remain exact; line-zero file context is unverified.
 * New kinds, locations or additional occurrences still require a full compile.
 */
export function previewErrorsCovered(
  baseline: readonly TexError[],
  preview: readonly TexError[],
): boolean {
  const counts = new Map<string, number>()
  const key = (error: TexError) =>
    JSON.stringify([error.message, error.line > 0 ? (error.file ?? null) : null, error.line])
  for (const error of baseline) {
    if (error.severity !== 'error') continue
    const id = key(error)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  for (const error of preview) {
    if (error.severity !== 'error') continue
    const id = key(error)
    const remaining = counts.get(id) ?? 0
    if (!remaining) return false
    counts.set(id, remaining - 1)
  }
  return true
}
