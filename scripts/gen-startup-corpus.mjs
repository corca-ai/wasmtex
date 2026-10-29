#!/usr/bin/env node
// Reproducible synthetic startup/edit workloads; benchmark with profile-font-cpu.mjs.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const out = resolve(process.argv[2] || 'report/startup-corpus')
await mkdir(out, { recursive: true })
const paragraph = 'Every function preserves structure. Composition respects identity and associativity. We study a family of mappings and its computational interpretation. '
const sections = count => Array.from({ length: count }, (_, i) =>
  `\\section{Analysis ${i}}\\label{s${i}}\n${Array(3).fill(paragraph.repeat(5)).join('\n\n')}\n\\begin{equation} f_${i}(x)=\\sum_{k=1}^{20}\\frac{k^2}{k+1} \\end{equation}\n`).join('\n')
const document = (preamble, body) => `\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\nFont CPU probe.\n\\end{document}`
const math = '\\usepackage{amsmath,amssymb,hyperref}'
const cases = {
  plain: { source: document('', 'A short note.') },
  paper: { source: document(math, 'Opening paragraph.\\par\n' + sections(9)) },
  large: { source: document(math, 'Opening paragraph.\\par\n' + sections(55)) },
  bibliography: {
    source: document('\\usepackage{natbib,hyperref}', 'A result \\citep{sample}.\n' + sections(3) + '\n\\bibliographystyle{plainnat}\\bibliography{refs}'),
    files: { 'refs.bib': '@article{sample,author={Ada Example},title={A Sample Result},journal={Example Journal},year={2020},volume={1},pages={1--9}}' },
  },
  tikzcd: {
    source: document('\\usepackage{tikz-cd}', '\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\n'.repeat(4) + '\\begin{tikzcd} A \\arrow[r] & B \\end{tikzcd}'),
    compilerOptions: { tikzExternalization: { mode: 'auto', workers: 1, idleMs: 0 } },
  },
  lookup: {
    source: document(String.raw`\IfFileExists{/tex/hyperref.sty}{\def\beforepackage{present}}{\def\beforepackage{absent}}
\usepackage{amsmath,hyperref}
\IfFileExists{/tex/hyperref.sty}{\def\afterpackage{present}}{\def\afterpackage{absent}}`, String.raw`
Before package: \beforepackage. After package: \afterpackage.
Before font: \IfFileExists{/tex/cmr12.tfm}{present}{absent}.
{\font\probe=cmr12 \probe Loaded font.}
After font: \IfFileExists{/tex/cmr12.tfm}{present}{absent}.`),
  },
}
// A failed externalization pass can still create TeX files. These probes prevent
// treating that pass as disposable work without proving equivalent file effects.
cases['tikzcd-aux-branch'] = {
  ...cases.tikzcd,
  source: cases.tikzcd.source.replace('\\begin{document}', String.raw`\IfFileExists{main.aux}{\def\auxstate{Prior auxiliary present.}}{\def\auxstate{First auxiliary absent.}}
\begin{document}\auxstate`),
}
cases['tikzcd-side-effect'] = {
  ...cases.tikzcd,
  source: cases.tikzcd.source.replace('\\begin{document}', String.raw`\newwrite\probeoutput
\begin{document}
\IfFileExists{probe.dat}{Prior output present.}{First output absent.}
\immediate\openout\probeoutput=probe.dat
\immediate\write\probeoutput{proof}\immediate\closeout\probeoutput`),
}
for (const [name, { source, files, compilerOptions }] of Object.entries(cases)) {
  await writeFile(resolve(out, `${name}.json`), JSON.stringify({
    mainFile: 'main.tex', files: { 'main.tex': source, ...files }, compilerOptions,
    stages: {
      'body-edit': source.replace('Font CPU probe.', 'Body edited: another font CPU probe.'),
      'preamble-edit': source.replace('\\documentclass{article}', '\\documentclass[12pt]{article}'),
      restore: source,
    },
  }, null, 2) + '\n')
}
console.log(`Wrote ${Object.keys(cases).join(', ')} to ${out}`)
