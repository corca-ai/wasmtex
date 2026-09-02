import { describe, expect, it } from 'vitest'
import {
  detectDocumentLanguage,
  documentClassOf,
  hasDocumentMetadata,
  injectDocumentMetadata,
  inspectPdfTagging,
  kernelLacksTagging,
} from './accessible-export'

describe('document inspection', () => {
  it('reads the document class', () => {
    expect(documentClassOf('\\documentclass[11pt]{article}')).toBe('article')
    expect(documentClassOf('% \\documentclass{book}\n\\documentclass{ scrartcl }')).toBe('scrartcl')
    expect(documentClassOf('no class')).toBeNull()
  })

  it('detects the document language from the usual declarations', () => {
    expect(detectDocumentLanguage('\\usepackage[english]{babel}')).toBe('en-US')
    expect(detectDocumentLanguage('\\usepackage[french,ngerman]{babel}')).toBe('de-DE')
    expect(detectDocumentLanguage('\\usepackage[main=french,english]{babel}')).toBe('fr-FR')
    expect(detectDocumentLanguage('\\setmainlanguage{korean}')).toBe('ko-KR')
    expect(detectDocumentLanguage('\\usepackage{kotex}')).toBe('ko-KR')
    expect(detectDocumentLanguage('\\hypersetup{pdflang={pt-BR}}')).toBe('pt-BR')
    expect(detectDocumentLanguage('\\DocumentMetadata{lang=ja-JP,tagging=on}')).toBe('ja-JP')
    expect(detectDocumentLanguage('\\documentclass{article}')).toBeNull()
    expect(detectDocumentLanguage('% \\usepackage[german]{babel}')).toBeNull()
  })
})

describe('injectDocumentMetadata', () => {
  const doc =
    '\\documentclass{article}\n\\usepackage[british]{babel}\n\\begin{document}x\\end{document}\n'

  it('prepends the declaration on the first line with the detected language', () => {
    const out = injectDocumentMetadata(doc)
    expect(out.injected).toBe(true)
    expect(out.lang).toBe('en-GB')
    expect(out.source.split('\n').length).toBe(doc.split('\n').length)
    expect(
      out.source.startsWith(
        '\\DocumentMetadata{lang=en-GB, pdfversion=2.0, pdfstandard=ua-2, tagging=on}\\documentclass',
      ),
    ).toBe(true)
  })

  it('honours explicit options and UA-1', () => {
    const out = injectDocumentMetadata(doc, { lang: 'de-DE', standard: 'ua-1' })
    expect(out.source).toContain('lang=de-DE, pdfversion=1.7, pdfstandard=ua-1, tagging=on')
  })

  it('leaves a document with its own metadata untouched', () => {
    const own = `\\DocumentMetadata{lang=fr-FR}${doc}`
    expect(hasDocumentMetadata(own)).toBe(true)
    const out = injectDocumentMetadata(own)
    expect(out.injected).toBe(false)
    expect(out.source).toBe(own)
    expect(out.lang).toBe('fr-FR')
  })

  it('recognises the old-kernel error', () => {
    expect(
      kernelLacksTagging(
        "! LaTeX Error: The key 'document/metadata/tagging' is unknown and is being ignored.",
      ),
    ).toBe(true)
    expect(kernelLacksTagging('all fine')).toBe(false)
  })
})

describe('inspectPdfTagging', () => {
  const pdf = (body: string) => new TextEncoder().encode(`%PDF-2.0\n${body}\n%%EOF`)

  it('reads structure, language, UA part, figures and headings from an uncompressed PDF', async () => {
    const report = await inspectPdfTagging(
      pdf(
        [
          '1 0 obj << /Type /Catalog /Lang (en-GB) /MarkInfo << /Marked true >> /StructTreeRoot 2 0 R >> endobj',
          '3 0 obj << /Type /StructElem /S /H1 /P 2 0 R >> endobj',
          '4 0 obj << /Type /StructElem /S /Figure /Alt (A cat) /P 2 0 R >> endobj',
          '5 0 obj << /Type /StructElem /S /Figure /P 2 0 R >> endobj',
          // tagpdf's placeholder for a missing alt= is the file name (UTF-16BE hex): not an alternative.
          '8 0 obj << /Type /StructElem /Alt <FEFF0069006D0067002E0070006E0067> /S /Figure /P 2 0 R >> endobj',
          '9 0 obj << /Type /StructElem /Alt <FEFF00410020006300610074> /S /Figure /P 2 0 R >> endobj',
          '6 0 obj << /Type /StructElem /S /Table /P 2 0 R >> endobj',
          '7 0 obj << /Title (Tagged test) >> endobj',
          '<rdf:Description pdfuaid:part="2"/>',
        ].join('\n'),
      ),
    )
    expect(report).toEqual({
      tagged: true,
      lang: 'en-GB',
      uaPart: 2,
      figures: 4,
      figuresWithAlt: 2,
      headings: 1,
      tables: 1,
      title: 'Tagged test',
    })
  })

  it('reports an untagged PDF', async () => {
    const report = await inspectPdfTagging(pdf('1 0 obj << /Type /Catalog >> endobj'))
    expect(report.tagged).toBe(false)
    expect(report.lang).toBeNull()
    expect(report.uaPart).toBeNull()
  })

  it('looks inside deflated object streams', async () => {
    const inner = new TextEncoder().encode(
      '<< /Type /Catalog /MarkInfo << /Marked true >> /StructTreeRoot 2 0 R /Lang (ko-KR) >>',
    )
    const deflated = new Uint8Array(
      await new Response(
        new Blob([inner]).stream().pipeThrough(new CompressionStream('deflate')),
      ).arrayBuffer(),
    )
    const head = new TextEncoder().encode(
      '%PDF-2.0\n9 0 obj << /Type /ObjStm /Filter /FlateDecode >>\nstream\n',
    )
    const tail = new TextEncoder().encode('\nendstream\nendobj\n%%EOF')
    const bytes = new Uint8Array(head.length + deflated.length + tail.length)
    bytes.set(head)
    bytes.set(deflated, head.length)
    bytes.set(tail, head.length + deflated.length)
    const report = await inspectPdfTagging(bytes)
    expect(report.tagged).toBe(true)
    expect(report.lang).toBe('ko-KR')
  })
})
