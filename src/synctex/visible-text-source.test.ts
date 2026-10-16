import { describe, expect, it } from 'vitest'
import { LatexSyntaxService } from '../syntax'
import { projectVisibleTextSource } from './visible-text-source'

function project(content: string, budget?: number) {
  const syntax = new LatexSyntaxService().upsert({
    fileId: 'stable',
    path: 'chapters/main.tex',
    content,
    documentVersion: 7,
  })
  return projectVisibleTextSource(content, syntax, budget)
}

describe('source-preserving visible text projection', () => {
  it('retains title arguments and common styles instead of stripping them', () => {
    const source = String.raw`\title{An \emph{Introduction}}
\author{Ada Lovelace}
\date{October 2026}`
    const result = project(source)
    expect(result.blocks.map(({ text }) => text)).toEqual([
      'an introduction',
      'ada lovelace',
      'october 2026',
    ])
    const title = result.blocks[0]!
    const index = title.text.indexOf('introduction')
    expect(source.slice(title.starts[index], title.ends[index + 11])).toBe('Introduction')
    expect(result).toMatchObject({
      fileId: 'stable',
      file: 'chapters/main.tex',
      documentVersion: 7,
      truncated: false,
    })
  })

  it('keeps wrapped prose continuous across known formatting groups', () => {
    const source = 'Visible \\textbf{styled words}\ncontinue here.'
    const result = project(source)
    expect(result.blocks.map(({ text }) => text)).toEqual(['visible styled words continue here.'])
    const block = result.blocks[0]!
    const offset = block.text.indexOf('continue')
    expect(source.slice(block.starts[offset], block.ends[offset + 7])).toBe('continue')
  })

  it('uses full heading/caption arguments and isolates footnote text', () => {
    const source = String.raw`\section[Short]{A \emph{heading}}
Body text with \footnote{A useful note.} continuation.
\caption[Brief]{A useful caption.}`
    const result = project(source)
    expect(result.blocks.some(({ text }) => /short|brief/.test(text))).toBe(false)
    expect(result.blocks).toContainEqual(
      expect.objectContaining({ kind: 'heading', text: 'a heading' }),
    )
    expect(result.blocks).toContainEqual(
      expect.objectContaining({ kind: 'footnote', text: 'a useful note.' }),
    )
    expect(result.blocks).toContainEqual(
      expect.objectContaining({ kind: 'caption', text: 'a useful caption.' }),
    )
    expect(
      result.blocks
        .filter(({ kind }) => kind === 'paragraph')
        .map(({ text }) => text)
        .join(' '),
    ).not.toContain('note')
  })

  it('does not invent text from math, verbatim, comments or unknown grammars', () => {
    const source = String.raw`Visible $secret$ tail.

\unknown{hidden} unproven trailing text.

After \verb|raw contents| safe.
% comment words`
    const text = project(source)
      .blocks.map(({ text }) => text)
      .join('|')
    expect(text).toContain('visible')
    expect(text).toContain('tail.')
    for (const hidden of ['secret', 'hidden', 'unproven', 'raw contents', 'comment words'])
      expect(text).not.toContain(hidden)
  })

  it('resumes prose after known references without treating keys as rendered text', () => {
    const result = project(String.raw`Before \cite[see]{secret-key} after citation.

\begin{document}
Paragraph \label{hidden-label} after label.
\end{document}`)
    const text = result.blocks.map(({ text }) => text).join('|')
    expect(text).toContain('after citation.')
    expect(text).toContain('after label.')
    expect(text).not.toContain('secret-key')
    expect(text).not.toContain('hidden-label')
    expect(text).not.toContain('document')
  })

  it('refuses generated definitions and redefined known styles', () => {
    const result = project(String.raw`\renewcommand{\emph}[1]{generated #1}
Visible \emph{hidden} trailing.`)
    expect(result.blocks.map(({ text }) => text)).toEqual(['visible'])
  })

  it('refuses redefined text symbols before interpreting their conventional spelling', () => {
    const result = project(String.raw`\renewcommand{\ae}{generated}
Visible \ae hidden trailing.`)
    expect(result.blocks.map(({ text }) => text)).toEqual(['visible'])
  })

  it('does not bridge an opaque nested group into apparently continuous prose', () => {
    const result = project(String.raw`Text \emph{A \unknown{hidden} rest} tail.`)
    expect(result.blocks.map(({ text }) => text)).toEqual(['text a', 'tail.'])
  })

  it('preserves UTF-16 ranges through escaped symbols, ligatures and Korean', () => {
    const source = String.raw`\title{ﬃ \& 한글 대수}`
    const block = project(source).blocks[0]!
    expect(block.text).toBe('ffi & 한글 대수')
    const symbol = block.text.indexOf('&')
    expect(source.slice(block.starts[symbol], block.ends[symbol])).toBe('\\&')
    expect([...block.starts.slice(0, 3)]).toEqual([7, 7, 7])
    const korean = block.text.indexOf('한글')
    expect(source.slice(block.starts[korean], block.ends[korean + 1])).toBe('한글')
  })

  it('publishes no partial source projection when its source budget is exceeded', () => {
    expect(project('A document beyond the chosen budget.', 8)).toMatchObject({
      blocks: [],
      truncated: true,
    })
  })
})

it('keeps metadata-looking commands inside definitions and opaque invocations hidden', () => {
  const result = project(String.raw`\newcommand{\foo}{\title{Generated title}}
\unknown{\title{Hidden title}}
Visible final paragraph.`)
  const text = result.blocks.map(({ text }) => text).join('|')
  expect(text).not.toContain('generated title')
  expect(text).not.toContain('hidden title')
})

it('maps conventional TeX punctuation and multiple authors to real source slices', () => {
  const content = "\\author{Ada \\and Emmy}\n\\title{``Linear''---a study}"
  const result = project(content)
  expect(result.blocks.map(({ text }) => text)).toEqual(['ada emmy', '“linear”—a study'])
  const title = result.blocks[1]!
  const dash = title.text.indexOf('—')
  expect(content.slice(title.starts[dash], title.ends[dash])).toBe('---')
})

it('refuses special fields consumed as optional or unbraced opaque arguments', () => {
  for (const content of [
    String.raw`\newcommand{\discard}[2]{}\discard\title{Fake title}`,
    String.raw`\newcommand{\discard}[2][]{}\discard[\title{Fake title}]{x}`,
    String.raw`\newcommand{\discard}[2]{}\discard\section{Fake heading}`,
  ])
    expect(project(content).blocks).toEqual([])
})

it('preserves author acknowledgments as separate footnote ranges', () => {
  const content = String.raw`\author{Ada\thanks{Supported by \emph{Grant Alpha}}}`
  const blocks = project(content).blocks
  expect(blocks.map(({ kind, text }) => [kind, text])).toEqual([
    ['metadata', 'ada'],
    ['footnote', 'supported by grant alpha'],
  ])
  const note = blocks[1]!
  const offset = note.text.indexOf('grant')
  expect(content.slice(note.starts[offset], note.ends[offset + 10])).toBe('Grant Alpha')
})

it('consumes line-break star/spacing and control-word delimiter whitespace', () => {
  const content = String.raw`\title{A\\*[2ex]Long title}
\author{A\bfseries BCD and \ae ther theory}`
  expect(project(content).blocks.map(({ text }) => text)).toEqual([
    'a long title',
    'abcd and æther theory',
  ])
})

it('refuses mixed braced and unbraced opaque arguments without hiding ordinary declarations', () => {
  for (const command of ['title', 'section']) {
    const content = String.raw`\newcommand{\discard}[3]{}\discard{x}` + `\\${command}{Fake field}`
    expect(project(content).blocks).toEqual([])
    expect(project(String.raw`\unknown{x}` + `\\${command}{Fake field}`).blocks).toEqual([])
  }
  expect(
    project(String.raw`\documentclass{article}
\newcommand{\custom}{generated}
\title{Real title}`).blocks.map(({ text }) => text),
  ).toEqual(['real title'])
})

it('retains literal stars and brackets following ordinary spacing commands', () => {
  for (const command of ['space', 'quad', ',']) {
    const content = `\\title{A\\${command}*B [2ex]}`
    expect(project(content).blocks.map(({ text }) => text)).toEqual(['a *b [2ex]'])
  }
})

it('consumes grammar-permitted spaces before linebreak stars and optional spacing', () => {
  for (const command of [
    String.raw`\\ [2ex]`,
    String.raw`\\* [2ex]`,
    String.raw`\\ * [2ex]`,
    String.raw`\linebreak [4]`,
  ]) {
    const content = `\\title{Alpha${command}Beta}`
    const block = project(content).blocks[0]!
    expect(block.text).toBe('alpha beta')
    const offset = block.text.indexOf('beta')
    expect(content.slice(block.starts[offset], block.ends[offset + 3])).toBe('Beta')
  }
})

it('retains headings and prose after standard title/page output commands', () => {
  const content = String.raw`\documentclass{article}
\title{Document title}
\begin{document}
\maketitle
\section{A \emph{structured} introduction}
The first visible paragraph.

\newpage
\section{A separate page}
A second visible paragraph.
\end{document}`
  const blocks = project(content).blocks
  expect(blocks.filter(({ kind }) => kind === 'heading').map(({ text }) => text)).toEqual([
    'a structured introduction',
    'a separate page',
  ])
  expect(blocks.map(({ text }) => text).join('|')).toContain('the first visible paragraph.')
})

it('confines opaque drawing commands to their environment before a float caption', () => {
  const content = String.raw`\begin{document}
\begin{figure}
\begin{tikzpicture}
\draw[->] (0,0) -- (2,0);
\end{tikzpicture}
\caption{A \textbf{distinct} caption.}
\end{figure}
\end{document}`
  expect(project(content).blocks).toContainEqual(
    expect.objectContaining({
      kind: 'caption',
      text: 'a distinct caption.',
    }),
  )
})
