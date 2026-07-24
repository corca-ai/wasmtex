import type { Diagnostic } from './diagnostic-provider'
import { type LintConfig, lintSource } from './linter'

type LintSetting = boolean | Partial<LintConfig>
type LintRunner = (content: string, filePath: string, config?: Partial<LintConfig>) => Diagnostic[]

interface CachedLintDiagnostics {
  readonly content: string
  readonly diagnostics: readonly Diagnostic[]
}

export class IncrementalLinter {
  private readonly cache = new Map<string, CachedLintDiagnostics>()

  constructor(
    private readonly lint: LintSetting,
    private readonly runLint: LintRunner = lintSource,
  ) {}

  updateFile(path: string, content: string | Uint8Array): boolean {
    if (this.lint === false || !path.endsWith('.tex') || typeof content !== 'string') {
      return this.cache.delete(path)
    }

    const cached = this.cache.get(path)
    if (cached?.content === content) return false

    this.cache.set(path, {
      content,
      diagnostics: this.runLint(content, path, this.lint === true ? undefined : this.lint),
    })
    return true
  }

  removeFile(path: string): boolean {
    return this.cache.delete(path)
  }

  diagnostics(paths: readonly string[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = []
    for (const path of paths) {
      const cached = this.cache.get(path)
      if (cached) diagnostics.push(...cached.diagnostics.map((diagnostic) => ({ ...diagnostic })))
    }
    return diagnostics
  }
}
