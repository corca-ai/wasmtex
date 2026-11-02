import { describe, expect, it } from 'vitest'
import { collectBibliographyInputs, flattenAuxInputs } from './bibliography-inputs'

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

  it('inlines nested chapter aux files in order and drops missing ones', async () => {
    const files: Record<string, string> = {
      'main.aux': '\\@input{ch1.aux}\n\\@input{gone.aux}\n\\bibdata{refs}\n',
      'ch1.aux': '\\citation{a}\n\\@input{./parts/p.aux}\n',
      'parts/p.aux': '\\citation{b}\n',
    }
    const flattened = await flattenAuxInputs('main.aux', async (path) => files[path] ?? null)
    expect(flattened).toBe('\\citation{a}\n\\citation{b}\n\n\n\n\\bibdata{refs}\n')
    expect(await flattenAuxInputs('missing.aux', async () => null)).toBeNull()
  })

  it('reads each aux file once and ignores unsafe or repeated inputs', async () => {
    const reads: string[] = []
    const files: Record<string, string> = {
      'main.aux': '\\@input{main.aux}\n\\@input{main.aux}\n\\@input{../up.aux}\n\\citation{x}\n',
    }
    const flattened = await flattenAuxInputs('main.aux', async (path) => {
      reads.push(path)
      return files[path] ?? null
    })
    expect(reads).toEqual(['main.aux'])
    expect(flattened).toBe('\n\n\n\\citation{x}\n')
  })
})
