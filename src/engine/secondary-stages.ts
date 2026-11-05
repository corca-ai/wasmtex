import { stripTexComments } from './tex-comments'

/**
 * What a document asks of makeindex and BibTeX beyond `\jobname.idx` and `\jobname.aux`.
 * latexmk users write these rules by hand, and Overleaf ships them as defaults; without
 * them nomenclature, glossaries, extra indexes and extra bibliographies come out empty
 * with no error.
 */
export interface IndexJob {
  input: string
  output: string
  /** A TeX Live style, or one LaTeX wrote next to the document. */
  style?: string
  log?: string
  letterOrder?: boolean
}

const NEW_GLOSSARY = /\\@newglossary\{[^}]*\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}/g
const ISTFILE = /\\@istfilename\{([^}]*)\}/
const LETTER_ORDER = /\\@glsorder\{letter\}/
const NEW_INDEX = /\\newindex\s*\{[^}]*\}\s*\{([^}]+)\}\s*\{([^}]+)\}/g
const MAKE_INDEX_OPTIONS = /\\makeindex\s*\[([^\]]*)\]/g
const MAKE_INDEX_NAMED = /\\makeindex\s*\{([^}]+)\}/g
const NEW_CITES = /\\newcites\s*\{([^}]+)\}/g
const INPUT_AUX = /^\\@input\{([^}]+)\.aux\}/gm

function option(options: string, key: string): string | undefined {
  const match = new RegExp(`(?:^|,)\\s*${key}\\s*=\\s*(\\{[^}]*\\}|[^,]*)`).exec(options)
  return match?.[1]?.replace(/^\{|\}$/g, '').trim()
}

function namedIndexJob(options: string): IndexJob | null {
  const name = option(options, 'name')
  if (!name || /^(?:xindy|texindy)$/.test(option(options, 'program') ?? '')) return null
  const flags = option(options, 'options') ?? ''
  const style = /(?:^|\s)-s\s*(\S+)/.exec(flags)?.[1]
  return {
    input: `${name}.idx`,
    output: `${name}.ind`,
    ...(style ? { style } : {}),
    ...(/(?:^|\s)-l(?:\s|$)/.test(flags) ? { letterOrder: true } : {}),
  }
}

function glossaryJobs(mainBase: string, aux: string): IndexJob[] {
  const style = ISTFILE.exec(aux)?.[1]
  // The xindy option writes a .xdy module, which is a server stage's input.
  if (!style || style.endsWith('.xdy')) return []
  const letterOrder = LETTER_ORDER.test(aux)
  return [...aux.matchAll(NEW_GLOSSARY)].map(([, log, output, input]) => ({
    input: `${mainBase}.${input}`,
    output: `${mainBase}.${output}`,
    style,
    log: `${mainBase}.${log}`,
    ...(letterOrder ? { letterOrder } : {}),
  }))
}

export function secondaryIndexJobs(mainBase: string, sources: string[], aux: string): IndexJob[] {
  const code = sources.map(stripTexComments).join('\n')
  const jobs = glossaryJobs(mainBase, aux)
  if (/\\makenomenclature\b/.test(code)) {
    jobs.push({
      input: `${mainBase}.nlo`,
      output: `${mainBase}.nls`,
      style: 'nomencl.ist',
      log: `${mainBase}.nlg`,
    })
  }
  for (const [, input, output] of code.matchAll(NEW_INDEX)) {
    jobs.push({ input: `${mainBase}.${input}`, output: `${mainBase}.${output}` })
  }
  for (const [, options] of code.matchAll(MAKE_INDEX_OPTIONS)) {
    const job = namedIndexJob(options ?? '')
    if (job) jobs.push(job)
  }
  for (const [, name] of code.matchAll(MAKE_INDEX_NAMED)) {
    jobs.push({ input: `${name}.idx`, output: `${name}.ind` })
  }
  return [...new Map(jobs.map((job) => [job.output, job])).values()]
}

/** Aux files BibTeX runs on by name: multibib's lists and chapterbib's chapters. bibunits
 *  numbers its units, so {@link usesBibunits} tells the caller to read until one is missing. */
export function secondaryAuxBases(sources: string[], aux: string): string[] {
  const code = sources.map(stripTexComments).join('\n')
  const bases = [...code.matchAll(NEW_CITES)].flatMap(([, names]) =>
    (names ?? '').split(',').map((name) => name.trim()),
  )
  if (/\\usepackage(?:\[[^\]]*\])?\{[^}]*\bchapterbib\b/.test(code)) {
    bases.push(...[...aux.matchAll(INPUT_AUX)].map(([, base]) => base ?? ''))
  }
  return [...new Set(bases.filter(Boolean))]
}

export function usesBibunits(sources: string[]): boolean {
  return sources.some((source) =>
    /\\begin\{bibunit\}|\\bibliographyunit\b/.test(stripTexComments(source)),
  )
}
