import { describe, expect, it } from 'vitest'
import { smokeCompile } from './__tests__/smoke-compile'

/**
 * #169 regression smoke: acmart (and any doc that sets up on-the-fly EPS→PDF conversion)
 * emits a load-time warning even when the document contains no EPS at all:
 *
 *   Package epstopdf Warning: Shell escape feature is not enabled.
 *
 * Shell escape is structurally unavailable in the WASM engine, so the warning is a
 * tautology carrying no actionable signal — a consumer that surfaces package warnings
 * reads it as a false "needs shell-escape". `parseTexErrors` drops it (see parse-errors.ts),
 * so it must NOT appear in the structured diagnostics, even though it stays in the raw log.
 *
 * Opt-in (needs network to the TeX Live CDN + `curl` + built engine assets in `public/`),
 * skipped in CI like the other Node-host smokes:
 *
 *   NODE_COMPILE_SMOKE=1 npx vitest run src/engine/epstopdf-warning-suppression.smoke.test.ts
 */
const RUN = process.env.NODE_COMPILE_SMOKE === '1'
const RAW_WARNING = /Package epstopdf Warning: Shell escape feature is not enabled/i

describe.runIf(RUN)('epstopdf shell-escape warning suppression (#169)', () => {
  it('compiles an EPS-free acmart doc with no false shell-escape diagnostic', async () => {
    const r = await smokeCompile({
      'main.tex': String.raw`\documentclass[sigconf,nonacm]{acmart}
\begin{document}
\title{T}\author{A}\maketitle
No EPS here at all. $E=mc^2$.
\end{document}
`,
    })
    expect(r.success).toBe(true)
    expect(r.pdfBytes).toBeGreaterThan(0)

    // The raw log still carries the warning (the filter is at the diagnostics layer, not
    // the engine) — asserting it here proves acmart really emits it, so the next assertion
    // is genuinely exercised rather than passing vacuously.
    expect(r.log).toMatch(RAW_WARNING)

    // …but the structured diagnostics a consumer reads must be free of it.
    const shellEscapeDiag = r.errors.filter(
      (e) => /epstopdf/i.test(e.message) && /shell escape/i.test(e.message),
    )
    expect(shellEscapeDiag).toEqual([])
  }, 240_000)
})
