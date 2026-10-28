import { describe, expect, it } from 'vitest'
import { collectBibliographyInputs } from './bibliography-inputs'

describe('bibliography engine inputs', () => {
  it('preserves host databases and empty generated notes, reading each safe path once', async () => {
    const reads: string[] = []
    const result = await collectBibliographyInputs(
      '\\bibdata{refs,notes,./notes.bib,missing,../outside,/tex/system}\n\\bibdata{/work/control}',
      { 'refs.bib': 'host references' },
      async (path) => {
        reads.push(path)
        return path === 'notes.bib' ? '' : path === 'control.bib' ? 'control record' : null
      },
    )
    expect(reads).toEqual(['notes.bib', 'missing.bib', 'control.bib'])
    expect(result).toEqual({
      bibFiles: { 'refs.bib': 'host references', 'notes.bib': '', 'control.bib': 'control record' },
      hasGenerated: true,
    })
  })

  it('preserves non-UTF-8 project database bytes over generated files', async () => {
    const latin1 = new Uint8Array([0x40, 0x62, 0x6f, 0x6f, 0x6b, 0x7b, 0xe9, 0x7d])
    const reads: string[] = []
    const result = await collectBibliographyInputs(
      '\\bibdata{refs,notes}',
      { 'refs.bib': latin1 },
      async (path) => {
        reads.push(path)
        return 'generated notes'
      },
    )
    expect(result.bibFiles['refs.bib']).toBe(latin1)
    expect([...result.bibFiles['refs.bib']!]).toEqual([...latin1])
    expect(result.bibFiles['notes.bib']).toBe('generated notes')
    expect(reads).toEqual(['notes.bib'])
  })

  it('does not mark missing databases as generated inputs', async () => {
    expect(await collectBibliographyInputs('\\bibdata{missing}', {}, async () => null)).toEqual({
      bibFiles: {},
      hasGenerated: false,
    })
  })
})
