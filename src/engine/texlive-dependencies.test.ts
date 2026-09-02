import { describe, expect, it } from 'vitest'
import type { CompletionSnapshotProfile, ResolverEvidenceReport } from '../types'
import { buildTexliveDependencySet, mergeTexliveDependencySets } from './texlive-dependencies'

const profile: CompletionSnapshotProfile = { id: 'p', texliveYear: '2025', mirrorRevision: 'r1' }

function report(
  entries: ResolverEvidenceReport['entries'],
  complete = true,
): ResolverEvidenceReport {
  return { schemaVersion: 1, profile, entries, dropped: complete ? 0 : 1, complete }
}

describe('buildTexliveDependencySet', () => {
  it('returns nothing without resolver evidence', () => {
    expect(buildTexliveDependencySet('2025', profile, [undefined])).toBeUndefined()
    expect(buildTexliveDependencySet('2025', profile, [])).toBeUndefined()
  })

  it('unions passes, keeps the mirror candidate from the pass that saw the network', () => {
    const first = report([
      {
        stage: 'pdftex',
        requestedName: 'ptmr7t.vf',
        format: 33,
        outcome: 'resolved',
        attempts: [
          { source: 'network', outcome: 'not-found', candidate: 'ptmr7t.vf', status: 404 },
          { source: 'network', outcome: 'hit', candidate: 'ptmr7t', status: 200 },
        ],
      },
      {
        stage: 'pdftex',
        requestedName: 'article.cls',
        format: 26,
        outcome: 'resolved',
        attempts: [{ source: 'network', outcome: 'hit', candidate: 'article.cls', status: 200 }],
      },
      {
        stage: 'pdftex',
        requestedName: 'pdflatex.fmt',
        format: 10,
        outcome: 'resolved',
        attempts: [{ source: 'warmup-cache', outcome: 'hit' }],
      },
      {
        stage: 'pdftex',
        requestedName: 'missing.sty',
        format: 26,
        outcome: 'mirror-absent',
        attempts: [{ source: 'network', outcome: 'not-found', status: 404 }],
      },
    ])
    const rerun = report([
      {
        stage: 'pdftex',
        requestedName: 'ptmr7t.vf',
        format: 33,
        outcome: 'resolved',
        attempts: [{ source: 'session-cache', outcome: 'hit' }],
      },
      {
        stage: 'pdftex',
        requestedName: 'hyperref.sty',
        format: 26,
        outcome: 'resolved',
        attempts: [{ source: 'network', outcome: 'hit', candidate: 'hyperref.sty', status: 200 }],
      },
      {
        stage: 'pdftex',
        requestedName: 'missing.sty',
        format: 26,
        outcome: 'mirror-absent',
        attempts: [{ source: 'session-cache', outcome: 'not-found' }],
      },
    ])
    const set = buildTexliveDependencySet('2025', profile, [first, rerun])!
    expect(set).toMatchObject({ schemaVersion: 1, texliveVersion: '2025', profile, complete: true })
    expect(set.files).toEqual([
      { format: 33, filename: 'ptmr7t.vf', candidate: 'ptmr7t' },
      { format: 26, filename: 'article.cls' },
      { format: 26, filename: 'hyperref.sty' },
      // pdfTeX loads the font map outside kpathsea; always part of a pdfTeX set.
      { format: 11, filename: 'pdftex.map' },
    ])
    expect(set.notFound).toEqual([{ format: 26, filename: 'missing.sty' }])
  })

  it('takes the candidate from a later pass when the first pass only saw a cache hit', () => {
    const cached = report([
      {
        stage: 'pdftex',
        requestedName: 'cmr12',
        format: 3,
        outcome: 'resolved',
        attempts: [{ source: 'persistent-cache', outcome: 'hit' }],
      },
    ])
    const network = report([
      {
        stage: 'pdftex',
        requestedName: 'cmr12',
        format: 3,
        outcome: 'resolved',
        attempts: [
          { source: 'network', outcome: 'not-found', candidate: 'cmr12', status: 404 },
          { source: 'network', outcome: 'hit', candidate: 'cmr12.tfm', status: 200 },
        ],
      },
    ])
    const set = buildTexliveDependencySet('2026', profile, [cached, network])!
    expect(set.files).toEqual([
      { format: 3, filename: 'cmr12', candidate: 'cmr12.tfm' },
      { format: 11, filename: 'pdftex.map' },
    ])
  })

  it('drops a not-found entry once any pass resolves the same request', () => {
    const absent = report([
      {
        stage: 'pdftex',
        requestedName: 'late.sty',
        format: 26,
        outcome: 'mirror-absent',
        attempts: [{ source: 'bloom-filter', outcome: 'not-found' }],
      },
    ])
    const resolved = report([
      {
        stage: 'pdftex',
        requestedName: 'late.sty',
        format: 26,
        outcome: 'resolved',
        attempts: [{ source: 'network', outcome: 'hit', candidate: 'late.sty', status: 200 }],
      },
    ])
    const set = buildTexliveDependencySet('2025', profile, [absent, resolved])!
    expect(set.files).toEqual([
      { format: 26, filename: 'late.sty' },
      { format: 11, filename: 'pdftex.map' },
    ])
    expect(set.notFound).toEqual([])
  })

  it('reports an incomplete set when a pass dropped entries or only saw transport errors', () => {
    const partial = report(
      [
        {
          stage: 'pdftex',
          requestedName: 'flaky.sty',
          format: 26,
          outcome: 'transport-error',
          attempts: [{ source: 'network', outcome: 'transport-error' }],
        },
      ],
      false,
    )
    const set = buildTexliveDependencySet('2025', profile, [partial])!
    expect(set.complete).toBe(false)
    expect(set.files).toEqual([{ format: 11, filename: 'pdftex.map' }])
    expect(set.notFound).toEqual([])
  })

  it('leaves excluded project/aux names out of notFound but never out of files', () => {
    const pass = report([
      {
        stage: 'xetex',
        requestedName: 'main.aux',
        format: 26,
        outcome: 'mirror-absent',
        attempts: [{ source: 'network', outcome: 'not-found', status: 404 }],
      },
      {
        stage: 'xetex',
        requestedName: 'figure.png',
        format: 26,
        outcome: 'resolved',
        attempts: [{ source: 'network', outcome: 'hit', candidate: 'figure.png', status: 200 }],
      },
    ])
    const set = buildTexliveDependencySet('2025', profile, [pass], {
      excludeNames: new Set(['main.aux', 'figure.png']),
    })!
    expect(set.notFound).toEqual([])
    expect(set.files).toEqual([{ format: 26, filename: 'figure.png' }])
  })

  it('merges a session: keeps earlier files, drops negatives a later compile resolved', () => {
    const first = buildTexliveDependencySet('2025', profile, [
      report([
        {
          stage: 'pdftex',
          requestedName: 'IEEEtran.cls',
          format: 26,
          outcome: 'resolved',
          attempts: [{ source: 'network', outcome: 'hit', candidate: 'IEEEtran.cls', status: 200 }],
        },
        {
          stage: 'pdftex',
          requestedName: 'later.sty',
          format: 26,
          outcome: 'mirror-absent',
          attempts: [{ source: 'network', outcome: 'not-found', status: 404 }],
        },
      ]),
    ])!
    const second = buildTexliveDependencySet('2025', profile, [
      report([
        {
          stage: 'pdftex',
          requestedName: 'later.sty',
          format: 26,
          outcome: 'resolved',
          attempts: [{ source: 'network', outcome: 'hit', candidate: 'later.sty', status: 200 }],
        },
      ]),
    ])!
    const merged = mergeTexliveDependencySets(first, second)
    expect(merged.files.map((f) => f.filename).sort()).toEqual([
      'IEEEtran.cls',
      'later.sty',
      'pdftex.map',
    ])
    expect(merged.notFound).toEqual([])
    expect(mergeTexliveDependencySets(undefined, second)).toBe(second)
  })
})
