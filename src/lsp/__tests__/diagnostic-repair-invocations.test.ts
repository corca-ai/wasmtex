import { describe, expect, it } from 'vitest'
import { repairInvocations } from '../diagnostic-repair-invocations'
import { parseLatexFile } from '../latex-parser'
import { getCommandSignature } from '../package-db'

function missing(source: string) {
  return repairInvocations(source, parseLatexFile(source, 'main.tex'), {
    getCommandArguments: getCommandSignature,
  })
    .filter((item) => item.consumption.missing.length)
    .map((item) => item.name)
}

describe('repair invocation ownership', () => {
  it('does not repair a command consumed as another invocation’s unbraced argument', () => {
    expect(missing(String.raw`\frac{a}\sqrt`)).toEqual([])
    expect(missing(String.raw`\frac\sqrt{x}`)).toEqual([])
    expect(missing(String.raw`\frac{\sqrt}{x}`)).toEqual(['sqrt'])
  })

  it('does not treat resource names, labels and unknown command groups as executable prose', () => {
    for (const source of [
      String.raw`\label{\frac}`,
      String.raw`\input{\frac}`,
      String.raw`\unknown{\frac}`,
    ])
      expect(missing(source)).toEqual([])
    expect(missing(String.raw`\textbf{\emph}`)).toEqual(['emph'])
  })

  it('uses the parser mask for inactive, verbatim and definition-template commands', () => {
    const source = String.raw`% \frac
\verb|\frac|\iffalse\sqrt\fi
\newcommand{\uninvoked}{\frac}
{\frac{a}}`
    expect(missing(source)).toEqual(['frac'])
  })

  it('does not invent argument boundaries after an unknown grammar', () => {
    expect(missing(String.raw`\unknown x\frac`)).toEqual([])
    expect(missing(String.raw`{\unknown x\frac}{\sqrt}`)).toEqual(['sqrt'])
  })

  it('keeps commands inside an incomplete argument opaque', () => {
    expect(missing(String.raw`\frac{\sqrt`)).toEqual([])
    expect(missing(String.raw`{\frac{a}~\sqrt}{\emph}`)).toEqual(['emph'])
  })

  it('cancels without returning partial repair candidates', () => {
    const source = String.raw`{\frac}{\sqrt}`
    expect(
      repairInvocations(
        source,
        parseLatexFile(source, 'main.tex'),
        { getCommandArguments: getCommandSignature },
        { isCancellationRequested: true },
      ),
    ).toEqual([])
  })
})
