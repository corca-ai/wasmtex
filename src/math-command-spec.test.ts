import { describe, expect, it } from 'vitest'
import { getCommandPackage, getCommandSignature } from './lsp/package-db'
import {
  getMathCommandSpec,
  MATH_COMMAND_SPECS,
  type MathCommandArgumentRole,
} from './math-command-spec'
import { LatexSyntaxService } from './syntax'

describe('MathCommandSpec registry', () => {
  it('is deterministic, unique, immutable, and provenance-bearing', () => {
    const names = MATH_COMMAND_SPECS.map((spec) => spec.name)
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)))
    expect(new Set(names).size).toBe(names.length)
    expect(
      MATH_COMMAND_SPECS.every(
        (spec) => spec.provenance.source.length > 0 && spec.provenance.confidence.length > 0,
      ),
    ).toBe(true)
    expect(Object.isFrozen(MATH_COMMAND_SPECS)).toBe(true)
    expect(Object.isFrozen(getMathCommandSpec('frac'))).toBe(true)
  })

  it('covers compositional notation and package-opacity families through data', () => {
    for (const name of [
      'hat',
      'overset',
      'mathbf',
      'symbf',
      'operatorname',
      'sin',
      'frac',
      'sqrt',
      'sum',
      'mathrel',
      'left',
      'prescript',
      'mathchoice',
      'phantom',
      'text',
      'quad',
      'limits',
      '\\',
      'norm',
      'pdv',
      'tensor',
      'qty',
      'ce',
      'bra',
    ]) {
      expect(getMathCommandSpec(name), name).toBeDefined()
    }
  })

  it('agrees with existing authoritative signatures without importing them at runtime', () => {
    for (const name of ['frac', 'operatorname', 'text']) {
      expect(getMathCommandSpec(name)?.arguments.map((argument) => argument.syntax)).toEqual(
        getCommandSignature(name)?.map((argument) => argument.kind),
      )
    }
    expect(getMathCommandSpec('operatorname')?.provenance.package).toBe(
      getCommandPackage('operatorname'),
    )
    expect(getMathCommandSpec('text')?.provenance.package).toBe(getCommandPackage('text'))
  })

  it('drives typed arguments, math classes, and incomplete recovery', () => {
    const content = [
      '$\\frac{a}{b}+\\sqrt[3]{x}+\\overset{*}{y}$',
      '$\\mathrel{\\sim}+\\prescript{a}{b}{T}+\\operatorname*{argmax}$',
      '$\\ce{H2O}+\\mystery{x}+\\frac{only-one}$',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const command = (name: string) => syntax.nodes.find((node) => node.name === name)!

    expect(argumentRoles(command('frac'))).toEqual(['numerator', 'denominator'])
    expect(argumentRoles(command('sqrt'))).toEqual(['degree', 'radicand'])
    expect(argumentRoles(command('overset'))).toEqual(['annotation', 'nucleus'])
    expect(command('overset').kind).toBe('modifier')
    expect(command('mathrel').mathClass).toBe('relation')
    expect(argumentRoles(command('prescript'))).toEqual(['superscript', 'subscript', 'base'])
    expect(command('argmax').kind).toBe('named-operator')
    expect(command('ce').state).toBe('opaque')
    expect(command('mystery').state).toBe('opaque')
    expect(syntax.nodes.some((node) => node.name === 'frac' && node.state === 'incomplete')).toBe(
      true,
    )
  })

  it('publishes common comparison and set commands as neutral relations', () => {
    const names = [
      'ge',
      'geq',
      'in',
      'le',
      'leq',
      'ne',
      'neq',
      'notin',
      'subset',
      'subseteq',
      'supset',
      'supseteq',
    ]
    const content = `$${names.map((name) => `a \\${name} b`).join(', ')}$`
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'relations',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })

    for (const name of names) {
      expect(syntax.nodes.find((node) => node.name === name)).toMatchObject({
        kind: 'command',
        mathClass: 'relation',
        name,
        state: 'complete',
      })
    }
  })

  it('keeps styles and package DSLs structurally restrained', () => {
    const content = '$\\symbf{ECE}+\\mathrm{ECE}+\\text{ECE}+\\qty{3}{m}+ECE$'
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })

    expect(syntax.nodes.filter((node) => node.kind === 'named-operator')).toEqual([])
    expect(syntax.nodes.filter((node) => node.kind === 'style').map((node) => node.name)).toEqual([
      'symbf',
      'mathrm',
      'text',
    ])
    expect(syntax.nodes.find((node) => node.name === 'qty')?.state).toBe('opaque')
  })

  it('keeps delimiter tokens, primes, inverses, transposes, and adjoints compositional', () => {
    const content = "$\\left(x\\right)+f''+A^{-1}+B^\\top+C^\\dagger$"
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const left = syntax.nodes.find((node) => node.name === 'left')!
    const right = syntax.nodes.find((node) => node.name === 'right')!
    const prime = syntax.nodes.find((node) => node.kind === 'script' && node.name === 'prime')!

    expect(argumentRoles(left)).toEqual(['delimiter'])
    expect(argumentRoles(right)).toEqual(['delimiter'])
    expect(syntax.nodes[left.arguments?.[0]?.node ?? -1]?.text).toBe('(')
    expect(syntax.nodes[right.arguments?.[0]?.node ?? -1]?.text).toBe(')')
    expect(prime.children).toHaveLength(3)
    expect(syntax.nodes.filter((node) => node.kind === 'script').map((node) => node.name)).toEqual(
      expect.arrayContaining(['prime', 'superscript']),
    )
  })

  it('covers matrices, choices, phantoms, alignment, and combining Unicode without normalization', () => {
    const content = [
      '$\\begin{matrix}a&b\\\\c&d\\end{matrix}$',
      '$\\begin{array}{cc}a&b\\end{array}$',
      '$\\begin{cases}x&y\\end{cases}$',
      '$\\begin{aligned}x&=y\\end{aligned}$',
      '$\\mathchoice{D}{T}{S}{SS}+\\phantom{x}+\\smash[b]{y}+x̂$',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })

    expect(
      syntax.nodes.filter((node) => node.kind === 'environment').map((node) => node.name),
    ).toEqual(['matrix', 'array', 'cases', 'aligned'])
    expect(argumentRoles(syntax.nodes.find((node) => node.name === 'mathchoice')!)).toEqual([
      'choice-display',
      'choice-text',
      'choice-script',
      'choice-scriptscript',
    ])
    expect(argumentRoles(syntax.nodes.find((node) => node.name === 'smash')!)).toEqual([
      'options',
      'body',
    ])
    const combining = syntax.nodes.find((node) => node.text === '̂')!
    expect(content.slice(combining.ranges.full.startOffset, combining.ranges.full.endOffset)).toBe(
      '̂',
    )
  })

  it('owns aligned rows and cells while retaining separator leaves', () => {
    const content = String.raw`\begin{align}a&=b\\c+d&=e\end{align}`
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const root = syntax.nodes[syntax.mathRoots[0]!.node]!
    const rows = root.children.map((node) => syntax.nodes[node]!)

    expect(rows.map((row) => [row.kind, row.name])).toEqual([
      ['alignment', 'row'],
      ['alignment', 'row'],
    ])
    expect(
      rows.map(
        (row) =>
          row.children
            .map((node) => syntax.nodes[node]!)
            .filter((node) => node.kind === 'alignment' && node.name === 'cell').length,
      ),
    ).toEqual([2, 2])
    expect(
      syntax.nodes.filter(
        (node) => node.kind === 'alignment' && (node.text === '&' || node.name === '\\'),
      ),
    ).toHaveLength(3)
  })

  it('exposes reviewed physics-package argument structure without derivative semantics', () => {
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content: String.raw`$\norm{x}+\pdv[2]{f}{x}$`,
      documentVersion: 1,
    })
    const command = (name: string) => syntax.nodes.find((node) => node.name === name)!

    expect(command('norm').kind).toBe('modifier')
    expect(argumentRoles(command('norm'))).toEqual(['nucleus'])
    expect(argumentRoles(command('pdv'))).toEqual(['degree', 'body', 'index'])
    expect(command('pdv').state).toBe('complete')
  })

  it('keeps every specified argument linked to its child and exact source range', () => {
    const content = '$\\sqrt[3]{x}+\\cfrac[l]{a}{b}+\\tensor{T}{^i_j}$'
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'stable',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })

    for (const [index, node] of syntax.nodes.entries()) {
      for (const argument of node.arguments ?? []) {
        expect(node.children).toContain(argument.node)
        expect(syntax.nodes[argument.node]!.parent).toBe(index)
        expect(argument.range).toEqual(syntax.nodes[argument.node]!.ranges.full)
      }
    }
  })
})

function argumentRoles(node: {
  arguments?: readonly { role: MathCommandArgumentRole }[]
}): MathCommandArgumentRole[] {
  return node.arguments?.map((argument) => argument.role) ?? []
}
