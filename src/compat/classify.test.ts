import { describe, expect, it } from 'vitest'
import { classifyCompile, FAILURE_CLASS_ORDER } from './classify'

/** Build a failed-compile input from a log snippet. */
function failed(log: string) {
  return classifyCompile({ success: false, hasPdf: false, log })
}

describe('classifyCompile', () => {
  it('reports ok for a successful compile with a PDF', () => {
    const r = classifyCompile({ success: true, hasPdf: true, log: 'Output written on main.pdf' })
    expect(r.class).toBe('ok')
    expect(r.signals).toContain('ok')
  })

  it('treats runner timeout signal as highest precedence', () => {
    const r = classifyCompile({
      success: false,
      hasPdf: false,
      log: "! LaTeX Error: File `array.sty' not found.",
      timedOut: true,
    })
    expect(r.class).toBe('compile-timeout')
  })

  it('detects engine crash when there is no log and no pdf', () => {
    const r = classifyCompile({ success: false, hasPdf: false, log: '   \n  ' })
    expect(r.class).toBe('engine-crash')
  })

  it('classifies "Could not open" paths that contain a dot by their real extension', () => {
    // The capture must span dotted path segments, not stop at the first dot — otherwise the
    // wrong extension is read and the failure is misrouted (or not matched at all).
    expect(failed("! Could not open file `foo.bar/pkg.sty'").class).toBe('missing-package')
    expect(failed("! Could not open file `assets/fig.v2/diagram.svg'").class).toBe('image-format')
  })

  it('detects fontspec → needs XeLaTeX/LuaLaTeX', () => {
    const log = [
      '! Fatal Package fontspec Error: The fontspec package requires either XeTeX or',
      '(fontspec)                        LuaTeX.',
    ].join('\n')
    const r = failed(log)
    expect(r.class).toBe('needs-xelatex-lualatex')
    expect(r.evidence.join(' ')).toMatch(/XeTeX|LuaTeX/)
  })

  it('detects xeCJK (CJK) → needs XeLaTeX/LuaLaTeX', () => {
    const r = failed('! Package xeCJK Error: xeCJK requires XeTeX or LuaLaTeX to run.')
    expect(r.class).toBe('needs-xelatex-lualatex')
  })

  it('detects biblatex/biber', () => {
    const log = 'Package biblatex Warning: Please (re)run Biber on the file:\n(biblatex) main'
    const r = failed(log)
    expect(r.class).toBe('needs-biber')
  })

  it('elevates a "successful" compile to needs-biber when Biber is still required', () => {
    // pdfTeX exits 0 and emits a PDF, but the bibliography is unresolved.
    const log = 'Package biblatex Warning: Please (re)run Biber on the file: main.bcf'
    const r = classifyCompile({ success: true, hasPdf: true, log })
    expect(r.class).toBe('needs-biber')
    expect(r.signals).toContain('ok')
  })

  it('elevates a "successful" compile to needs-shell-escape (degraded minted output)', () => {
    const log = 'runsystem(latexminted ...)...disabled (restricted).\nOutput written on main.pdf'
    const r = classifyCompile({ success: true, hasPdf: true, log })
    expect(r.class).toBe('needs-shell-escape')
    expect(r.signals).toContain('ok')
  })

  it('does NOT elevate a successful compile for a merely-missing figure', () => {
    // A stray missing image is too noisy to treat as a failure when a PDF exists.
    const log = "Package pdftex.def Error: File `fig-eps-converted-to.pdf' not found"
    const r = classifyCompile({ success: true, hasPdf: true, log })
    expect(r.class).toBe('ok')
    expect(r.signals).toContain('missing-file')
  })

  it('detects minted / shell-escape', () => {
    const r = failed('! Package minted Error: You must invoke LaTeX with the -shell-escape flag.')
    expect(r.class).toBe('needs-shell-escape')
  })

  it('detects disabled runsystem as shell-escape', () => {
    const r = failed('runsystem(pygmentize ...)...disabled (restricted).')
    expect(r.class).toBe('needs-shell-escape')
  })

  it('detects EPS image-format failure', () => {
    const r = failed('! LaTeX Error: Unknown graphics extension: .eps.')
    expect(r.class).toBe('image-format')
    expect(r.evidence.join(' ')).toContain('.eps')
  })

  it('classifies a missing .sty as missing-package with the name', () => {
    const r = failed("! LaTeX Error: File `tikz-cd.sty' not found.")
    expect(r.class).toBe('missing-package')
    expect(r.missing).toContain('tikz-cd.sty')
  })

  it('does not double-count a file matched by both "not found" and "Could not open" forms', () => {
    const r = classifyCompile({
      success: false,
      hasPdf: false,
      log: "File `array.sty' not found.\nCould not open file `array.sty'",
    })
    expect(r.class).toBe('missing-package')
    expect(r.missing).toEqual(['array.sty'])
  })

  it('classifies a missing class file as missing-package', () => {
    const r = failed("! LaTeX Error: File `IEEEtran.cls' not found.")
    expect(r.class).toBe('missing-package')
    expect(r.missing).toContain('IEEEtran.cls')
  })

  it('classifies a missing TFM as missing-font', () => {
    const r = failed('! Font \\OT1/cmr/m/n/10=cmr10 not loadable: Metric (TFM) file not found.')
    expect(r.class).toBe('missing-font')
  })

  it('classifies a missing image as missing-file (not package)', () => {
    const r = failed("! LaTeX Error: File `figures/plot.png' not found.")
    expect(r.class).toBe('missing-file')
    expect(r.missing).toContain('figures/plot.png')
  })

  it('detects TeX capacity exceeded as memory-exhausted', () => {
    const r = failed('! TeX capacity exceeded, sorry [main memory size=5000000].')
    expect(r.class).toBe('memory-exhausted')
  })

  // `kpathsea: Running mktextfm <font>` + `fork(): Function not implemented` is BENIGN
  // noise, not a failure cause (repro #167): the real-kpse search misses MEMFS, then the
  // CDN fetch backstops the font, so it appears on every Computer-Modern/AMS document —
  // including fully successful compiles. It must never mask the real cause. (An earlier
  // fix mistook it for a root cause and misrouted these; see PR reverting #166.)
  const FORK_NOISE = 'kpathsea: Running mktextfm cmr8\nkpathsea: fork(): Function not implemented\n'

  it('ignores benign mktextfm/fork noise — a missing package still wins', () => {
    const r = failed(`${FORK_NOISE}! LaTeX Error: File \`tikz-cd.sty' not found.`)
    expect(r.class).toBe('missing-package')
  })

  it('ignores benign mktextfm/fork noise — a genuine memory-exhausted still wins', () => {
    const r = failed(`${FORK_NOISE}! TeX capacity exceeded, sorry [main memory size=5000000].`)
    expect(r.class).toBe('memory-exhausted')
  })

  it('ignores benign mktextfm/fork noise — an undefined control sequence still wins', () => {
    const r = failed(`${FORK_NOISE}! Undefined control sequence.\nl.5 \\foo`)
    expect(r.class).toBe('undefined-control-sequence')
  })

  it('detects WASM OOM as memory-exhausted', () => {
    const r = failed('RangeError: WebAssembly.Memory(): could not allocate memory')
    expect(r.class).toBe('memory-exhausted')
  })

  it('falls back to undefined-control-sequence', () => {
    const r = failed('! Undefined control sequence.\nl.42 \\foobar')
    expect(r.class).toBe('undefined-control-sequence')
  })

  it('falls back to a generic tex-error for unrecognized ! lines', () => {
    const r = failed('! Misplaced alignment tab character &.\nl.10 a & b')
    expect(r.class).toBe('tex-error')
  })

  it('returns unknown when nothing matches and no pdf', () => {
    const r = failed('just some noise without a bang-error')
    expect(r.class).toBe('unknown')
  })

  it('prefers the more specific cause but keeps all signals', () => {
    // fontspec error AND a downstream undefined control sequence.
    const log = [
      '! Fatal Package fontspec Error: The fontspec package requires either XeTeX or LuaTeX.',
      '! Undefined control sequence.',
    ].join('\n')
    const r = failed(log)
    expect(r.class).toBe('needs-xelatex-lualatex')
    expect(r.signals).toContain('undefined-control-sequence')
  })

  it('every class has a stable order entry', () => {
    const r = classifyCompile({ success: true, hasPdf: true, log: '' })
    expect(FAILURE_CLASS_ORDER).toContain(r.class)
    // No duplicates in the order list.
    expect(new Set(FAILURE_CLASS_ORDER).size).toBe(FAILURE_CLASS_ORDER.length)
  })
})
