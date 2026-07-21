interface LatexCommand {
  name: string
  snippet: string
  detail?: string
  documentation?: string
  package?: string
}

interface LatexEnvironment {
  name: string
  snippet: string
  detail?: string
  package?: string
}

// --- Core LaTeX commands ---

const BASIC_COMMANDS: LatexCommand[] = [
  // Document structure
  {
    name: 'documentclass',
    snippet: '\\documentclass{$1}',
    detail: 'Document class',
    documentation: 'Declare the document class.',
  },
  {
    name: 'usepackage',
    snippet: '\\usepackage{$1}',
    detail: 'Use package',
    documentation: 'Load a LaTeX package.',
  },
  { name: 'begin', snippet: '\\begin{$1}\n\t$0\n\\end{$1}', detail: 'Begin environment' },
  { name: 'end', snippet: '\\end{$1}', detail: 'End environment' },

  // Sectioning
  { name: 'part', snippet: '\\part{$1}', detail: 'Part' },
  { name: 'chapter', snippet: '\\chapter{$1}', detail: 'Chapter' },
  { name: 'section', snippet: '\\section{$1}', detail: 'Section' },
  { name: 'subsection', snippet: '\\subsection{$1}', detail: 'Subsection' },
  { name: 'subsubsection', snippet: '\\subsubsection{$1}', detail: 'Subsubsection' },
  { name: 'paragraph', snippet: '\\paragraph{$1}', detail: 'Paragraph' },

  // References
  {
    name: 'label',
    snippet: '\\label{$1}',
    detail: 'Label',
    documentation: 'Define a label for cross-referencing.',
  },
  { name: 'ref', snippet: '\\ref{$1}', detail: 'Reference', documentation: 'Reference a label.' },
  { name: 'pageref', snippet: '\\pageref{$1}', detail: 'Page reference' },
  { name: 'eqref', snippet: '\\eqref{$1}', detail: 'Equation reference', package: 'amsmath' },
  { name: 'cite', snippet: '\\cite{$1}', detail: 'Citation' },

  // Text formatting
  { name: 'textbf', snippet: '\\textbf{$1}', detail: 'Bold text' },
  { name: 'textit', snippet: '\\textit{$1}', detail: 'Italic text' },
  { name: 'texttt', snippet: '\\texttt{$1}', detail: 'Monospace text' },
  { name: 'textsc', snippet: '\\textsc{$1}', detail: 'Small caps' },
  { name: 'underline', snippet: '\\underline{$1}', detail: 'Underline' },
  { name: 'emph', snippet: '\\emph{$1}', detail: 'Emphasis' },
  { name: 'textrm', snippet: '\\textrm{$1}', detail: 'Roman text' },
  { name: 'textsf', snippet: '\\textsf{$1}', detail: 'Sans-serif text' },

  // Font sizes
  { name: 'tiny', snippet: '\\tiny', detail: 'Tiny size' },
  { name: 'scriptsize', snippet: '\\scriptsize', detail: 'Script size' },
  { name: 'footnotesize', snippet: '\\footnotesize', detail: 'Footnote size' },
  { name: 'small', snippet: '\\small', detail: 'Small size' },
  { name: 'normalsize', snippet: '\\normalsize', detail: 'Normal size' },
  { name: 'large', snippet: '\\large', detail: 'Large size' },
  { name: 'Large', snippet: '\\Large', detail: 'Larger size' },
  { name: 'LARGE', snippet: '\\LARGE', detail: 'Very large size' },
  { name: 'huge', snippet: '\\huge', detail: 'Huge size' },
  { name: 'Huge', snippet: '\\Huge', detail: 'Largest size' },

  // Lists
  { name: 'item', snippet: '\\item $0', detail: 'List item' },

  // Footnotes & margin notes
  { name: 'footnote', snippet: '\\footnote{$1}', detail: 'Footnote' },
  { name: 'marginpar', snippet: '\\marginpar{$1}', detail: 'Margin note' },

  // Spacing
  { name: 'vspace', snippet: '\\vspace{$1}', detail: 'Vertical space' },
  { name: 'hspace', snippet: '\\hspace{$1}', detail: 'Horizontal space' },
  { name: 'newline', snippet: '\\newline', detail: 'New line' },
  { name: 'newpage', snippet: '\\newpage', detail: 'New page' },
  { name: 'clearpage', snippet: '\\clearpage', detail: 'Clear page' },
  { name: 'linebreak', snippet: '\\linebreak', detail: 'Line break' },
  { name: 'pagebreak', snippet: '\\pagebreak', detail: 'Page break' },
  { name: 'noindent', snippet: '\\noindent', detail: 'No indent' },

  // Definitions
  {
    name: 'newcommand',
    snippet: '\\newcommand{\\$1}{$2}',
    detail: 'New command',
    documentation: 'Define a new command.',
  },
  { name: 'renewcommand', snippet: '\\renewcommand{\\$1}{$2}', detail: 'Renew command' },
  { name: 'newenvironment', snippet: '\\newenvironment{$1}{$2}{$3}', detail: 'New environment' },

  // Includes
  {
    name: 'input',
    snippet: '\\input{$1}',
    detail: 'Input file',
    documentation: 'Include a file inline.',
  },
  {
    name: 'include',
    snippet: '\\include{$1}',
    detail: 'Include file',
    documentation: 'Include a file with \\clearpage.',
  },

  // Floats
  { name: 'caption', snippet: '\\caption{$1}', detail: 'Caption' },
  { name: 'centering', snippet: '\\centering', detail: 'Center content' },

  // Tables
  { name: 'hline', snippet: '\\hline', detail: 'Horizontal line' },
  { name: 'multicolumn', snippet: '\\multicolumn{$1}{$2}{$3}', detail: 'Multi-column cell' },

  // Bibliography
  { name: 'bibliography', snippet: '\\bibliography{$1}', detail: 'Bibliography file' },
  { name: 'bibliographystyle', snippet: '\\bibliographystyle{$1}', detail: 'Bibliography style' },

  // Title page
  { name: 'title', snippet: '\\title{$1}', detail: 'Title' },
  { name: 'author', snippet: '\\author{$1}', detail: 'Author' },
  { name: 'date', snippet: '\\date{$1}', detail: 'Date' },
  { name: 'maketitle', snippet: '\\maketitle', detail: 'Make title' },

  // Table of contents
  { name: 'tableofcontents', snippet: '\\tableofcontents', detail: 'Table of contents' },
  { name: 'listoffigures', snippet: '\\listoffigures', detail: 'List of figures' },
  { name: 'listoftables', snippet: '\\listoftables', detail: 'List of tables' },
]

const MATH_COMMANDS: LatexCommand[] = [
  // Fractions & roots
  {
    name: 'frac',
    snippet: '\\frac{$1}{$2}',
    detail: 'Fraction',
    documentation: 'Typeset a fraction \\frac{numerator}{denominator}.',
  },
  { name: 'dfrac', snippet: '\\dfrac{$1}{$2}', detail: 'Display fraction', package: 'amsmath' },
  { name: 'tfrac', snippet: '\\tfrac{$1}{$2}', detail: 'Text fraction', package: 'amsmath' },
  { name: 'sqrt', snippet: '\\sqrt{$1}', detail: 'Square root' },

  // Super/subscript helpers
  { name: 'overline', snippet: '\\overline{$1}', detail: 'Overline' },
  { name: 'underline', snippet: '\\underline{$1}', detail: 'Underline' },
  { name: 'hat', snippet: '\\hat{$1}', detail: 'Hat accent' },
  { name: 'bar', snippet: '\\bar{$1}', detail: 'Bar accent' },
  { name: 'tilde', snippet: '\\tilde{$1}', detail: 'Tilde accent' },
  { name: 'vec', snippet: '\\vec{$1}', detail: 'Vector arrow' },
  { name: 'dot', snippet: '\\dot{$1}', detail: 'Dot accent' },
  { name: 'ddot', snippet: '\\ddot{$1}', detail: 'Double dot accent' },

  // Big operators
  { name: 'sum', snippet: '\\sum_{$1}^{$2}', detail: 'Summation' },
  { name: 'prod', snippet: '\\prod_{$1}^{$2}', detail: 'Product' },
  { name: 'int', snippet: '\\int_{$1}^{$2}', detail: 'Integral' },
  { name: 'oint', snippet: '\\oint_{$1}^{$2}', detail: 'Contour integral' },
  { name: 'lim', snippet: '\\lim_{$1}', detail: 'Limit' },
  { name: 'inf', snippet: '\\inf_{$1}', detail: 'Infimum' },
  { name: 'sup', snippet: '\\sup_{$1}', detail: 'Supremum' },
  { name: 'max', snippet: '\\max_{$1}', detail: 'Maximum' },
  { name: 'min', snippet: '\\min_{$1}', detail: 'Minimum' },

  // Relations
  { name: 'leq', snippet: '\\leq', detail: 'Less or equal' },
  { name: 'geq', snippet: '\\geq', detail: 'Greater or equal' },
  { name: 'neq', snippet: '\\neq', detail: 'Not equal' },
  { name: 'approx', snippet: '\\approx', detail: 'Approximately' },
  { name: 'equiv', snippet: '\\equiv', detail: 'Equivalent' },
  { name: 'sim', snippet: '\\sim', detail: 'Similar' },
  { name: 'subset', snippet: '\\subset', detail: 'Subset' },
  { name: 'supset', snippet: '\\supset', detail: 'Superset' },
  { name: 'subseteq', snippet: '\\subseteq', detail: 'Subset or equal' },
  { name: 'supseteq', snippet: '\\supseteq', detail: 'Superset or equal' },
  { name: 'in', snippet: '\\in', detail: 'Element of' },
  { name: 'notin', snippet: '\\notin', detail: 'Not element of' },
  { name: 'cup', snippet: '\\cup', detail: 'Union' },
  { name: 'cap', snippet: '\\cap', detail: 'Intersection' },

  // Arrows
  { name: 'rightarrow', snippet: '\\rightarrow', detail: 'Right arrow' },
  { name: 'leftarrow', snippet: '\\leftarrow', detail: 'Left arrow' },
  { name: 'Rightarrow', snippet: '\\Rightarrow', detail: 'Double right arrow' },
  { name: 'Leftarrow', snippet: '\\Leftarrow', detail: 'Double left arrow' },
  { name: 'leftrightarrow', snippet: '\\leftrightarrow', detail: 'Both arrow' },
  { name: 'Leftrightarrow', snippet: '\\Leftrightarrow', detail: 'Double both arrow' },
  { name: 'mapsto', snippet: '\\mapsto', detail: 'Maps to' },
  { name: 'to', snippet: '\\to', detail: 'To arrow' },

  // Greek letters (lowercase)
  { name: 'alpha', snippet: '\\alpha', detail: 'Greek alpha' },
  { name: 'beta', snippet: '\\beta', detail: 'Greek beta' },
  { name: 'gamma', snippet: '\\gamma', detail: 'Greek gamma' },
  { name: 'delta', snippet: '\\delta', detail: 'Greek delta' },
  { name: 'epsilon', snippet: '\\epsilon', detail: 'Greek epsilon' },
  { name: 'varepsilon', snippet: '\\varepsilon', detail: 'Greek varepsilon' },
  { name: 'zeta', snippet: '\\zeta', detail: 'Greek zeta' },
  { name: 'eta', snippet: '\\eta', detail: 'Greek eta' },
  { name: 'theta', snippet: '\\theta', detail: 'Greek theta' },
  { name: 'iota', snippet: '\\iota', detail: 'Greek iota' },
  { name: 'kappa', snippet: '\\kappa', detail: 'Greek kappa' },
  { name: 'lambda', snippet: '\\lambda', detail: 'Greek lambda' },
  { name: 'mu', snippet: '\\mu', detail: 'Greek mu' },
  { name: 'nu', snippet: '\\nu', detail: 'Greek nu' },
  { name: 'xi', snippet: '\\xi', detail: 'Greek xi' },
  { name: 'pi', snippet: '\\pi', detail: 'Greek pi' },
  { name: 'rho', snippet: '\\rho', detail: 'Greek rho' },
  { name: 'sigma', snippet: '\\sigma', detail: 'Greek sigma' },
  { name: 'tau', snippet: '\\tau', detail: 'Greek tau' },
  { name: 'upsilon', snippet: '\\upsilon', detail: 'Greek upsilon' },
  { name: 'phi', snippet: '\\phi', detail: 'Greek phi' },
  { name: 'varphi', snippet: '\\varphi', detail: 'Greek varphi' },
  { name: 'chi', snippet: '\\chi', detail: 'Greek chi' },
  { name: 'psi', snippet: '\\psi', detail: 'Greek psi' },
  { name: 'omega', snippet: '\\omega', detail: 'Greek omega' },

  // Greek letters (uppercase)
  { name: 'Gamma', snippet: '\\Gamma', detail: 'Greek Gamma' },
  { name: 'Delta', snippet: '\\Delta', detail: 'Greek Delta' },
  { name: 'Theta', snippet: '\\Theta', detail: 'Greek Theta' },
  { name: 'Lambda', snippet: '\\Lambda', detail: 'Greek Lambda' },
  { name: 'Xi', snippet: '\\Xi', detail: 'Greek Xi' },
  { name: 'Pi', snippet: '\\Pi', detail: 'Greek Pi' },
  { name: 'Sigma', snippet: '\\Sigma', detail: 'Greek Sigma' },
  { name: 'Phi', snippet: '\\Phi', detail: 'Greek Phi' },
  { name: 'Psi', snippet: '\\Psi', detail: 'Greek Psi' },
  { name: 'Omega', snippet: '\\Omega', detail: 'Greek Omega' },

  // Delimiters
  { name: 'left', snippet: '\\left$1 $0 \\right$2', detail: 'Left delimiter' },
  { name: 'right', snippet: '\\right$1', detail: 'Right delimiter' },
  { name: 'langle', snippet: '\\langle', detail: 'Left angle bracket' },
  { name: 'rangle', snippet: '\\rangle', detail: 'Right angle bracket' },
  { name: 'lfloor', snippet: '\\lfloor', detail: 'Left floor' },
  { name: 'rfloor', snippet: '\\rfloor', detail: 'Right floor' },
  { name: 'lceil', snippet: '\\lceil', detail: 'Left ceiling' },
  { name: 'rceil', snippet: '\\rceil', detail: 'Right ceiling' },

  // Spacing in math
  { name: 'quad', snippet: '\\quad', detail: 'Quad space' },
  { name: 'qquad', snippet: '\\qquad', detail: 'Double quad space' },

  // Functions
  { name: 'sin', snippet: '\\sin', detail: 'Sine' },
  { name: 'cos', snippet: '\\cos', detail: 'Cosine' },
  { name: 'tan', snippet: '\\tan', detail: 'Tangent' },
  { name: 'log', snippet: '\\log', detail: 'Logarithm' },
  { name: 'ln', snippet: '\\ln', detail: 'Natural log' },
  { name: 'exp', snippet: '\\exp', detail: 'Exponential' },
  { name: 'det', snippet: '\\det', detail: 'Determinant' },
  { name: 'dim', snippet: '\\dim', detail: 'Dimension' },
  { name: 'ker', snippet: '\\ker', detail: 'Kernel' },

  // Misc math
  { name: 'cdot', snippet: '\\cdot', detail: 'Center dot' },
  { name: 'cdots', snippet: '\\cdots', detail: 'Center dots' },
  { name: 'ldots', snippet: '\\ldots', detail: 'Lower dots' },
  { name: 'vdots', snippet: '\\vdots', detail: 'Vertical dots' },
  { name: 'ddots', snippet: '\\ddots', detail: 'Diagonal dots' },
  { name: 'times', snippet: '\\times', detail: 'Times' },
  { name: 'div', snippet: '\\div', detail: 'Division' },
  { name: 'pm', snippet: '\\pm', detail: 'Plus-minus' },
  { name: 'mp', snippet: '\\mp', detail: 'Minus-plus' },
  { name: 'infty', snippet: '\\infty', detail: 'Infinity' },
  { name: 'partial', snippet: '\\partial', detail: 'Partial derivative' },
  { name: 'nabla', snippet: '\\nabla', detail: 'Nabla' },
  { name: 'forall', snippet: '\\forall', detail: 'For all' },
  { name: 'exists', snippet: '\\exists', detail: 'Exists' },
  { name: 'mathbb', snippet: '\\mathbb{$1}', detail: 'Blackboard bold', package: 'amsfonts' },
  { name: 'mathcal', snippet: '\\mathcal{$1}', detail: 'Calligraphic' },
  { name: 'mathfrak', snippet: '\\mathfrak{$1}', detail: 'Fraktur', package: 'amsfonts' },
  { name: 'mathrm', snippet: '\\mathrm{$1}', detail: 'Roman math' },
  { name: 'mathbf', snippet: '\\mathbf{$1}', detail: 'Bold math' },
  { name: 'text', snippet: '\\text{$1}', detail: 'Text in math', package: 'amsmath' },
  {
    name: 'operatorname',
    snippet: '\\operatorname{$1}',
    detail: 'Named operator',
    package: 'amsmath',
  },
]

const AMSMATH_COMMANDS: LatexCommand[] = [
  {
    name: 'align',
    snippet: '\\begin{align}\n\t$0\n\\end{align}',
    detail: 'Align environment',
    package: 'amsmath',
  },
  {
    name: 'equation',
    snippet: '\\begin{equation}\n\t$0\n\\end{equation}',
    detail: 'Equation environment',
  },
  {
    name: 'gather',
    snippet: '\\begin{gather}\n\t$0\n\\end{gather}',
    detail: 'Gather environment',
    package: 'amsmath',
  },
  { name: 'binom', snippet: '\\binom{$1}{$2}', detail: 'Binomial coefficient', package: 'amsmath' },
  {
    name: 'DeclareMathOperator',
    snippet: '\\DeclareMathOperator{\\$1}{$2}',
    detail: 'Declare operator',
    package: 'amsmath',
  },
]

const GRAPHICX_COMMANDS: LatexCommand[] = [
  {
    name: 'includegraphics',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Monaco snippet syntax
    snippet: '\\includegraphics[${1:width=\\textwidth}]{$2}',
    detail: 'Include image',
    package: 'graphicx',
    documentation: 'Include an image file.',
  },
  {
    name: 'graphicspath',
    snippet: '\\graphicspath{{$1}}',
    detail: 'Graphics path',
    package: 'graphicx',
  },
  { name: 'rotatebox', snippet: '\\rotatebox{$1}{$2}', detail: 'Rotate box', package: 'graphicx' },
  { name: 'scalebox', snippet: '\\scalebox{$1}{$2}', detail: 'Scale box', package: 'graphicx' },
  {
    name: 'resizebox',
    snippet: '\\resizebox{$1}{$2}{$3}',
    detail: 'Resize box',
    package: 'graphicx',
  },
]

const HYPERREF_COMMANDS: LatexCommand[] = [
  { name: 'href', snippet: '\\href{$1}{$2}', detail: 'Hyperlink', package: 'hyperref' },
  { name: 'url', snippet: '\\url{$1}', detail: 'URL', package: 'hyperref' },
  {
    name: 'autoref',
    snippet: '\\autoref{$1}',
    detail: 'Auto-named reference',
    package: 'hyperref',
  },
  {
    name: 'hypersetup',
    snippet: '\\hypersetup{$1}',
    detail: 'Hyperref setup',
    package: 'hyperref',
  },
  { name: 'nameref', snippet: '\\nameref{$1}', detail: 'Name reference', package: 'hyperref' },
]

export const LATEX_COMMANDS: LatexCommand[] = [
  ...BASIC_COMMANDS,
  ...MATH_COMMANDS,
  ...AMSMATH_COMMANDS,
  ...GRAPHICX_COMMANDS,
  ...HYPERREF_COMMANDS,
]

/** Pre-built map for O(1) command lookup by name */
const commandMap = new Map<string, LatexCommand>()
for (const cmd of LATEX_COMMANDS) {
  commandMap.set(cmd.name, cmd)
}

export function getCommandByName(name: string): LatexCommand | undefined {
  return commandMap.get(name)
}

// --- Environments ---

export const LATEX_ENVIRONMENTS: LatexEnvironment[] = [
  // Document
  {
    name: 'document',
    snippet: '\\begin{document}\n\t$0\n\\end{document}',
    detail: 'Document body',
  },

  // Lists
  {
    name: 'itemize',
    snippet: '\\begin{itemize}\n\t\\item $0\n\\end{itemize}',
    detail: 'Unordered list',
  },
  {
    name: 'enumerate',
    snippet: '\\begin{enumerate}\n\t\\item $0\n\\end{enumerate}',
    detail: 'Ordered list',
  },
  {
    name: 'description',
    snippet: '\\begin{description}\n\t\\item[$1] $0\n\\end{description}',
    detail: 'Description list',
  },

  // Math
  {
    name: 'equation',
    snippet: '\\begin{equation}\n\t$0\n\\end{equation}',
    detail: 'Numbered equation',
  },
  {
    name: 'equation*',
    snippet: '\\begin{equation*}\n\t$0\n\\end{equation*}',
    detail: 'Unnumbered equation',
  },
  {
    name: 'align',
    snippet: '\\begin{align}\n\t$0\n\\end{align}',
    detail: 'Aligned equations',
    package: 'amsmath',
  },
  {
    name: 'align*',
    snippet: '\\begin{align*}\n\t$0\n\\end{align*}',
    detail: 'Unnumbered aligned',
    package: 'amsmath',
  },
  {
    name: 'gather',
    snippet: '\\begin{gather}\n\t$0\n\\end{gather}',
    detail: 'Gathered equations',
    package: 'amsmath',
  },
  {
    name: 'gather*',
    snippet: '\\begin{gather*}\n\t$0\n\\end{gather*}',
    detail: 'Unnumbered gathered',
    package: 'amsmath',
  },
  {
    name: 'multline',
    snippet: '\\begin{multline}\n\t$0\n\\end{multline}',
    detail: 'Multi-line equation',
    package: 'amsmath',
  },
  {
    name: 'cases',
    snippet: '\\begin{cases}\n\t$1 & $2 \\\\\\\\\n\t$3 & $4\n\\end{cases}',
    detail: 'Cases',
    package: 'amsmath',
  },
  {
    name: 'matrix',
    snippet: '\\begin{matrix}\n\t$0\n\\end{matrix}',
    detail: 'Matrix (no delimiters)',
    package: 'amsmath',
  },
  {
    name: 'pmatrix',
    snippet: '\\begin{pmatrix}\n\t$0\n\\end{pmatrix}',
    detail: 'Matrix (parentheses)',
    package: 'amsmath',
  },
  {
    name: 'bmatrix',
    snippet: '\\begin{bmatrix}\n\t$0\n\\end{bmatrix}',
    detail: 'Matrix (brackets)',
    package: 'amsmath',
  },
  {
    name: 'vmatrix',
    snippet: '\\begin{vmatrix}\n\t$0\n\\end{vmatrix}',
    detail: 'Matrix (vertical bars)',
    package: 'amsmath',
  },

  // Floats
  {
    name: 'figure',
    snippet:
      '\\begin{figure}[' +
      '$' +
      '{1:htbp}' +
      ']\n\t\\centering\n\t$0\n\t\\caption{$2}\n\t\\label{fig:$3}\n\\end{figure}',
    detail: 'Figure float',
  },
  {
    name: 'table',
    snippet:
      '\\begin{table}[' +
      '$' +
      '{1:htbp}' +
      ']\n\t\\centering\n\t$0\n\t\\caption{$2}\n\t\\label{tab:$3}\n\\end{table}',
    detail: 'Table float',
  },
  { name: 'tabular', snippet: '\\begin{tabular}{$1}\n\t$0\n\\end{tabular}', detail: 'Tabular' },

  // Text
  { name: 'center', snippet: '\\begin{center}\n\t$0\n\\end{center}', detail: 'Centered text' },
  { name: 'quote', snippet: '\\begin{quote}\n\t$0\n\\end{quote}', detail: 'Block quote' },
  { name: 'verbatim', snippet: '\\begin{verbatim}\n$0\n\\end{verbatim}', detail: 'Verbatim text' },
  { name: 'abstract', snippet: '\\begin{abstract}\n\t$0\n\\end{abstract}', detail: 'Abstract' },
  {
    name: 'minipage',
    snippet: '\\begin{minipage}{$1}\n\t$0\n\\end{minipage}',
    detail: 'Mini page',
  },

  // Theorem-like
  { name: 'theorem', snippet: '\\begin{theorem}\n\t$0\n\\end{theorem}', detail: 'Theorem' },
  { name: 'lemma', snippet: '\\begin{lemma}\n\t$0\n\\end{lemma}', detail: 'Lemma' },
  { name: 'proof', snippet: '\\begin{proof}\n\t$0\n\\end{proof}', detail: 'Proof' },
  {
    name: 'definition',
    snippet: '\\begin{definition}\n\t$0\n\\end{definition}',
    detail: 'Definition',
  },
  { name: 'corollary', snippet: '\\begin{corollary}\n\t$0\n\\end{corollary}', detail: 'Corollary' },
  { name: 'remark', snippet: '\\begin{remark}\n\t$0\n\\end{remark}', detail: 'Remark' },
  { name: 'example', snippet: '\\begin{example}\n\t$0\n\\end{example}', detail: 'Example' },

  // TikZ
  {
    name: 'tikzpicture',
    snippet: '\\begin{tikzpicture}\n\t$0\n\\end{tikzpicture}',
    detail: 'TikZ picture',
    package: 'tikz',
  },
]

/** Pre-built map for environment lookup */
const envMap = new Map<string, LatexEnvironment>()
for (const env of LATEX_ENVIRONMENTS) {
  envMap.set(env.name, env)
}

export function getEnvironmentByName(name: string): LatexEnvironment | undefined {
  return envMap.get(name)
}

// --- Common packages ---

export const COMMON_PACKAGES = [
  'amsmath',
  'amssymb',
  'amsfonts',
  'amsthm',
  'graphicx',
  'xcolor',
  'hyperref',
  'geometry',
  'babel',
  'inputenc',
  'fontenc',
  'booktabs',
  'array',
  'multirow',
  'longtable',
  'tikz',
  'pgfplots',
  'listings',
  'minted',
  'algorithm2e',
  'algorithmicx',
  'biblatex',
  'natbib',
  'cite',
  'cleveref',
  'nameref',
  'subcaption',
  'caption',
  'float',
  'enumitem',
  'fancyhdr',
  'titlesec',
  'siunitx',
  'mathtools',
  'physics',
  'tcolorbox',
  'microtype',
  'setspace',
  'url',
  'csquotes',
  'etoolbox',
]
