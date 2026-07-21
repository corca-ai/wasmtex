import { describe, expect, it } from 'vitest'
import { parseTraceFile } from '../trace-parser'

describe('parseTraceFile', () => {
  it('parses labels and refs', () => {
    const trace = parseTraceFile('L:sec:intro\nR:sec:intro\nL:eq:1\nR:fig:2')
    expect(trace.labels).toEqual(new Set(['sec:intro', 'eq:1']))
    expect(trace.refs).toEqual(new Set(['sec:intro', 'fig:2']))
  })

  it('handles empty input', () => {
    const trace = parseTraceFile('')
    expect(trace.labels.size).toBe(0)
    expect(trace.refs.size).toBe(0)
  })

  it('ignores unknown prefixes', () => {
    const trace = parseTraceFile('L:foo\nX:bar\nR:baz\nrandom line')
    expect(trace.labels).toEqual(new Set(['foo']))
    expect(trace.refs).toEqual(new Set(['baz']))
  })

  it('deduplicates keys', () => {
    const trace = parseTraceFile('L:dup\nL:dup\nR:dup\nR:dup')
    expect(trace.labels.size).toBe(1)
    expect(trace.refs.size).toBe(1)
  })

  it('handles labels with special characters', () => {
    const trace = parseTraceFile('L:sec:my-label_1\nR:eq:a.b')
    expect(trace.labels.has('sec:my-label_1')).toBe(true)
    expect(trace.refs.has('eq:a.b')).toBe(true)
  })

  it('handles CRLF line endings without polluting keys', () => {
    // A `\r` left on the key would never match the (\n-split, trimmed) source keys.
    const trace = parseTraceFile('L:fig:a\r\nR:fig:b\r\n')
    expect(trace.labels.has('fig:a')).toBe(true)
    expect(trace.refs.has('fig:b')).toBe(true)
  })
})
