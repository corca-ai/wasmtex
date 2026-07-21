import { describe, expect, it } from 'vitest'
import { smokeCompile } from './__tests__/smoke-compile'

/**
 * #167 regression smoke: the kpse hook forces `must_exist=0` on the local search so
 * kpathsea never attempts its mktextfm/mktexpk generators, which fork()/exec (ENOSYS in
 * WASM) and emit benign-but-misleading noise:
 *
 *   kpathsea: Running mktextfm <font>
 *   fork(): Function not implemented
 *
 * Opt-in (needs network to the TeX Live CDN + `curl` + built engine assets in `public/`),
 * skipped in CI like the other Node-host smokes:
 *
 *   NODE_COMPILE_SMOKE=1 npx vitest run src/engine/mktex-suppression.smoke.test.ts
 */
const RUN = process.env.NODE_COMPILE_SMOKE === '1'
const FORK_NOISE = /Running mkte?xt(?:fm|pk)|fork\(\): Function not implemented/i

describe.runIf(RUN)('mktex suppression (#167)', () => {
  it('compiles a Computer-Modern/AMS document with no mktextfm/fork noise', async () => {
    // amsart pulls cmr/cmmi/cmsy/msam/msbm by TFM — previously each emitted the fork
    // noise. The fonts still load via the CDN fallback, so the compile must still succeed.
    const r = await smokeCompile({
      'main.tex': String.raw`\documentclass{amsart}
\usepackage{amssymb}
\begin{document}
\title{c}\author{a}\maketitle
Sub $a_{\mathbb{Z}}$, $\mathbb{R}$, amssymb $x\leqslant y\varnothing$.
\end{document}
`,
    })
    expect(r.success).toBe(true)
    expect(r.pdfBytes).toBeGreaterThan(0)
    expect(r.log).not.toMatch(FORK_NOISE)
  }, 240_000)

  it('surfaces a genuinely unavailable font cleanly (still no fork noise)', async () => {
    // A font that is on no mirror: kpathsea must not fork to "make" it; pdfTeX reports a
    // clean "Metric (TFM) file not found" and recovers (nullfont), still emitting a PDF.
    const r = await smokeCompile({
      'main.tex': String.raw`\documentclass{article}
\begin{document}
\font\zz=zzdefinitelynotarealfont7\relax
{\zz Missing-font text.}
\end{document}
`,
    })
    expect(r.log).toMatch(/Metric \(TFM\) file not found/i)
    expect(r.log).not.toMatch(FORK_NOISE)
  }, 240_000)
})
