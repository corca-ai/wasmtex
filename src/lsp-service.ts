import { VirtualFS } from './fs/virtual-fs'
import { parseAuxFile } from './lsp/aux-parser'
import { rebuildBibIndex } from './lsp/bib-parser'
import { analyzeCompletionContext, type CompletionContext } from './lsp/completion-context'
import type {
  CompletionCancellationToken,
  CompletionResolverRegistry,
} from './lsp/completion-registry'
import { computeDiagnostics, type Diagnostic } from './lsp/diagnostic-provider'
import { IncrementalLinter } from './lsp/incremental-linter'
import {
  type CodeAction,
  type DocumentLink,
  type FoldingRange,
  getCodeActions,
  getDocumentHighlights,
  getDocumentLinks,
  getFoldingRanges,
  getInlayHints,
  getSemanticTokens,
  getSignatureHelp,
  getWorkspaceSymbols,
  type InlayHint,
  type LFRange,
  type SemanticToken,
  type SignatureHelp,
  type WorkspaceSymbol,
} from './lsp/language-features'
import { type LintConfig, lintSource } from './lsp/linter'
import {
  createDefaultCompletionRegistry,
  provideCompletions,
  provideDefinition,
  provideHover,
  provideReferences,
} from './lsp/neutral-providers'
import { ProjectIndex } from './lsp/project-index'
import type {
  NeutralCompletionItem,
  NeutralDocument,
  NeutralHover,
  NeutralLocation,
} from './lsp/protocol'
import { parseTraceFile, type SemanticTrace } from './lsp/trace-parser'
import type { FileSymbols, SectionDef } from './lsp/types'

// Public linter API on the `wasmtex/lsp` entrypoint.
export { lintSource, type LintConfig }
export {
  analyzeCompletionContext,
  type CommandArgumentCompletionContext,
  type CommandNameCompletionContext,
  type CompletionCommandMetadataProvider,
  type CompletionContext,
  type CompletionDomain,
  type RelatedCompletionArgument,
} from './lsp/completion-context'
export {
  type CompletionCancellationToken,
  type CompletionResolver,
  type CompletionResolverEnvironment,
  CompletionResolverRegistry,
} from './lsp/completion-registry'
// Editor-neutral language feature types.
export type {
  CodeAction,
  DocumentLink,
  FoldingRange,
  InlayHint,
  LFRange,
  SemanticToken,
  SignatureHelp,
  WorkspaceSymbol,
} from './lsp/language-features'
export type { LintRuleConfig, LintRuleId } from './lsp/linter'
export { DEFAULT_LINT_CONFIG } from './lsp/linter'
export { createDefaultCompletionRegistry } from './lsp/neutral-providers'
// Package-aware command intelligence.
export {
  type CommandArg,
  type CompletionValueKind,
  formatSignature,
  getCommandPackage,
  getCommandSignature,
  getEnvironmentSignature,
  parseSignature,
  registerShard,
} from './lsp/package-db'
export {
  type PackageShard,
  PackageShardLoader,
  type PackageShardLoaderOptions,
  type ShardStore,
} from './lsp/package-shard-loader'
export type {
  CompletionKind,
  NeutralCompletionItem,
  NeutralDocument,
  NeutralHover,
  NeutralLocation,
  NeutralPosition,
  NeutralRange,
} from './lsp/protocol'

export interface LatexLanguageServiceOptions {
  files?: Record<string, string | Uint8Array>
  aux?: string
  engineCommands?: string[]
  semanticTrace?: string | SemanticTrace
  /** Isolated typed completion registry. Defaults to WasmTex's built-in registry. */
  completionRegistry?: CompletionResolverRegistry
  /** Static linter (ChkTeX-style). `false` disables it; an object overrides
   *  per-rule enabled/severity. Defaults to on with the default rule set. */
  lint?: boolean | Partial<LintConfig>
}

export interface LatexWorkspaceEdit {
  edits: Array<{
    file: string
    range: {
      startLineNumber: number
      startColumn: number
      endLineNumber: number
      endColumn: number
    }
    newText: string
  }>
}

export class LatexLanguageService {
  private fs = new VirtualFS({ empty: true })
  private index = new ProjectIndex()
  private lint: boolean | Partial<LintConfig>
  private linter: IncrementalLinter
  private completionRegistry: CompletionResolverRegistry

  constructor(options: LatexLanguageServiceOptions = {}) {
    this.lint = options.lint ?? true
    this.linter = new IncrementalLinter(this.lint)
    this.completionRegistry = options.completionRegistry ?? createDefaultCompletionRegistry()
    this.loadProject(options.files ?? {})
    if (options.aux) this.updateAux(options.aux)
    if (options.engineCommands) this.updateEngineCommands(options.engineCommands)
    if (options.semanticTrace) this.updateSemanticTrace(options.semanticTrace)
  }

  loadProject(files: Record<string, string | Uint8Array>): void {
    this.fs = new VirtualFS({ empty: true })
    this.index = new ProjectIndex()
    this.linter = new IncrementalLinter(this.lint)
    for (const [path, content] of Object.entries(files)) {
      this.updateFile(path, content)
    }
  }

  updateFile(path: string, content: string | Uint8Array): void {
    const previous = this.fs.readFile(path)
    if (previous === content) return

    this.fs.writeFile(path, content)
    this.linter.updateFile(path, content)
    if (typeof content !== 'string') {
      if (path.endsWith('.tex')) this.index.removeFile(path)
      if (path.endsWith('.bib')) this.updateBibIndex()
      return
    }
    if (path.endsWith('.tex')) this.index.updateFile(path, content)
    if (path.endsWith('.bib')) this.updateBibIndex()
  }

  removeFile(path: string): boolean {
    const removed = this.fs.deleteFile(path)
    this.linter.removeFile(path)
    if (path.endsWith('.tex')) this.index.removeFile(path)
    if (path.endsWith('.bib')) this.updateBibIndex()
    return removed
  }

  getFile(path: string): string | Uint8Array | null {
    return this.fs.readFile(path)
  }

  listFiles(): string[] {
    return this.fs.listFiles()
  }

  updateAux(content: string): void {
    this.index.updateAuxData(parseAuxFile(content))
  }

  updateEngineCommands(commands: string[]): void {
    this.index.updateEngineCommands(commands)
  }

  updateSemanticTrace(trace: string | SemanticTrace): void {
    this.index.updateSemanticTrace(typeof trace === 'string' ? parseTraceFile(trace) : trace)
  }

  getDiagnostics(): Diagnostic[] {
    const diagnostics = computeDiagnostics(this.index)
    diagnostics.push(...this.linter.diagnostics(this.fs.listFiles()))
    return diagnostics
  }

  getFileSymbols(path: string): FileSymbols | undefined {
    return this.index.getFileSymbols(path)
  }

  getOutline(path: string): SectionDef[] {
    return this.index.getFileSymbols(path)?.sections ?? []
  }

  // --- Editor-neutral language features (see language-features.ts) ---

  private textOf(path: string): string {
    const content = this.fs.readFile(path)
    return typeof content === 'string' ? content : ''
  }

  getSignatureHelp(path: string, line: number, column: number): SignatureHelp | null {
    return getSignatureHelp(this.textOf(path), line, column)
  }

  getFoldingRanges(path: string): FoldingRange[] {
    return getFoldingRanges(this.textOf(path))
  }

  getDocumentHighlights(path: string, line: number, column: number): LFRange[] {
    return getDocumentHighlights(path, line, column, this.index)
  }

  getWorkspaceSymbols(query: string): WorkspaceSymbol[] {
    return getWorkspaceSymbols(query, this.index)
  }

  getInlayHints(path: string): InlayHint[] {
    return getInlayHints(this.textOf(path), this.index)
  }

  getDocumentLinks(path: string): DocumentLink[] {
    return getDocumentLinks(this.textOf(path))
  }

  getSemanticTokens(path: string): SemanticToken[] {
    return getSemanticTokens(this.textOf(path))
  }

  getCodeActions(path: string, line: number): CodeAction[] {
    return getCodeActions(this.textOf(path), path, line, this.index)
  }

  private docFor(path: string): NeutralDocument {
    const text = this.textOf(path)
    const lines = text.split('\n')
    return { path, getText: () => text, lineAt: (line) => lines[line - 1] ?? '' }
  }

  getCompletionContext(path: string, line: number, column: number): CompletionContext | null {
    return analyzeCompletionContext(this.docFor(path), { line, column }, this.completionRegistry)
  }

  getCompletions(
    path: string,
    line: number,
    column: number,
    cancellationToken?: CompletionCancellationToken,
  ): NeutralCompletionItem[] {
    return provideCompletions(this.docFor(path), { line, column }, this.index, this.fs, {
      registry: this.completionRegistry,
      ...(cancellationToken ? { cancellationToken } : {}),
    })
  }

  getHover(path: string, line: number, column: number): NeutralHover | null {
    return provideHover(this.docFor(path), { line, column }, this.index)
  }

  getDefinition(path: string, line: number, column: number): NeutralLocation | null {
    return provideDefinition(this.docFor(path), { line, column }, this.index)
  }

  getReferences(path: string, line: number, column: number): NeutralLocation[] {
    return provideReferences(this.docFor(path), { line, column }, this.index)
  }

  getRenameEdits(
    path: string,
    line: number,
    column: number,
    newName: string,
  ): LatexWorkspaceEdit | undefined {
    const symbol = this.index.findSymbolAt(path, line, column)
    if (!symbol) return undefined
    const edits = this.index.findAllOccurrences(symbol.name, symbol.type).map((occ) => ({
      file: occ.filePath,
      range: {
        startLineNumber: occ.line,
        startColumn: occ.column,
        endLineNumber: occ.line,
        endColumn: occ.column + occ.length,
      },
      newText: newName,
    }))
    return { edits }
  }

  getProjectIndex(): ProjectIndex {
    return this.index
  }

  getVirtualFileSystem(): VirtualFS {
    return this.fs
  }

  getCompletionRegistry(): CompletionResolverRegistry {
    return this.completionRegistry
  }

  private updateBibIndex(): void {
    rebuildBibIndex(this.fs, this.index)
  }
}

export function createLatexLanguageService(
  options?: LatexLanguageServiceOptions,
): LatexLanguageService {
  return new LatexLanguageService(options)
}

export type { Diagnostic, FileSymbols, SectionDef, SemanticTrace }
