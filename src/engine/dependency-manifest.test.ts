import { describe, expect, it } from 'vitest'
import type { CompileResult, DependencyGraph, DependencyManifest } from '../types'
import {
  buildDependencyManifest,
  buildIncrementalDependencyManifest,
  normalizeProjectDependencyPath,
} from './dependency-manifest'

function compileResult(overrides: Partial<CompileResult> = {}): CompileResult {
  return {
    success: true,
    pdf: new Uint8Array([1]),
    log: '',
    errors: [],
    compileTime: 1,
    synctex: null,
    ...overrides,
  }
}

function graph(projectIds: string[]): DependencyGraph {
  return {
    root: 'main.tex',
    nodes: projectIds.map((id) => ({
      id,
      kind: id.endsWith('.tex') ? 'tex' : 'other',
      origin: 'project',
      discoveredBy: ['log'],
    })),
    edges: [],
  }
}

describe('normalizeProjectDependencyPath', () => {
  it('normalizes project paths without collapsing duplicate basenames', () => {
    expect(normalizeProjectDependencyPath('/work/chapters/./intro.tex')).toBe('chapters/intro.tex')
    expect(normalizeProjectDependencyPath('/work/appendix/intro.tex')).toBe('appendix/intro.tex')
    expect(normalizeProjectDependencyPath('./assets/../data/table.csv')).toBe('data/table.csv')
  })

  it('rejects system and project-escaping paths', () => {
    expect(normalizeProjectDependencyPath('/tex/article.cls')).toBeNull()
    expect(normalizeProjectDependencyPath('C:\\texlive\\article.cls')).toBeNull()
    expect(normalizeProjectDependencyPath('../outside.tex')).toBeNull()
  })
})

describe('buildDependencyManifest', () => {
  it('makes a successful pdfLaTeX recorder result a complete arbitrary-file manifest', () => {
    const result = compileResult({
      inputFilesComplete: true,
      inputFiles: [
        '/work/docs/main.tex',
        '/work/chapters/intro.tex',
        '/work/data/table.csv',
        '/work/assets/chart.png',
        '/work/fonts/custom.otf',
        '/work/docs/main.bbl',
        '/work/__strace.tex',
        '/tex/tex/latex/base/article.cls',
      ],
    })
    const manifest = buildDependencyManifest({
      engine: 'pdflatex',
      root: 'docs/main.tex',
      projectFiles: [
        'docs/main.tex',
        'chapters/intro.tex',
        'appendix/intro.tex',
        'data/table.csv',
        'assets/chart.png',
        'fonts/custom.otf',
        'docs/main.bbl',
        'unrelated.md',
      ],
      generatedFiles: ['docs/main.bbl'],
      result,
    })

    expect(manifest).toEqual({
      version: 1,
      root: 'docs/main.tex',
      projectInputs: [
        'assets/chart.png',
        'chapters/intro.tex',
        'data/table.csv',
        'docs/main.tex',
        'fonts/custom.otf',
      ],
      complete: true,
      coverage: [{ stage: 'latex', source: 'recorder', complete: true }],
    })
    expect(manifest.projectInputs).not.toContain('appendix/intro.tex')
  })

  it('requires an explicit complete signal from the current worker asset', () => {
    const manifest = buildDependencyManifest({
      engine: 'pdflatex',
      root: 'main.tex',
      projectFiles: ['main.tex'],
      result: compileResult({ inputFiles: ['/work/main.tex'] }),
    })
    expect(manifest.complete).toBe(false)
    expect(manifest.incompleteReason).toBe('recorder-unavailable')
  })

  it('never marks a failed recorder result complete', () => {
    const manifest = buildDependencyManifest({
      engine: 'pdflatex',
      root: 'main.tex',
      projectFiles: ['main.tex'],
      result: compileResult({
        success: false,
        pdf: null,
        inputFilesComplete: true,
        inputFiles: ['/work/main.tex'],
      }),
    })
    expect(manifest.complete).toBe(false)
    expect(manifest.incompleteReason).toBe('compile-failed')
    expect(manifest.coverage).toEqual([{ stage: 'latex', source: 'recorder', complete: false }])
  })

  it('never marks a partial PDF with error diagnostics complete', () => {
    const manifest = buildDependencyManifest({
      engine: 'pdflatex',
      root: 'main.tex',
      projectFiles: ['main.tex'],
      result: compileResult({
        errors: [{ line: 3, severity: 'error', message: 'Undefined control sequence' }],
        inputFilesComplete: true,
        inputFiles: ['/work/main.tex'],
      }),
    })
    expect(manifest.complete).toBe(false)
    expect(manifest.incompleteReason).toBe('compile-failed')
  })

  it('keeps successful XeLaTeX observations incomplete until pdf conversion is authoritative', () => {
    const result = compileResult({
      inputFilesComplete: true,
      inputFiles: ['/work/main.tex', '/work/assets/chart.png'],
      telemetry: {
        diagnostics: [],
        dependencies: graph(['main.tex', 'chapters/intro.tex', 'assets/chart.png']),
      },
    })
    const manifest = buildDependencyManifest({
      engine: 'xelatex',
      root: 'main.tex',
      projectFiles: ['main.tex', 'chapters/intro.tex', 'assets/chart.png'],
      result,
    })

    expect(manifest.complete).toBe(false)
    expect(manifest.incompleteReason).toBe('pdf-conversion-recorder-unavailable')
    expect(manifest.coverage).toContainEqual({
      stage: 'latex',
      source: 'recorder',
      complete: true,
    })
    expect(
      manifest.coverage
        .filter((item) => item.stage === 'pdf-conversion')
        .every((item) => !item.complete),
    ).toBe(true)
  })

  it('makes a successful LuaLaTeX recorder result complete', () => {
    const manifest = buildDependencyManifest({
      engine: 'lualatex',
      root: 'main.tex',
      projectFiles: ['main.tex', 'chapters/intro.tex'],
      result: compileResult({
        inputFilesComplete: true,
        inputFiles: ['/work/main.tex', '/work/chapters/intro.tex'],
      }),
    })
    expect(manifest.complete).toBe(true)
    expect(manifest.projectInputs).toEqual(['chapters/intro.tex', 'main.tex'])
    expect(manifest.coverage).toEqual([{ stage: 'latex', source: 'recorder', complete: true }])
  })

  it('combines bibliography and index request inputs with the recorder boundary', () => {
    const result = compileResult({
      inputFilesComplete: true,
      inputFiles: ['/work/main.tex', '/work/main.bbl', '/work/main.ind'],
    })
    const manifest = buildDependencyManifest({
      engine: 'pdflatex',
      root: 'main.tex',
      projectFiles: [
        'main.tex',
        'refs/primary.bib',
        'refs/unused-but-forwarded.bib',
        'styles/custom.bst',
        'main.bbl',
        'main.ind',
      ],
      generatedFiles: ['main.bbl', 'main.ind'],
      auxiliaryStages: [
        {
          stage: 'bibliography',
          projectInputs: ['refs/primary.bib', 'refs/unused-but-forwarded.bib', 'styles/custom.bst'],
          complete: true,
        },
        { stage: 'index', projectInputs: [], complete: true },
      ],
      result,
    })

    expect(manifest.complete).toBe(true)
    expect(manifest.projectInputs).toEqual([
      'main.tex',
      'refs/primary.bib',
      'refs/unused-but-forwarded.bib',
      'styles/custom.bst',
    ])
    expect(manifest.coverage).toContainEqual({
      stage: 'bibliography',
      source: 'backend-request',
      complete: true,
    })
    expect(manifest.coverage).toContainEqual({
      stage: 'index',
      source: 'backend-request',
      complete: true,
    })
  })

  it('revokes completeness when an auxiliary stage ran without producing output', () => {
    const manifest = buildDependencyManifest({
      engine: 'pdflatex',
      root: 'main.tex',
      projectFiles: ['main.tex', 'refs.bib'],
      auxiliaryStages: [{ stage: 'bibliography', projectInputs: ['refs.bib'], complete: false }],
      result: compileResult({
        inputFilesComplete: true,
        inputFiles: ['/work/main.tex'],
      }),
    })
    expect(manifest.complete).toBe(false)
    expect(manifest.incompleteReason).toBe('auxiliary-stage-failed')
    expect(manifest.projectInputs).toContain('refs.bib')
  })
})

describe('buildIncrementalDependencyManifest', () => {
  it('carries prior inputs only as explicitly incomplete information', () => {
    const previous: DependencyManifest = {
      version: 1,
      root: 'main.tex',
      projectInputs: ['chapters/intro.tex', 'main.tex'],
      complete: true,
      coverage: [{ stage: 'latex', source: 'recorder', complete: true }],
    }
    const manifest = buildIncrementalDependencyManifest('main.tex', previous)
    expect(manifest.projectInputs).toEqual(['chapters/intro.tex', 'main.tex'])
    expect(manifest.complete).toBe(false)
    expect(manifest.incompleteReason).toBe('incremental-dependencies-unavailable')
  })
})
