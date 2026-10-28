import { describe, expect, it } from 'vitest'
import { getReferenceOccurrences } from '../reference-occurrences'

describe('literal reference occurrences', () => {
  it('returns complete clusters and UTF-16 command ranges', () => {
    const source = String.raw`😀 \label{eq:x} \eqref{eq:x} \cite{first, second}`
    const occurrences = getReferenceOccurrences(source)
    expect(occurrences.map((item) => [item.command, item.keys])).toEqual([
      ['label', ['eq:x']],
      ['eqref', ['eq:x']],
      ['cite', ['first', 'second']],
    ])
    expect(occurrences[0]?.from).toBe(3)
    expect(source.slice(occurrences[2]!.from, occurrences[2]!.to)).toBe(
      String.raw`\cite{first, second}`,
    )
  })
  it('combines comment, verbatim and conditional masks regardless of their collection order', () => {
    for (const hidden of [
      String.raw`\begin{verbatim}\ref{hidden}\end{verbatim}`,
      String.raw`\iffalse \ref{hidden} \fi`,
      String.raw`\begin{verbatim}% nested comment
\ref{hidden}\end{verbatim}`,
    ]) {
      const source = `${hidden}\n% later comment\n\\ref{visible}`
      expect(getReferenceOccurrences(source).map((item) => item.keys)).toEqual([['visible']])
    }
  })
  it('does not reinterpret comments, verbatim, escapes or unsupported syntax', () => {
    expect(
      getReferenceOccurrences(String.raw`% \ref{x}
\verb|\cite{a}| \\ref{x} \ref{\key} \cite[see]{a} \citep{a} \ref{x,y} \label{#1}`),
    ).toEqual([])
  })
})
