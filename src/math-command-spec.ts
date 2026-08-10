export type TexMathClass =
  | 'ordinary'
  | 'operator'
  | 'binary'
  | 'relation'
  | 'opening'
  | 'closing'
  | 'punctuation'
  | 'inner'

export type MathCommandBehavior =
  | 'atom'
  | 'modifier'
  | 'style'
  | 'named-surface'
  | 'fraction'
  | 'root'
  | 'delimiter'
  | 'alignment'
  | 'spacing'
  | 'no-op'
  | 'text'
  | 'opaque'

export type MathCommandArgumentRole =
  | 'nucleus'
  | 'body'
  | 'name'
  | 'numerator'
  | 'denominator'
  | 'degree'
  | 'radicand'
  | 'annotation'
  | 'base'
  | 'subscript'
  | 'superscript'
  | 'index'
  | 'left'
  | 'right'
  | 'choice-display'
  | 'choice-text'
  | 'choice-script'
  | 'choice-scriptscript'
  | 'content'
  | 'options'
  | 'value'
  | 'unit'
  | 'delimiter'

export interface MathCommandArgumentSpec {
  readonly syntax: 'required' | 'optional'
  readonly role: MathCommandArgumentRole
  readonly consumption?: 'atom' | 'token'
}

export interface MathCommandProvenance {
  readonly source: 'tex' | 'latex-kernel' | 'amsmath' | 'mathtools' | 'unicode-math' | 'package'
  readonly package?: string
  readonly confidence: 'exact' | 'curated'
}

/** Neutral structural metadata. It must not encode mathematical meaning. */
export interface MathCommandSpec {
  readonly name: string
  readonly behavior: MathCommandBehavior
  readonly arguments: readonly MathCommandArgumentSpec[]
  readonly mathClass?: TexMathClass
  readonly acceptsStar?: boolean
  readonly expansion: 'structural' | 'opaque' | 'ignore'
  readonly provenance: MathCommandProvenance
}

const TEX = { source: 'tex', confidence: 'exact' } as const
const LATEX = { source: 'latex-kernel', confidence: 'exact' } as const
const AMS = { source: 'amsmath', package: 'amsmath', confidence: 'curated' } as const
const AMSFONTS = { source: 'package', package: 'amsfonts', confidence: 'curated' } as const
const MATHTOOLS = { source: 'mathtools', package: 'mathtools', confidence: 'curated' } as const
const UNICODE_MATH = {
  source: 'unicode-math',
  package: 'unicode-math',
  confidence: 'curated',
} as const

const required = (
  role: MathCommandArgumentRole,
  consumption: 'atom' | 'token' = 'atom',
): MathCommandArgumentSpec => ({
  syntax: 'required',
  role,
  ...(consumption === 'atom' ? {} : { consumption }),
})
const optional = (role: MathCommandArgumentRole): MathCommandArgumentSpec => ({
  syntax: 'optional',
  role,
})

function family(
  names: readonly string[],
  behavior: MathCommandBehavior,
  provenance: MathCommandProvenance,
  arguments_: readonly MathCommandArgumentSpec[] = [],
  options: Pick<MathCommandSpec, 'acceptsStar' | 'expansion' | 'mathClass'> = {
    expansion: 'structural',
  },
): MathCommandSpec[] {
  return names.map((name) => ({
    name,
    behavior,
    arguments: arguments_,
    provenance,
    expansion: options.expansion,
    ...(options.acceptsStar === undefined ? {} : { acceptsStar: options.acceptsStar }),
    ...(options.mathClass === undefined ? {} : { mathClass: options.mathClass }),
  }))
}

const AUTHORED_SPECS: MathCommandSpec[] = [
  ...family(
    [
      'acute',
      'bar',
      'breve',
      'check',
      'ddot',
      'dot',
      'grave',
      'hat',
      'mathring',
      'tilde',
      'vec',
      'widehat',
      'widetilde',
    ],
    'modifier',
    LATEX,
    [required('nucleus')],
  ),
  ...family(['overbrace', 'overline', 'underline', 'underbrace'], 'modifier', TEX, [
    required('nucleus'),
  ]),
  ...family(['overset', 'stackrel', 'underset'], 'modifier', AMS, [
    required('annotation'),
    required('nucleus'),
  ]),
  ...family(['accentset', 'underaccent'], 'modifier', MATHTOOLS, [
    required('annotation'),
    required('nucleus'),
  ]),
  ...family(
    ['mathbf', 'mathcal', 'mathit', 'mathrm', 'mathsf', 'mathtt', 'mathnormal'],
    'style',
    LATEX,
    [required('body')],
  ),
  ...family(['mathbb', 'mathfrak'], 'style', AMSFONTS, [required('body')]),
  ...family(['boldsymbol', 'pmb'], 'style', AMS, [required('body')]),
  ...family(
    [
      'symbf',
      'symbfit',
      'symcal',
      'symfrak',
      'symit',
      'symnormal',
      'symrm',
      'symsf',
      'symsfit',
      'symtt',
      'symbb',
    ],
    'style',
    UNICODE_MATH,
    [required('body')],
  ),
  ...family(['operatorname'], 'named-surface', AMS, [required('name')], {
    expansion: 'structural',
    acceptsStar: true,
    mathClass: 'operator',
  }),
  ...family(
    [
      'arccos',
      'arcsin',
      'arctan',
      'arg',
      'cos',
      'cosh',
      'cot',
      'coth',
      'csc',
      'deg',
      'det',
      'dim',
      'exp',
      'gcd',
      'hom',
      'inf',
      'ker',
      'lg',
      'lim',
      'liminf',
      'limsup',
      'ln',
      'log',
      'max',
      'min',
      'Pr',
      'sec',
      'sin',
      'sinh',
      'sup',
      'tan',
      'tanh',
    ],
    'named-surface',
    TEX,
    [],
    { expansion: 'structural', mathClass: 'operator' },
  ),
  ...family(['frac'], 'fraction', LATEX, [required('numerator'), required('denominator')]),
  ...family(['dfrac', 'tfrac', 'binom', 'dbinom', 'tbinom'], 'fraction', AMS, [
    required('numerator'),
    required('denominator'),
  ]),
  ...family(['cfrac'], 'fraction', AMS, [
    optional('options'),
    required('numerator'),
    required('denominator'),
  ]),
  ...family(['sqrt'], 'root', LATEX, [optional('degree'), required('radicand')]),
  ...family(
    [
      'sum',
      'prod',
      'coprod',
      'int',
      'oint',
      'bigcap',
      'bigcup',
      'bigsqcup',
      'bigvee',
      'bigwedge',
      'bigodot',
      'bigoplus',
      'bigotimes',
      'biguplus',
    ],
    'atom',
    TEX,
    [],
    { expansion: 'structural', mathClass: 'operator' },
  ),
  ...family(['iint', 'iiint', 'iiiint'], 'atom', AMS, [], {
    expansion: 'structural',
    mathClass: 'operator',
  }),
  ...family(['mathord'], 'atom', TEX, [required('nucleus')], {
    expansion: 'structural',
    mathClass: 'ordinary',
  }),
  ...family(['mathop'], 'atom', TEX, [required('nucleus')], {
    expansion: 'structural',
    mathClass: 'operator',
  }),
  ...family(['mathbin'], 'atom', TEX, [required('nucleus')], {
    expansion: 'structural',
    mathClass: 'binary',
  }),
  ...family(['mathrel'], 'atom', TEX, [required('nucleus')], {
    expansion: 'structural',
    mathClass: 'relation',
  }),
  ...family(['mathopen'], 'delimiter', TEX, [required('nucleus')], {
    expansion: 'structural',
    mathClass: 'opening',
  }),
  ...family(['mathclose'], 'delimiter', TEX, [required('nucleus')], {
    expansion: 'structural',
    mathClass: 'closing',
  }),
  ...family(['mathinner'], 'atom', TEX, [required('nucleus')], {
    expansion: 'structural',
    mathClass: 'inner',
  }),
  ...family(['left', 'right', 'middle', 'big', 'Big', 'bigg', 'Bigg'], 'delimiter', TEX, [
    required('delimiter', 'token'),
  ]),
  ...family(
    ['langle', 'lbrace', 'lceil', 'lfloor', 'lgroup', 'lmoustache', 'lvert', 'lVert'],
    'atom',
    TEX,
    [],
    { expansion: 'structural', mathClass: 'opening' },
  ),
  ...family(
    ['rangle', 'rbrace', 'rceil', 'rfloor', 'rgroup', 'rmoustache', 'rvert', 'rVert'],
    'atom',
    TEX,
    [],
    { expansion: 'structural', mathClass: 'closing' },
  ),
  ...family(['prime', 'top', 'bot', 'dagger', 'ddagger', 'ast', 'star'], 'atom', TEX),
  ...family(['prescript'], 'atom', MATHTOOLS, [
    required('superscript'),
    required('subscript'),
    required('base'),
  ]),
  ...family(['sideset'], 'atom', AMS, [required('left'), required('right'), required('base')]),
  ...family(['mathchoice'], 'style', TEX, [
    required('choice-display'),
    required('choice-text'),
    required('choice-script'),
    required('choice-scriptscript'),
  ]),
  ...family(['phantom', 'hphantom', 'vphantom'], 'style', LATEX, [required('body')]),
  ...family(['smash'], 'style', AMS, [optional('options'), required('body')]),
  ...family(['text'], 'text', AMS, [required('content')]),
  ...family(['mbox', 'textrm', 'textsf', 'texttt', 'textnormal'], 'text', LATEX, [
    required('content'),
  ]),
  ...family(
    [
      '!',
      ',',
      ':',
      ';',
      'enspace',
      'enskip',
      'quad',
      'qquad',
      'thinspace',
      'medspace',
      'thickspace',
    ],
    'spacing',
    LATEX,
    [],
    { expansion: 'ignore' },
  ),
  ...family(['limits', 'nolimits', 'displaylimits'], 'no-op', TEX, [], {
    expansion: 'ignore',
  }),
  ...family(['\\', 'cr'], 'alignment', TEX),
  ...family(['substack'], 'alignment', AMS, [required('body')]),
  ...family(
    ['tensor'],
    'opaque',
    { source: 'package', package: 'tensor', confidence: 'curated' },
    [required('base'), required('index')],
    { expansion: 'opaque' },
  ),
  ...family(
    ['qty', 'SI'],
    'opaque',
    { source: 'package', package: 'siunitx', confidence: 'curated' },
    [optional('options'), required('value'), required('unit')],
    { expansion: 'opaque' },
  ),
  ...family(
    ['si', 'unit'],
    'opaque',
    { source: 'package', package: 'siunitx', confidence: 'curated' },
    [optional('options'), required('unit')],
    { expansion: 'opaque' },
  ),
  ...family(
    ['ce', 'ch'],
    'opaque',
    { source: 'package', package: 'mhchem', confidence: 'curated' },
    [required('content')],
    { expansion: 'opaque' },
  ),
  ...family(
    ['bra', 'ket', 'braket', 'Bra', 'Ket'],
    'opaque',
    { source: 'package', package: 'braket', confidence: 'curated' },
    [required('content')],
    { expansion: 'opaque' },
  ),
].sort((left, right) => left.name.localeCompare(right.name))

export const MATH_COMMAND_SPECS: readonly MathCommandSpec[] = Object.freeze(
  AUTHORED_SPECS.map((spec) =>
    Object.freeze({
      ...spec,
      arguments: Object.freeze([...spec.arguments]),
      provenance: Object.freeze({ ...spec.provenance }),
    }),
  ),
)

const SPEC_BY_NAME = new Map<string, MathCommandSpec>()
for (const spec of MATH_COMMAND_SPECS) {
  if (SPEC_BY_NAME.has(spec.name)) throw new Error(`Duplicate MathCommandSpec: ${spec.name}`)
  SPEC_BY_NAME.set(spec.name, spec)
}

export function getMathCommandSpec(name: string): MathCommandSpec | undefined {
  return SPEC_BY_NAME.get(name)
}
