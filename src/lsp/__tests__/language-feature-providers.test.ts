import { Uri } from 'monaco-editor'
import { describe, expect, it } from 'vitest'
import { createLinkProvider } from '../language-feature-providers'

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
