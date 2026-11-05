import { describe, expect, it } from 'vitest'
import { secondaryAuxBases, secondaryIndexJobs, usesBibunits } from './secondary-stages'

describe('secondaryIndexJobs', () => {
  it('runs nomencl with its TeX Live style', () => {
    expect(secondaryIndexJobs('main', ['\\makenomenclature'], '')).toEqual([
      { input: 'main.nlo', output: 'main.nls', style: 'nomencl.ist', log: 'main.nlg' },
    ])
  })

  it('reads glossaries from the aux file with the style LaTeX wrote', () => {
    const aux =
      '\\@newglossary{main}{glg}{gls}{glo}\n\\@istfilename{main.ist}\n\\@glsorder{letter}\n'
    expect(secondaryIndexJobs('main', [], aux)).toEqual([
      {
        input: 'main.glo',
        output: 'main.gls',
        style: 'main.ist',
        log: 'main.glg',
        letterOrder: true,
      },
    ])
  })

  it('leaves xindy glossaries to their server stage', () => {
    const aux = '\\@newglossary{main}{glg}{gls}{glo}\n\\@istfilename{main.xdy}\n'
    expect(secondaryIndexJobs('main', [], aux)).toEqual([])
  })

  it('finds imakeidx, multind and index package indexes', () => {
    const source = [
      '\\makeindex[name=people,title=People,options=-s people.ist -l]',
      '\\makeindex[title=Main]',
      '\\makeindex[name=places,program=xindy]',
      '\\makeindex{authors}',
      '\\newindex{a}{adx}{and}{Authors}',
    ].join('\n')
    expect(secondaryIndexJobs('main', [source], '')).toEqual([
      { input: 'main.adx', output: 'main.and' },
      { input: 'people.idx', output: 'people.ind', style: 'people.ist', letterOrder: true },
      { input: 'authors.idx', output: 'authors.ind' },
    ])
  })

  it('ignores a commented directive', () => {
    expect(secondaryIndexJobs('main', ['% \\makenomenclature'], '')).toEqual([])
  })
})

describe('secondary bibliographies', () => {
  it('names multibib lists and chapterbib chapters', () => {
    expect(secondaryAuxBases(['\\newcites{sec, web}{A,B}'], '')).toEqual(['sec', 'web'])
    const source = '\\usepackage{chapterbib}'
    expect(secondaryAuxBases([source], '\\@input{ch1.aux}\n\\@input{ch2.aux}\n')).toEqual([
      'ch1',
      'ch2',
    ])
  })

  it('reads an included chapter into the main bibliography without chapterbib', () => {
    expect(secondaryAuxBases([''], '\\@input{ch1.aux}\n')).toEqual([])
  })

  it('recognizes bibunits', () => {
    expect(usesBibunits(['\\begin{bibunit}[plain]'])).toBe(true)
    expect(usesBibunits(['% \\begin{bibunit}'])).toBe(false)
  })
})
