/** Skeleton body for a newly-created project file, chosen by extension.
 *  `.tex` (or an extension-less name) gets an article stub; `.bib` gets a
 *  sample entry; anything else (e.g. binary/image files) gets empty content. */
export function defaultFileContent(path: string): string {
  // Judge by the basename (a dotted *directory* like `v1.2/intro` must not be read as an
  // extension) and case-insensitively (`.TEX`/`.BIB` are still tex/bib), matching the
  // project's lowercase-then-compare convention for extensions.
  const name = path.slice(path.lastIndexOf('/') + 1)
  const lower = name.toLowerCase()
  if (lower.endsWith('.tex') || !name.includes('.')) {
    return `\\documentclass{article}
\\begin{document}

\\end{document}
`
  }

  if (lower.endsWith('.bib')) {
    return `@article{example,
  title={Example},
}
`
  }

  return ''
}
