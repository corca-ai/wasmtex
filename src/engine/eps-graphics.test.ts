import { describe, expect, it } from 'vitest'
import { requestedEpsGraphics, validConvertedEps, xetexEpsSpecial } from './eps-graphics'

describe('EPS graphics requests', () => {
  it('uses the driver-resolved companion, even across a wrapped TeX log line', () => {
    const log = [
      '! Package pdftex.def Error: File `figures/plot-eps-conver',
      "ted-to.pdf' not found: using draft setting.",
      "! Package pdftex.def Error: File `../outside-eps-converted-to.pdf' not found:",
      "! Package pdftex.def Error: File `figures/no.png' not found:",
    ].join('\n')
    expect(requestedEpsGraphics(log, 'pdflatex')).toEqual([
      { path: 'figures/plot.eps', output: 'figures/plot-eps-converted-to.pdf' },
    ])
  })

  it('does not treat optional TeX file probes as requests', () => {
    expect(
      requestedEpsGraphics(
        'Package epstopdf Warning: Shell escape feature is not enabled.',
        'lualatex',
      ),
    ).toEqual([])
  })

  it('uses the converter-resolved name only inside the project', () => {
    const diagnostic = (path: string) =>
      `xdvipdfmx:warning: No image converter available for converting file "${path}" to PDF format.`
    expect(requestedEpsGraphics(diagnostic('/work/assets/a.eps'), 'xelatex')).toEqual([
      { path: 'assets/a.eps', output: 'assets/a.eps' },
    ])
    expect(requestedEpsGraphics(diagnostic('/tex/a.eps'), 'xelatex')).toEqual([])
  })

  it('reads XeTeX quoted specials and rejects unrelated or escaping paths', () => {
    const utf8 = new TextEncoder().encode('PSfile="./figures/그림.eps" rwi=10')
    expect(xetexEpsSpecial(String.fromCharCode(...utf8))).toBe('figures/그림.eps')
    expect(xetexEpsSpecial('PSfile="../a.eps"')).toBeNull()
    expect(xetexEpsSpecial('pdf:image "a.pdf"')).toBeNull()
  })

  it('rejects blank and non-PDF backend responses', () => {
    expect(validConvertedEps(new Uint8Array())).toBe(false)
    expect(validConvertedEps(new TextEncoder().encode('%!PS'))).toBe(false)
    expect(validConvertedEps(new TextEncoder().encode('%PDF-1.7'))).toBe(false)
    expect(validConvertedEps(new TextEncoder().encode('%PDF-1.7\n%%EOF\n'))).toBe(true)
  })
})
