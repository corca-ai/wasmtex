import { type Position, Uri } from 'monaco-editor'
import { describe, expect, it } from 'vitest'
import { VirtualFS } from '../../fs/virtual-fs'
import {
  createLinkedEditingRangeProvider,
  createLinkProvider,
  createSignatureHelpProvider,
} from '../language-feature-providers'
import { ProjectIndex } from '../project-index'

// biome-ignore lint/suspicious/noExplicitAny: a minimal Monaco model stub for the link provider.
function model(content: string, path = '/main.tex'): any {
  return { getValue: () => content, uri: Uri.file(path) }
}

function firstLinkUrl(content: string): string {
  const provider = createLinkProvider()
  const { links } = provider.provideLinks(model(content), {} as never) as {
    links: Array<{ url: unknown }>
  }
  return String(links[0]!.url)
}

describe('createLinkProvider file-link resolution', () => {
  it('does not append .tex to an \\input target that already has an explicit extension', () => {
    // `\input{macros.sty}` loads macros.sty; appending .tex yields macros.sty.tex — a dead link.
    expect(firstLinkUrl('\\input{macros.sty}')).toMatch(/\/macros\.sty$/)
    expect(firstLinkUrl('\\input{foo.txt}')).toMatch(/\/foo\.txt$/)
  })

  it('appends .tex to an extensionless target (the common case)', () => {
    expect(firstLinkUrl('\\input{intro}')).toMatch(/\/intro\.tex$/)
    expect(firstLinkUrl('\\input{ch1/intro}')).toMatch(/\/ch1\/intro\.tex$/)
  })

  it('leaves an explicit .tex target untouched', () => {
    expect(firstLinkUrl('\\input{ch1/intro.tex}')).toMatch(/\/ch1\/intro\.tex$/)
  })
})

it('uses project signature metadata in the Monaco adapter', async () => {
  const content = '\\newcommand{\\vect}[1]{#1}\n\\vect{}'
  const index = new ProjectIndex()
  index.updateFile('main.tex', content)
  const provider = createSignatureHelpProvider(index)
  const result = await provider.provideSignatureHelp(
    model(content),
    { lineNumber: 2, column: 7 } as Position,
    { isCancellationRequested: false } as never,
    { triggerKind: 1, isRetrigger: false },
  )
  expect(result?.value).toMatchObject({
    activeParameter: 0,
    signatures: [{ label: '\\vect{arg1}' }],
  })
})

it('maps linked editing to Monaco and refuses cancelled or unsynchronized models', async () => {
  const content = String.raw`\begin{align}x\end{align}`
  const index = new ProjectIndex()
  const fs = new VirtualFS()
  fs.writeFile('main.tex', content)
  index.updateFile('main.tex', content)
  const provider = createLinkedEditingRangeProvider(index, fs)
  const position = { lineNumber: 1, column: 9 } as Position
  const active = { isCancellationRequested: false } as never
  const result = await provider.provideLinkedEditingRanges(model(content), position, active)
  expect(result?.ranges.map((range) => [range.startColumn, range.endColumn])).toEqual([
    [8, 13],
    [20, 25],
  ])
  expect(result?.wordPattern?.test('align*')).toBe(true)
  expect(await provider.provideLinkedEditingRanges(model('changed'), position, active)).toBeNull()
  expect(
    await provider.provideLinkedEditingRanges(model(content), position, {
      isCancellationRequested: true,
    } as never),
  ).toBeNull()
})
