import { describe, expect, it } from 'vitest'
import { chapterPreviewHook, firstChapterEntry, transcriptPages } from './tex-fmt-engine'

const written = (pages: number) => `Output written on main.pdf (${pages} pages, 1000 bytes).`

describe('chapter previews', () => {
  it('reads each file’s first physical page and the page numbers from a wrapped transcript', () => {
    const log = [
      '(./main.tex [1] [2]',
      '(./chapters/ch1.tex',
      '[1] [2]) [3]',
      // A 79-character line continues on the next one, as TeX wraps the transcript.
      `${'x'.repeat(78)}(`,
      './chapters/ch2.tex [4] [5]))',
      written(7),
    ].join('\n')
    const pages = transcriptPages(log, 'bytes')
    expect(pages?.starts.get('main.tex')).toBe(1)
    expect(pages?.starts.get('chapters/ch1.tex')).toBe(3)
    expect(pages?.starts.get('chapters/ch2.tex')).toBe(6)
    expect(pages?.numbers).toEqual([1, 2, 1, 2, 3, 4, 5])
  })

  it('distrusts a count the transcript contradicts and skips box excerpts', () => {
    const citation = '(./main.tex [1] [2] (./ch1.tex [3]) (./ch2.tex [4]))'
    // A numeric citation in text reads as a page; the written page count exposes it.
    expect(
      transcriptPages(`(./main.tex [1] as shown in [12], [2]\n${written(2)}`, 'bytes'),
    ).toBeNull()
    const excerpt = [
      '(./main.tex [1] (./ch1.tex',
      'Overfull \\hbox (2.5pt too wide) in paragraph at lines 3--4',
      '[]\\TU/lmr/m/n/10 as shown in [12], the',
      ' []',
      '[2]) (./ch2.tex [3]))',
      written(3),
    ].join('\n')
    expect(transcriptPages(excerpt, 'bytes')?.starts.get('ch2.tex')).toBe(3)
    expect(transcriptPages(`${citation}\n${written(4)}`, 'bytes')?.starts.get('ch2.tex')).toBe(4)
  })

  it('wraps XeTeX transcripts by characters and LuaTeX transcripts by bytes', () => {
    // 75 characters including two Hangul syllables: 79 bytes, but not a full XeTeX line.
    const hangul = `${'x'.repeat(73)}한글`
    const log = `(./main.tex\n${hangul}\n[1] [2])\n${written(2)}`
    expect(transcriptPages(log, 'characters')?.numbers).toEqual([1, 2])
    expect(transcriptPages(log, 'bytes')).toBeNull()
  })

  it('includes only the chapter, discards earlier and markless pages, and caps the rest', () => {
    const hook = chapterPreviewHook('chapters/ch12', '\\STOP', 3)
    expect(hook).not.toContain('\n')
    expect(hook.startsWith('\\includeonly{chapters/ch12}')).toBe(true)
    expect(hook).toContain('\\IfMarksEqualTF{2e-left}{top}{last}{\\DiscardShipoutBox}')
    expect(hook).toContain('\\ifnum\\wasmtexChapterKept<3 \\else\\STOP\\fi')
    expect(hook).toContain('\\AddToHook{include/after}{\\STOP}')
  })

  it('reads the first chapter entry of the contents from an aux file', () => {
    const aux =
      '\\relax\n\\@writefile{toc}{\\contentsline {chapter}{\\numberline {2}Two}{7}{chapter.2}}%\n'
    expect(firstChapterEntry(aux)).toBe(
      '\\@writefile{toc}{\\contentsline {chapter}{\\numberline {2}Two}{7}{chapter.2}}%',
    )
    expect(firstChapterEntry('\\relax')).toBeNull()
    expect(firstChapterEntry(null)).toBeNull()
  })
})
