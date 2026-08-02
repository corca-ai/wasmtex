import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { LatexLanguageService } from '../../lsp-service'

const FILE_COUNT = 600
const INDEX_BUDGET_MS = 3_000
const WARM_COMPLETION_BUDGET_MS = 150
const UPDATE_BUDGET_MS = 100
const INDEX_MEMORY_BUDGET_BYTES = 8 * 1024 * 1024

function largeProject(): Record<string, string> {
  const files: Record<string, string> = {}
  for (let index = 0; index < FILE_COUNT; index++) {
    const next = index + 1 < FILE_COUNT ? `\\input{file-${index + 1}}\n` : ''
    files[`file-${index}.tex`] = `${next}\\newcounter{counter${index}}\n\\label{label:${index}}`
  }
  files['main.tex'] = '\\input{file-0}\n\\setcounter{counter599}'
  return files
}

describe('semantic completion performance budgets', () => {
  it('keeps a 600-file active graph within latency and retained-index budgets', () => {
    const indexStart = performance.now()
    const service = new LatexLanguageService({ files: largeProject(), lint: false })
    const indexDuration = performance.now() - indexStart

    service.getCompletions('main.tex', 2, 23)
    const completionStart = performance.now()
    const items = service.getCompletions('main.tex', 2, 23)
    const completionDuration = performance.now() - completionStart

    const updateStart = performance.now()
    service.updateFile('file-599.tex', '\\newcounter{counter599}\n\\label{updated}')
    const updateDuration = performance.now() - updateStart

    expect(items.map((item) => item.label)).toContain('counter599')
    expect(indexDuration).toBeLessThan(INDEX_BUDGET_MS)
    expect(completionDuration).toBeLessThan(WARM_COMPLETION_BUDGET_MS)
    expect(updateDuration).toBeLessThan(UPDATE_BUDGET_MS)
    expect(service.getProjectIndex().getStats()).toMatchObject({
      sourceFiles: FILE_COUNT + 1,
      bibliographyFiles: 0,
    })
    expect(service.getProjectIndex().getStats().estimatedBytes).toBeLessThan(
      INDEX_MEMORY_BUDGET_BYTES,
    )
  })
})
