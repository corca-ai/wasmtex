import { describe, expect, it } from 'vitest'
import type { CompletionSnapshotProfile } from '../types'
import { mergeResolverReports, ResolverEvidenceCollector } from './resolver-evidence'

const profile: CompletionSnapshotProfile = {
  id: 'texlive-2026-latest@2026-08-28',
  texliveYear: '2026',
  mirrorRevision: '2026-08-28',
}

describe('ResolverEvidenceCollector', () => {
  it('keeps distinct cache, mirror absence, and transport outcomes profile-bound', () => {
    const collector = new ResolverEvidenceCollector('pdftex', profile)
    collector.markSupported()
    collector.begin()
    collector.record({
      requestedName: 'article.cls',
      format: 26,
      outcome: 'resolved',
      attempts: [{ source: 'persistent-cache', outcome: 'hit' }],
    })
    collector.record({
      requestedName: 'missing.sty',
      format: 26,
      outcome: 'mirror-absent',
      attempts: [{ source: 'network', outcome: 'not-found', status: 404 }],
    })
    collector.record({
      requestedName: 'retry.sty',
      format: 26,
      outcome: 'transport-error',
      attempts: [{ source: 'network', outcome: 'transport-error' }],
    })

    const report = collector.finish()!
    expect(report.profile).toEqual(profile)
    expect(report.entries.map((entry) => entry.outcome)).toEqual([
      'resolved',
      'mirror-absent',
      'transport-error',
    ])
  })

  it('replaces repeated resource evidence with one non-contradictory final outcome', () => {
    const collector = new ResolverEvidenceCollector('luatex', profile)
    collector.markSupported()
    collector.begin()
    collector.record({
      requestedName: 'font.tfm',
      format: 3,
      outcome: 'transport-error',
      attempts: [{ source: 'network', outcome: 'transport-error' }],
    })
    collector.record({
      requestedName: 'font.tfm',
      format: 3,
      outcome: 'resolved',
      attempts: [{ source: 'network', outcome: 'hit', candidate: 'font' }],
    })
    expect(collector.finish()!.entries).toMatchObject([
      { requestedName: 'font.tfm', outcome: 'resolved' },
    ])
  })

  it('ignores malformed worker data and bounds retained entries', () => {
    const collector = new ResolverEvidenceCollector('xetex', profile)
    collector.markSupported()
    collector.begin()
    collector.record({
      requestedName: 'https://unrelated.example/secret',
      format: 26,
      outcome: 'resolved',
      attempts: [{ source: 'network', outcome: 'hit' }],
    })
    for (let index = 0; index < 1028; index++) {
      collector.record({
        requestedName: `resource-${index}.sty`,
        format: 26,
        outcome: 'resolved',
        attempts: [{ source: 'session-cache', outcome: 'hit' }],
      })
    }
    const report = collector.finish()!
    expect(report.entries).toHaveLength(1024)
    expect(report.dropped).toBe(4)
    expect(report.complete).toBe(false)
  })

  it('merges the XeTeX and dvipdfmx stages under one profile and bound', () => {
    const tex = new ResolverEvidenceCollector('xetex', profile)
    const dvi = new ResolverEvidenceCollector('dvipdfmx', profile)
    tex.markSupported()
    dvi.markSupported()
    tex.begin()
    dvi.begin()
    tex.record({
      requestedName: 'article.cls',
      format: 26,
      outcome: 'resolved',
      attempts: [{ source: 'warmup-cache', outcome: 'hit' }],
    })
    dvi.record({
      requestedName: 'font.otf',
      format: 47,
      outcome: 'resolved',
      attempts: [{ source: 'network', outcome: 'hit' }],
    })
    expect(mergeResolverReports(profile, [tex.finish(), dvi.finish()]).entries).toMatchObject([
      { stage: 'xetex' },
      { stage: 'dvipdfmx' },
    ])
  })
})
