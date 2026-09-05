import { describe, expect, it } from 'vitest'
import {
  assertLatexSyntaxSchemaVersion,
  createLatexSyntaxService,
  findLatexNotationPath,
  LATEX_SYNTAX_SCHEMA_VERSION,
  type LatexNotationNode,
  LatexSyntaxService,
} from './syntax'

describe('LatexSyntaxService', () => {
  it('publishes one explicitly versioned document syntax snapshot', () => {
    const content = 'For held-out data, $\\operatorname{ECE}=x$.'
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })

    expect(syntax.schemaVersion).toBe(LATEX_SYNTAX_SCHEMA_VERSION)
    expect(syntax.mathRoots).toHaveLength(1)
    const root = syntax.mathRoots[0]!
    const node = syntax.nodes[root.node]!
    expect(node).toMatchObject({
      kind: 'sequence',
      parent: null,
      ranges: { full: root.contentRange },
    })
    expect(node.provenance).toBeUndefined()
    expect(content.slice(node.ranges.full.startOffset, node.ranges.full.endOffset)).toBe(
      '\\operatorname{ECE}=x',
    )
    expect(() => assertLatexSyntaxSchemaVersion(syntax)).not.toThrow()
    expect(() => assertLatexSyntaxSchemaVersion({ schemaVersion: 3 })).toThrow(
      'Unsupported LaTeX syntax schema 3; expected 8',
    )
    expect(new LatexSyntaxService().getStats()).toMatchObject({
      notationNodes: 0,
      recoveredNodes: 0,
      lastInvalidatedDocuments: 0,
    })
  })

  it('classifies literal equation tokens without assigning mathematical meaning', () => {
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content: '$-x/2=y,z$',
      documentVersion: 1,
    })
    const literals = syntax.nodes
      .filter((node) => node.kind === 'token')
      .map((node) => [node.text, node.lexicalClass, node.mathClass])

    expect(literals).toEqual([
      ['-', 'operator', 'binary'],
      ['x', 'identifier', 'ordinary'],
      ['/', 'operator', 'binary'],
      ['2', 'number', 'ordinary'],
      ['=', 'operator', 'relation'],
      ['y', 'identifier', 'ordinary'],
      [',', 'punctuation', 'punctuation'],
      ['z', 'identifier', 'ordinary'],
    ])
  })

  it('keeps an unbraced modifier and its nucleus on one source path', () => {
    const content = '$\\hat y$'
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const modifier = syntax.nodes.find((node) => node.kind === 'modifier' && node.name === 'hat')!
    const nucleus = syntax.nodes[modifier.children[0]!]!

    expect(content.slice(modifier.ranges.full.startOffset, modifier.ranges.full.endOffset)).toBe(
      '\\hat y',
    )
    expect(
      content.slice(modifier.ranges.nucleus?.startOffset, modifier.ranges.nucleus?.endOffset),
    ).toBe('y')
    expect(nucleus.text).toBe('y')
    expect(nucleus.parent).toBe(syntax.nodes.indexOf(modifier))
  })

  it('preserves modifier, style, group, and script composition order', () => {
    const content = '$\\hat{\\mathbf y}_t$'
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const scriptIndex = syntax.nodes.findIndex(
      (node) => node.kind === 'script' && node.name === 'subscript',
    )
    const script = syntax.nodes[scriptIndex]!
    const modifierIndex = script.children[0]!
    const modifier = syntax.nodes[modifierIndex]!
    const group = syntax.nodes[modifier.children[0]!]!
    const style = syntax.nodes[group.children[0]!]!

    expect([modifier.kind, group.kind, style.kind]).toEqual(['modifier', 'group', 'style'])
    expect(style.name).toBe('mathbf')
    expect(modifier.parent).toBe(scriptIndex)
    expect(content.slice(script.ranges.full.startOffset, script.ranges.full.endOffset)).toBe(
      '\\hat{\\mathbf y}_t',
    )
    assertArenaInvariants(syntax.nodes)
  })

  it('distinguishes explicit named operators from styled and plain letter runs', () => {
    const content = '$\\operatorname{ECE}+\\mathrm{ECE}+ECE$'
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const namedIndex = syntax.nodes.findIndex(
      (node) => node.kind === 'named-operator' && node.name === 'ECE',
    )
    const named = syntax.nodes[namedIndex]!
    const styled = syntax.nodes.find((node) => node.kind === 'style' && node.name === 'mathrm')!
    const namedStart = content.indexOf('ECE')

    expect(content.slice(named.ranges.name?.startOffset, named.ranges.name?.endOffset)).toBe('ECE')
    for (let offset = namedStart; offset < namedStart + 3; offset++) {
      expect(findLatexNotationPath(syntax, offset)).toContain(namedIndex)
    }
    expect(styled.children).toHaveLength(1)
    expect(syntax.nodes[styled.children[0]!]!.kind).toBe('group')
    expect(
      syntax.nodes.filter(
        (node) =>
          node.kind === 'named-operator' &&
          node.ranges.full.startOffset > named.ranges.full.endOffset,
      ),
    ).toEqual([])
    const plainStart = content.lastIndexOf('ECE')
    expect(
      syntax.nodes
        .filter(
          (node) =>
            node.kind === 'token' &&
            plainStart <= node.ranges.full.startOffset &&
            node.ranges.full.endOffset <= plainStart + 3,
        )
        .map((node) => node.text),
    ).toEqual(['E', 'C', 'E'])
  })

  it('preserves a named surface followed by delimiters without claiming application', () => {
    const content = '$\\operatorname*{acc}(B_m)-\\operatorname{conf}(B_m)$'
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const root = syntax.nodes[syntax.mathRoots[0]!.node]!

    expect(root.children.map((child) => syntax.nodes[child]!.kind)).toEqual([
      'named-operator',
      'delimiter',
      'token',
      'named-operator',
      'delimiter',
    ])
    expect(
      syntax.nodes.filter((node) => node.kind === 'named-operator').map((node) => node.name),
    ).toEqual(['acc', 'conf'])
  })

  it('represents nested math environments and alignment markers structurally', () => {
    const content = '$\\begin{matrix}a&b\\\\c&d\\end{matrix}$'
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const environment = syntax.nodes.find(
      (node) => node.kind === 'environment' && node.name === 'matrix',
    )!

    expect(environment.state).toBe('complete')
    expect(
      content.slice(environment.ranges.name?.startOffset, environment.ranges.name?.endOffset),
    ).toBe('matrix')
    expect(
      environment.children.map((child) => [syntax.nodes[child]!.kind, syntax.nodes[child]!.name]),
    ).toEqual([
      ['alignment', 'row'],
      ['alignment', 'row'],
    ])
    expect(
      syntax.nodes.filter(
        (node) => node.kind === 'alignment' && (node.text === '&' || node.name === '\\'),
      ),
    ).toHaveLength(3)
    assertArenaInvariants(syntax.nodes)
  })

  it('recovers incomplete groups, scripts, delimiters, and deep input', () => {
    const content = `$\\hat{x_i+(y^${'{'.repeat(140)}z$`
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })

    expect(syntax.mathRoots[0]?.state).toBe('complete')
    expect(syntax.nodes.some((node) => node.state === 'incomplete')).toBe(true)
    expect(syntax.nodes.some((node) => node.state === 'truncated')).toBe(true)
    assertArenaInvariants(syntax.nodes)
  })

  it('bounds adversarial notation arenas and collapses the remaining surface', () => {
    const content = `$${'x'.repeat(12_000)}$`
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })

    expect(syntax.nodes.length).toBeLessThanOrEqual(10_000)
    expect(syntax.nodes.some((node) => node.state === 'truncated')).toBe(true)
    assertArenaInvariants(syntax.nodes)
  })

  it('cancels adversarial notation before publishing partial project state', () => {
    const service = new LatexSyntaxService()
    service.upsert({
      fileId: 'stable',
      path: 'old.tex',
      content: '\\label{old} $x$',
      documentVersion: 1,
    })
    let checks = 0
    const cancellationToken = {
      get isCancellationRequested() {
        checks++
        return checks >= 5
      },
    }

    expect(() =>
      service.upsert(
        {
          fileId: 'stable',
          path: 'new.tex',
          content: `$${'x'.repeat(12_000)}$`,
          documentVersion: 2,
        },
        cancellationToken,
      ),
    ).toThrow('Syntax update cancelled')
    expect(service.getFile('stable')?.documentVersion).toBe(1)
    expect(service.getProjectIndex().hasFile('old.tex')).toBe(true)
    expect(service.getProjectIndex().hasFile('new.tex')).toBe(false)
  })

  it('reports notation, recovery, invalidation, and transfer counters lazily', () => {
    const service = new LatexSyntaxService()
    const syntax = service.upsert({
      fileId: 'stable',
      path: 'main.tex',
      content: '$\\hat{x$',
      documentVersion: 1,
    })
    const stats = service.getStats()

    expect(stats.notationNodes).toBe(syntax.nodes.length)
    expect(stats.recoveredNodes).toBeGreaterThan(0)
    expect(stats.snapshotBytes).toBeGreaterThan(0)
    expect(stats.lastInvalidatedDocuments).toBe(1)
    expect(stats.lastTransferBytes).toBe(stats.snapshotBytes)
  })

  it('produces equivalent clean and incrementally replaced syntax snapshots', () => {
    const input = {
      fileId: 'stable',
      path: 'main.tex',
      content: [
        '\\section{Calibration}',
        'For held-out data, use ECE.',
        '\\[\\operatorname{ECE}=\\hat y_i\\]',
      ].join('\n'),
      documentVersion: 2,
    }
    const incremental = new LatexSyntaxService()
    incremental.upsert({ ...input, content: '$x$', documentVersion: 1 })
    const updated = incremental.upsert(input)
    const clean = new LatexSyntaxService().upsert(input)

    expect(updated).toEqual(clean)
    expect(incremental.getStats().parseCount).toBe(2)
  })

  it('keeps UTF-16 ranges exact for astral notation tokens', () => {
    const content = '$😀_i+𝑦$'
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const tokens = syntax.nodes.filter((node) => node.kind === 'token')

    expect(tokens.map((node) => node.text)).toEqual(['😀', 'i', '+', '𝑦'])
    for (const token of tokens) {
      expect(content.slice(token.ranges.full.startOffset, token.ranges.full.endOffset)).toBe(
        token.text,
      )
    }
  })

  it('exposes only visible prose while retaining prose command arguments', () => {
    const content = [
      'Visible \\emph{important} prose.',
      '\\label{not-prose} {later prose} \\iffalse hidden \\else shown \\fi',
      '% comment',
      '\\verb|verbatim| $math$',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const prose = syntax.visibleProse
      .map(({ range }) => content.slice(range.startOffset, range.endOffset))
      .join(' ')

    expect(prose).toContain('Visible')
    expect(prose).toContain('important')
    expect(prose).toContain('later prose')
    expect(prose).toContain('shown')
    expect(prose).not.toContain('not-prose')
    expect(prose).not.toContain('hidden')
    expect(prose).not.toContain('comment')
    expect(prose).not.toContain('verbatim')
    expect(prose).not.toContain('math')
  })

  it('publishes citation syntax separately from visible prose', () => {
    const content = [
      'Prior work \\parencite[see][p. 4]{smith,jones} may support $x$.',
      'Later work \\textcite{doe} does not.',
      'Broken \\autocite{oops',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })

    expect(
      syntax.proseAnnotations.map((annotation) => ({
        ...annotation,
        source: content.slice(annotation.range.startOffset, annotation.range.endOffset),
      })),
    ).toEqual([
      {
        kind: 'citation',
        name: 'parencite',
        range: {
          startOffset: content.indexOf('\\parencite'),
          endOffset: content.indexOf(' may support'),
        },
        state: 'complete',
        source: '\\parencite[see][p. 4]{smith,jones}',
      },
      {
        kind: 'citation',
        name: 'textcite',
        range: {
          startOffset: content.indexOf('\\textcite'),
          endOffset: content.indexOf(' does not'),
        },
        state: 'complete',
        source: '\\textcite{doe}',
      },
      {
        kind: 'citation',
        name: 'autocite',
        range: { startOffset: content.indexOf('\\autocite'), endOffset: content.length },
        state: 'incomplete',
        source: '\\autocite{oops',
      },
    ])
    const prose = syntax.visibleProse
      .map(({ range }) => content.slice(range.startOffset, range.endOffset))
      .join(' ')
    expect(prose).not.toContain('smith')
    expect(prose).not.toContain('{doe}')
    expect(prose).not.toContain('oops')
  })

  it('publishes neutral document fields without treating their values as prose', () => {
    const content = [
      '\\title{Optimization with random matrices}',
      '\\author{James Maxwell}',
      '\\keywords{control systems, stability}',
      'Visible abstract prose.',
      '\\title{unfinished',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const fields = syntax.proseAnnotations.filter(
      (annotation) => annotation.kind === 'document-field',
    )

    expect(
      fields.map((field) => ({
        name: field.name,
        state: field.state,
        value:
          field.valueRange === undefined
            ? null
            : content.slice(field.valueRange.startOffset, field.valueRange.endOffset),
      })),
    ).toEqual([
      { name: 'title', state: 'complete', value: 'Optimization with random matrices' },
      { name: 'author', state: 'complete', value: 'James Maxwell' },
      { name: 'keywords', state: 'complete', value: 'control systems, stability' },
      { name: 'title', state: 'incomplete', value: 'unfinished' },
    ])
    const prose = syntax.visibleProse
      .map(({ range }) => content.slice(range.startOffset, range.endOffset))
      .join(' ')
    expect(prose).toBe('Visible abstract prose.')
  })

  it('keeps macro definitions out of active section and environment scopes', () => {
    const content = [
      '\\renewcommand\\subsection[1]{#1}',
      '\\newcommand{\\template}{\\section{Hidden}\\begin{theorem}body\\end{theorem}}',
      '\\def\\other{\\section{Also hidden}}',
      '\\begin{document}',
      '\\section{Visible}',
      '$x$',
      '\\end{document}',
    ].join('\n')
    const service = new LatexSyntaxService()
    const syntax = service.upsert({ fileId: 'main', path: 'main.tex', content, documentVersion: 1 })
    expect(
      syntax.scopes.filter((scope) => scope.kind === 'section').map((scope) => scope.name),
    ).toEqual(['Visible'])
    expect(
      syntax.scopes.filter((scope) => scope.kind === 'environment').map((scope) => scope.name),
    ).toEqual(['document'])
    for (const scope of syntax.scopes) {
      if (scope.parent === null) continue
      const parent = syntax.scopes[scope.parent]!
      expect(scope.range.startOffset).toBeGreaterThanOrEqual(parent.range.startOffset)
      expect(scope.range.endOffset).toBeLessThanOrEqual(parent.range.endOffset)
    }
    expect(
      service
        .getProjectIndex()
        .getFileSymbols('main.tex')
        ?.sections.map((section) => section.title),
    ).toEqual(['Visible'])
  })

  it('records nested section and environment scope spans with recovery', () => {
    const content = [
      '\\section{One}',
      '\\begin{theorem}body\\begin{proof}proof\\end{proof}\\end{theorem}',
      '\\subsection{Nested}',
      '\\begin{unfinished}tail',
      '\\section{Two}',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const { scopes } = syntax
    const first = scopes.find((scope) => scope.kind === 'section' && scope.name === 'One')!
    const nested = scopes.find((scope) => scope.kind === 'section' && scope.name === 'Nested')!
    const theoremIndex = scopes.findIndex(
      (scope) => scope.kind === 'environment' && scope.name === 'theorem',
    )
    const proof = scopes.find((scope) => scope.kind === 'environment' && scope.name === 'proof')!
    const unfinished = scopes.find(
      (scope) => scope.kind === 'environment' && scope.name === 'unfinished',
    )!

    expect(nested.parent).toBe(scopes.indexOf(first))
    expect(proof.parent).toBe(theoremIndex)
    expect(scopes[theoremIndex]?.state).toBe('complete')
    expect(unfinished.state).toBe('incomplete')
    expect(content.slice(first.range.startOffset, first.range.endOffset)).not.toContain(
      '\\section{Two}',
    )
  })

  it('records nested and sibling Markdown heading scopes without reading fences', () => {
    const content = [
      '# One',
      'alpha',
      '## Nested',
      'beta',
      '```md',
      '# Not a scope',
      '```',
      'Two',
      '===',
      'gamma',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'markdown',
      path: 'paper.md',
      content,
      documentVersion: 1,
    })
    const sections = syntax.scopes.filter((scope) => scope.kind === 'section')
    const first = sections.find((scope) => scope.name === 'One')!
    const nested = sections.find((scope) => scope.name === 'Nested')!
    const second = sections.find((scope) => scope.name === 'Two')!

    expect(sections.map((scope) => scope.name)).toEqual(['One', 'Nested', 'Two'])
    expect(nested.parent).toBe(syntax.scopes.indexOf(first))
    expect(second.parent).toBe(0)
    expect(content.slice(first.range.startOffset, first.range.endOffset)).not.toContain('Two\n===')
    expect(content.slice(second.range.startOffset, second.range.endOffset)).toContain('gamma')
  })

  it('publishes neutral source-order blocks without assigning semantic scope', () => {
    const content = [
      '# Dynamics',
      'Let $x$ be introduced.',
      '',
      '$$x_{k+1}=Ax_k+Bu_k$$',
      '',
      '- $x_k$ | sampled state',
      '| $u_k$ | control input |',
      '',
      'A final paragraph uses $x_k$.',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'blocks',
      path: 'paper.md',
      content,
      documentVersion: 1,
    })

    expect(syntax.blocks.map((block) => block.kind)).toEqual([
      'heading',
      'paragraph',
      'display-math',
      'list-item',
      'table-row',
      'paragraph',
    ])
    expect(
      syntax.blocks.map((block) => content.slice(block.range.startOffset, block.range.endOffset)),
    ).toEqual([
      '# Dynamics',
      'Let $x$ be introduced.',
      '$$x_{k+1}=Ax_k+Bu_k$$',
      '- $x_k$ | sampled state',
      '| $u_k$ | control input |',
      'A final paragraph uses $x_k$.',
    ])
    expect(syntax.blocks.every((block) => block.parentScope === 1)).toBe(true)
  })

  it('keeps environment, caption, item, and resource boundaries neutral and bounded', () => {
    const content = [
      '\\newglossaryentry{state}{name=state}',
      '\\begin{figure}',
      '\\caption{Response of $x$}',
      '\\end{figure}',
      '\\begin{itemize}',
      '\\item first entry',
      '\\end{itemize}',
      '\\caption{unfinished',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'latex-blocks',
      path: 'paper.tex',
      content,
      documentVersion: 1,
    })

    expect(syntax.blocks.map((block) => [block.kind, block.state])).toEqual([
      ['resource-entry', 'complete'],
      ['caption', 'complete'],
      ['list-item', 'complete'],
      ['caption', 'incomplete'],
    ])
    const caption = syntax.blocks.find(
      (block) => block.kind === 'caption' && block.state === 'complete',
    )!
    const figure = syntax.scopes.findIndex(
      (scope) => scope.kind === 'environment' && scope.name === 'figure',
    )
    expect(caption.parentScope).toBe(figure)
    expect(content.slice(caption.range.startOffset, caption.range.endOffset)).toBe(
      '\\caption{Response of $x$}',
    )
  })

  it('preserves prose on both sides of a same-line display as adjacent blocks', () => {
    const content = 'Before the relation $$x=y$$ where the symbols are introduced.'
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'adjacent',
      path: 'paper.tex',
      content,
      documentVersion: 1,
    })

    expect(
      syntax.blocks.map((block) => [
        block.kind,
        content.slice(block.range.startOffset, block.range.endOffset),
      ]),
    ).toEqual([
      ['paragraph', 'Before the relation'],
      ['display-math', '$$x=y$$'],
      ['paragraph', 'where the symbols are introduced.'],
    ])
  })

  it('exposes neutral declarations without downstream semantic vocabulary', () => {
    const content = [
      '\\documentclass[twocolumn]{article}',
      '\\usepackage{amsmath}',
      '\\newcommand{\\vect}[1]{#1}',
      '\\newenvironment{claim}{}{}',
      '\\newglossaryentry{ece}{name=ECE}',
      '\\newacronym{ml}{ML}{machine learning}',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })

    expect(syntax.declarations.map((declaration) => declaration.kind)).toEqual(
      expect.arrayContaining(['class', 'package', 'macro', 'environment', 'glossary', 'acronym']),
    )
  })

  it('returns UTF-16 math ranges and ignores fenced Markdown', () => {
    const content = '한글 😀 $x_i$\n```tex\n$ignored$\n```\n\\[y\\]'
    const service = new LatexSyntaxService()
    const syntax = service.upsert({
      fileId: 'stable',
      path: 'main.md',
      content,
      documentVersion: 7,
      language: 'markdown',
    })

    expect(syntax.mathRegions).toHaveLength(2)
    expect(
      content.slice(
        syntax.mathRegions[0]!.contentRange.startOffset,
        syntax.mathRegions[0]!.contentRange.endOffset,
      ),
    ).toBe('x_i')
    expect(syntax.mathRegions[1]!.delimiter).toBe('\\[')
    expect(service.getProjectIndex().hasFile('main.md')).toBe(false)
    expect(service.getStats()).toMatchObject({ documents: 1, parseCount: 1 })
  })

  it('preserves stable identity, mutable paths, and macro provenance', () => {
    const content = '\\newcommand{\\vect}[1]{#1} $\\vect{x}$'
    const service = new LatexSyntaxService()
    const syntax = service.upsert({
      fileId: 'f1',
      path: 'old.tex',
      content,
      documentVersion: 1,
    })
    const call = syntax.macros.find((event) => event.kind === 'call' && event.name === 'vect')
    expect(call?.definitions).toHaveLength(1)
    const invocationStart = content.indexOf('\\vect{x}')
    expect(call?.expansion).toEqual({
      status: 'expanded',
      depth: 0,
      editable: false,
      surface: 'x',
      inputRange: { startOffset: invocationStart, endOffset: invocationStart + '\\vect{x}'.length },
    })

    service.move('f1', 'new.tex')
    expect(service.getFile('f1')?.path).toBe('new.tex')
    expect(service.getProjectIndex().hasFile('old.tex')).toBe(false)
    expect(service.getProjectIndex().hasFile('new.tex')).toBe(true)
  })

  it('returns the expanded surface and full invocation range for nested math macros', () => {
    const content = [
      '\\newcommand{\\bold}[1]{\\mathbf{#1}}',
      '\\newcommand{\\vect}[1]{\\bold{#1}}',
      '$\\vect{x+y}$',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'f1',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const call = syntax.macros.find((event) => event.kind === 'call' && event.name === 'vect')
    expect(call?.expansion.surface).toBe('\\mathbf{x+y}')
    expect(
      content.slice(call?.expansion.inputRange?.startOffset, call?.expansion.inputRange?.endOffset),
    ).toBe('\\vect{x+y}')
  })

  it('exports bounded composite expansions as neutral generated notation', () => {
    const content = [
      '\\newcommand{\\kinetic}[3]{#1=\\frac{1}{2}#2#3^2}',
      '$\\kinetic{K}{m}{v}$',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'main',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const call = syntax.macros.find((event) => event.kind === 'call' && event.name === 'kinetic')
    const notation = call?.expansion.notation

    expect(notation).toBeDefined()
    expect(notation?.nodes[notation.root]?.kind).toBe('sequence')
    expect(notation?.nodes.map((node) => node.text).filter(Boolean)).toEqual([
      'K',
      '=',
      '1',
      '2',
      'm',
      'v',
      '2',
    ])
    expect(notation?.nodes.every((node) => !('ranges' in node))).toBe(true)
  })

  it('preserves each concrete required and optional macro argument at its call site', () => {
    const content = [
      '\\newcommand{\\estimate}[2][mean]{\\hat{#2}_{#1}}',
      '$\\estimate[median]{y}$',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'main',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const call = syntax.macros.find((event) => event.kind === 'call' && event.name === 'estimate')

    expect(call?.arguments?.map(({ index, kind, value }) => ({ index, kind, value }))).toEqual([
      { index: 0, kind: 'optional', value: 'median' },
      { index: 1, kind: 'required', value: 'y' },
    ])
    expect(
      call?.arguments?.map((argument) =>
        content.slice(argument.source.range.startOffset, argument.source.range.endOffset),
      ),
    ).toEqual(['[median]', '{y}'])
  })

  it('relinks macro provenance across project files without reparsing callers', () => {
    const service = new LatexSyntaxService()
    service.upsert({
      fileId: 'caller',
      path: 'chapter.tex',
      content: '$\\vect{x}$',
      documentVersion: 1,
    })
    service.upsert({
      fileId: 'defs',
      path: 'macros.tex',
      content: '\\newcommand{\\vect}[1]{#1}',
      documentVersion: 1,
    })
    const call = service
      .getFile('caller')
      ?.macros.find((event) => event.kind === 'call' && event.name === 'vect')
    expect(call?.definitions[0]?.fileId).toBe('defs')
    expect(service.getInvalidatedFiles().map((syntax) => syntax.fileId)).toEqual(['caller', 'defs'])
    expect(service.getStats().parseCount).toBe(2)

    service.move('defs', 'shared/macros.tex')
    expect(service.getInvalidatedFiles().map((syntax) => syntax.fileId)).toEqual(['caller', 'defs'])
    expect(
      service.getFile('caller')?.macros.find((event) => event.name === 'vect')?.definitions[0]
        ?.path,
    ).toBe('shared/macros.tex')
    service.remove('defs')
    expect(service.getInvalidatedFiles().map((syntax) => syntax.fileId)).toEqual(['caller'])
    expect(
      service.getFile('caller')?.macros.find((event) => event.name === 'vect')?.definitions,
    ).toEqual([])
  })

  it('expands project macros across files while preserving the caller range', () => {
    const service = createLatexSyntaxService({
      documents: [
        {
          fileId: 'caller',
          path: 'chapter.tex',
          content: '$\\Voltage=\\Current\\Resistance$',
          documentVersion: 1,
        },
        {
          fileId: 'defs',
          path: 'macros.tex',
          content: [
            '\\newcommand{\\Voltage}{V}',
            '\\newcommand{\\Current}{I}',
            '\\newcommand{\\Resistance}{R}',
          ].join('\n'),
          documentVersion: 1,
        },
      ],
    })
    const syntax = service.getFile('caller')!
    for (const [name, surface] of [
      ['Voltage', 'V'],
      ['Current', 'I'],
      ['Resistance', 'R'],
    ]) {
      const call = syntax.macros.find((event) => event.kind === 'call' && event.name === name)
      expect(call?.expansion.status).toBe('expanded')
      expect(call?.expansion.surface).toBe(surface)
      expect(call?.expansion.inputRange).toEqual(
        call && {
          startOffset: call.source.range.startOffset - 1,
          endOffset: call.source.range.endOffset,
        },
      )
    }
    expect(service.getStats().parseCount).toBe(2)
  })

  it('lowers declared operators and bounded macro wrappers into the generic notation CST', () => {
    const content = [
      '\\DeclareMathOperator{\\ECE}{ECE}',
      '\\newcommand{\\estimate}[1]{\\hat{#1}}',
      '\\newcommand{\\nestedestimate}[1]{\\estimate{#1}}',
      '$\\ECE+\\estimate{y}+\\nestedestimate{z}$',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'main',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const callNodes = syntax.nodes.filter((node) => node.provenance?.origin === 'expansion')

    expect(callNodes.map((node) => [node.kind, node.name])).toEqual([
      ['named-operator', 'ECE'],
      ['modifier', 'hat'],
      ['modifier', 'hat'],
    ])
    for (const node of callNodes) {
      const provenance = node.provenance
      expect(provenance).toBeDefined()
      if (!provenance) throw new Error('expanded nodes require explicit provenance')
      expect(provenance.editable).toBe(false)
      expect(provenance.callSite).toEqual(provenance.source)
      expect(provenance.definitions).toHaveLength(1)
      expect(node.ranges.editable).toBeUndefined()
    }
    expect(callNodes[1]?.arguments?.[0]?.role).toBe('nucleus')
    expect(callNodes[2]?.arguments?.[0]?.role).toBe('nucleus')
  })

  it('retracts generated notation when a project macro definition disappears', () => {
    const service = createLatexSyntaxService({
      documents: [
        {
          fileId: 'caller',
          path: 'main.tex',
          content: '$\\estimate{x}$',
          documentVersion: 1,
        },
        {
          fileId: 'defs',
          path: 'defs.tex',
          content: '\\newcommand{\\estimate}[1]{\\hat{#1}}',
          documentVersion: 1,
        },
      ],
    })
    const callNode = () =>
      service.getFile('caller')?.nodes.find((node) => node.ranges.command?.startOffset === 1)

    expect(callNode()).toMatchObject({
      kind: 'modifier',
      provenance: { origin: 'expansion', editable: false },
    })
    service.remove('defs')
    expect(callNode()).toMatchObject({
      kind: 'command',
      state: 'opaque',
    })
    expect(callNode()?.provenance).toBeUndefined()
    expect(service.getStats().parseCount).toBe(2)
  })

  it('limits a macro-definition edit to its actual caller closure', () => {
    const unrelated = Array.from({ length: 100 }, (_, index) => ({
      fileId: `unrelated-${index}`,
      path: `unrelated-${index}.tex`,
      content: '$x$',
      documentVersion: 1,
    }))
    const service = createLatexSyntaxService({
      documents: [
        ...unrelated,
        {
          fileId: 'caller-a',
          path: 'caller-a.tex',
          content: '$\\estimate{x}$',
          documentVersion: 1,
        },
        {
          fileId: 'caller-b',
          path: 'caller-b.tex',
          content: '$\\estimate{y}$',
          documentVersion: 1,
        },
        {
          fileId: 'defs',
          path: 'defs.tex',
          content: '\\newcommand{\\estimate}[1]{\\hat{#1}}',
          documentVersion: 1,
        },
      ],
    })

    service.upsert({
      fileId: 'defs',
      path: 'defs.tex',
      content: '\\newcommand{\\estimate}[1]{\\bar{#1}}',
      documentVersion: 2,
    })

    expect(
      service
        .getInvalidatedFiles()
        .map((syntax) => syntax.fileId)
        .sort(),
    ).toEqual(['caller-a', 'caller-b', 'defs'])
    expect(service.getStats().parseCount).toBe(104)
  })

  it('refuses an ambiguous project macro definition', () => {
    const service = createLatexSyntaxService({
      documents: [
        { fileId: 'caller', path: 'main.tex', content: '$\\value$', documentVersion: 1 },
        { fileId: 'one', path: 'one.tex', content: '\\newcommand{\\value}{x}', documentVersion: 1 },
        { fileId: 'two', path: 'two.tex', content: '\\newcommand{\\value}{y}', documentVersion: 1 },
      ],
    })
    const call = service
      .getFile('caller')
      ?.macros.find((event) => event.kind === 'call' && event.name === 'value')
    expect(call?.definitions).toHaveLength(2)
    expect(call?.expansion).toEqual({ status: 'unresolved', depth: 0, editable: true })
  })

  it('returns a partial region and diagnostic for unfinished input', () => {
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'f1',
      path: 'main.tex',
      content: 'before $x + 1',
      documentVersion: 1,
    })
    expect(syntax.mathRegions[0]?.closed).toBe(false)
    expect(syntax.diagnostics[0]?.code).toBe('unclosed-math')
  })

  it('covers TeX delimiters, environments, comments, verbatim, and includes', () => {
    const content = [
      '% $comment$',
      '\\verb|$verbatim$|',
      '\\input{chapter}',
      '$$a$$ \\(b\\) \\begin{equation}c\\end{equation}',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'f1',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    expect(syntax.mathRegions.map((region) => region.delimiter)).toEqual([
      '$$',
      '\\(',
      '\\begin{equation}',
    ])
    expect(syntax.includes[0]?.path).toBe('chapter')
  })

  it('resets and removes its project inventory', () => {
    const service = createLatexSyntaxService({
      documents: [
        { fileId: 'a', path: 'a.tex', content: '$a$', documentVersion: 1 },
        { fileId: 'b', path: 'b.tex', content: '$b$', documentVersion: 1 },
      ],
    })
    service.reset({
      documents: [{ fileId: 'c', path: 'c.tex', content: '$c$', documentVersion: 2 }],
    })
    expect(service.getFile('a')).toBeNull()
    expect(service.getFile('c')?.documentVersion).toBe(2)
    service.remove('missing')
    service.remove('c')
    expect(service.getFile('c')).toBeNull()
    expect(service.getStats()).toMatchObject({ documents: 0, parseCount: 3 })
    expect(() => service.move('missing', 'next.tex')).toThrow('unknown fileId')
  })

  it('removes stale LaTeX symbols when a document becomes Markdown', () => {
    const service = new LatexSyntaxService()
    service.upsert({
      fileId: 'stable',
      path: 'notes.tex',
      content: '\\label{old}',
      documentVersion: 1,
    })
    service.upsert({
      fileId: 'stable',
      path: 'notes.tex',
      content: '$x$',
      documentVersion: 2,
      language: 'markdown',
    })

    expect(service.getProjectIndex().hasFile('notes.tex')).toBe(false)
  })

  it('reports builtin macro calls without invented definitions', () => {
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'f1',
      path: 'main.tex',
      content: '$\\alpha$',
      documentVersion: 1,
    })
    const alpha = syntax.macros.find((event) => event.name === 'alpha')
    expect(alpha?.kind).toBe('call')
    expect(alpha?.definitions).toEqual([])
    expect(alpha?.expansion).toEqual({ status: 'unresolved', depth: 0, editable: true })
  })

  it('reports bounded macro expansion cycles and truncation without synthetic editability', () => {
    const content = [
      '\\newcommand{\\a}{\\b}',
      '\\newcommand{\\b}{\\a}',
      '\\newcommand{\\c}{\\d}',
      '\\newcommand{\\d}{\\e}',
      '\\newcommand{\\e}{\\f}',
      '\\newcommand{\\f}{\\g}',
      '\\newcommand{\\g}{\\h}',
      '\\newcommand{\\h}{x}',
      '$\\a \\c$',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'f1',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const calls = syntax.macros.filter((event) => event.kind === 'call')
    expect(calls.find((event) => event.name === 'a')?.expansion.status).toBe('cycle')
    expect(calls.find((event) => event.name === 'c')?.expansion).toEqual({
      status: 'truncated',
      depth: 4,
      editable: false,
    })
  })

  it('excludes Markdown metadata, inline code, comments, and false TeX branches', () => {
    const content = [
      '---',
      'formula: $metadata$',
      '---',
      '`$inline$` <!-- $comment$ -->',
      '\\iffalse $false$ \\else $true$ \\fi',
      '$visible$',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'f1',
      path: 'main.md',
      content,
      documentVersion: 1,
      language: 'markdown',
    })
    expect(
      syntax.mathRegions.map((region) =>
        content.slice(region.contentRange.startOffset, region.contentRange.endOffset),
      ),
    ).toEqual(['true', 'visible'])
  })
})

function assertArenaInvariants(nodes: readonly LatexNotationNode[]): void {
  for (const [index, node] of nodes.entries()) {
    expect(node.ranges.full.startOffset).toBeLessThanOrEqual(node.ranges.full.endOffset)
    if (node.provenance) {
      expect(node.provenance.source.range).toEqual(node.ranges.full)
      expect(node.provenance.editable).toBe(node.ranges.editable !== undefined)
    } else {
      expect(node.ranges.editable).toBeUndefined()
    }
    let previousEnd = node.ranges.full.startOffset
    for (const child of node.children) {
      expect(child).toBeGreaterThanOrEqual(0)
      expect(child).toBeLessThan(nodes.length)
      expect(nodes[child]!.parent).toBe(index)
      expect(nodes[child]!.ranges.full.startOffset).toBeGreaterThanOrEqual(
        node.ranges.full.startOffset,
      )
      expect(nodes[child]!.ranges.full.endOffset).toBeLessThanOrEqual(node.ranges.full.endOffset)
      expect(nodes[child]!.ranges.full.startOffset).toBeGreaterThanOrEqual(previousEnd)
      previousEnd = nodes[child]!.ranges.full.endOffset
    }
  }
}
