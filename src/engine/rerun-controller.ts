import { simpleHash } from './preamble-utils'

/** Whether the compile log asks for another LaTeX pass (cross-refs / bib). */
export function needsRerun(log: string): boolean {
  return (
    log.includes('Rerun to get cross-references right') ||
    log.includes('Rerun to get citations correct') ||
    log.includes('Rerun LaTeX') ||
    log.includes('Label(s) may have changed. Rerun') ||
    log.includes('Please (re)run Biber') ||
    log.includes('Please (re)run BibTeX')
  )
}

export interface RerunDecision {
  rerun: boolean
  /** When we decline to rerun despite the log asking: why we stopped. */
  stopped?: 'limit' | 'no-progress'
}

/**
 * Decides whether to auto-rerun the LaTeX compile to resolve cross-references,
 * and — crucially — guarantees termination. It caps the number of reruns and
 * detects non-convergence: if the cross-reference state (a hash of the `.aux` /
 * semantic trace) stops changing while the log still asks for a rerun, the
 * document is oscillating or stuck, so we stop instead of thrashing.
 */
export class RerunController {
  private count = 0
  private lastSignature: string | null = null

  constructor(private maxReruns = 5) {}

  /** Reset between user edits (a fresh document state). */
  reset(): void {
    this.count = 0
    this.lastSignature = null
  }

  /**
   * @param log        the compile log for the just-finished pass
   * @param signature  a hash of the cross-reference state (aux / trace); use
   *                   {@link signatureOf} if you only have the raw content
   */
  decide(log: string, signature: string): RerunDecision {
    if (!needsRerun(log)) {
      // Converged: clear the no-progress baseline. The signature of a pass that did NOT
      // ask for a rerun must not seed it, or a later genuine rerun whose signature happens
      // to match this converged one would be wrongly declined as "no-progress".
      this.count = 0
      this.lastSignature = null
      return { rerun: false }
    }
    if (this.count >= this.maxReruns) return { rerun: false, stopped: 'limit' }
    if (this.lastSignature !== null && signature === this.lastSignature) {
      return { rerun: false, stopped: 'no-progress' }
    }
    this.count++
    this.lastSignature = signature
    return { rerun: true }
  }
}

/** Hash the cross-reference content (semantic trace or `.aux`) into a signature. */
export function signatureOf(content: string | undefined): string {
  return simpleHash(content ?? '')
}
