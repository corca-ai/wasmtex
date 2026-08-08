import { VirtualFS } from './fs/virtual-fs';
import { CompletionContext } from './lsp/completion-context';
import { CompletionCancellationToken, CompletionResolverRegistry } from './lsp/completion-registry';
import { Diagnostic } from './lsp/diagnostic-provider';
import { CodeAction, DocumentLink, FoldingRange, InlayHint, LFRange, SemanticToken, SignatureHelp, WorkspaceSymbol } from './lsp/language-features';
import { LintConfig, lintSource } from './lsp/linter';
import { ProjectIndex } from './lsp/project-index';
import { NeutralCompletionItem, NeutralCompletionList, NeutralHover, NeutralLocation } from './lsp/protocol';
import { TexResourceCatalogProvider, TexResourceCatalogState, TexResourceKind } from './lsp/resource-catalog';
import { TexSemanticCatalogProvider, TexSemanticCatalogState } from './lsp/semantic-catalog';
import { SemanticTrace } from './lsp/trace-parser';
import { FileSymbols, SectionDef } from './lsp/types';
import { LatexDocumentInput, LatexFileSyntax, LatexSyntaxService } from './syntax';
import { CompletionSnapshot, CompletionSnapshotProfile, CompletionSnapshotState } from './types';
export { lintSource, type LintConfig };
export { COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES, COMPLETION_SNAPSHOT_SCHEMA_VERSION, } from './engine/completion-snapshot';
export type { BibCompletionContext, BibCompletionDomain } from './lsp/bib-completion-context';
export { analyzeCompletionContext, type CommandArgumentCompletionContext, type CommandNameCompletionContext, type CompletionCommandMetadataProvider, type CompletionContext, type CompletionDomain, type RelatedCompletionArgument, } from './lsp/completion-context';
export { type CompletionCancellationToken, type CompletionResolver, type CompletionResolverEnvironment, CompletionResolverRegistry, type CompletionResolverResult, } from './lsp/completion-registry';
export type { CodeAction, DocumentLink, FoldingRange, InlayHint, LFRange, SemanticToken, SignatureHelp, WorkspaceSymbol, } from './lsp/language-features';
export type { LintRuleConfig, LintRuleId } from './lsp/linter';
export { DEFAULT_LINT_CONFIG } from './lsp/linter';
export { createDefaultCompletionRegistry, preloadSemanticCatalog } from './lsp/neutral-providers';
export { type CommandArg, type CompletionValueKind, formatSignature, getCommandPackage, getCommandSignature, getEnvironmentSignature, parseSignature, registerShard, } from './lsp/package-db';
export { type PackageShard, PackageShardLoader, type PackageShardLoaderOptions, type ShardStore, } from './lsp/package-shard-loader';
export type { CompletionKind, NeutralCompletionItem, NeutralCompletionList, NeutralDocument, NeutralHover, NeutralLocation, NeutralPosition, NeutralRange, } from './lsp/protocol';
export { HttpTexResourceCatalogProvider, type HttpTexResourceCatalogProviderOptions, InMemoryTexResourceCatalogProvider, TEX_RESOURCE_CATALOG_SCHEMA_VERSION, type TexResourceCatalogIdentity, type TexResourceCatalogProvider, type TexResourceCatalogShard, type TexResourceCatalogState, type TexResourceCatalogStore, type TexResourceKind, type TexResourceRecord, } from './lsp/resource-catalog';
export { HttpTexSemanticCatalogProvider, type HttpTexSemanticCatalogProviderOptions, InMemoryTexSemanticCatalogProvider, registerTexSemanticShard, TEX_SEMANTIC_CATALOG_SCHEMA_VERSION, type TexSemanticCatalogIdentity, type TexSemanticCatalogProvider, type TexSemanticCatalogState, type TexSemanticCatalogStore, type TexSemanticColor, type TexSemanticCommand, type TexSemanticConfidence, type TexSemanticCoverage, type TexSemanticEvidence, type TexSemanticKey, type TexSemanticKeyFamily, type TexSemanticProvenance, type TexSemanticScope, type TexSemanticScopeKind, type TexSemanticShard, type TexSemanticValue, type TexSemanticValueType, } from './lsp/semantic-catalog';
export interface LatexLanguageServiceOptions {
    files?: Record<string, string | Uint8Array>;
    /** Root whose normal compile produced runtime completion evidence. Defaults to `main.tex`. */
    mainFile?: string;
    /** Exact runtime completion profile expected from a separate compiler host. */
    completionProfile?: CompletionSnapshotProfile;
    aux?: string;
    engineCommands?: string[];
    semanticTrace?: string | SemanticTrace;
    /** Isolated typed completion registry. Defaults to WasmTex's built-in registry. */
    completionRegistry?: CompletionResolverRegistry;
    /** Exact, profile-bound TeX Live resource catalog. No catalog means no core network access. */
    resourceCatalog?: TexResourceCatalogProvider;
    /** Typed class/package semantic shards bound to the same exact compile profile. */
    semanticCatalog?: TexSemanticCatalogProvider;
    /** Static linter (ChkTeX-style). `false` disables it; an object overrides
     *  per-rule enabled/severity. Defaults to on with the default rule set. */
    lint?: boolean | Partial<LintConfig>;
    /** Shared parser/index owner. Use this when another consumer, such as Semath,
     * needs the exact syntax snapshot that backs the LaTeX language features. */
    syntaxService?: LatexSyntaxService;
}
/** Atomically replace the profile-bound completion sources without rebuilding the project index. */
export interface LatexCompletionConfiguration {
    completionProfile?: CompletionSnapshotProfile;
    completionRegistry?: CompletionResolverRegistry;
    resourceCatalog?: TexResourceCatalogProvider;
    semanticCatalog?: TexSemanticCatalogProvider;
}
export interface LatexWorkspaceEdit {
    edits: Array<{
        file: string;
        range: {
            startLineNumber: number;
            startColumn: number;
            endLineNumber: number;
            endColumn: number;
        };
        newText: string;
    }>;
}
export declare class LatexLanguageService {
    private fs;
    private index;
    private readonly syntaxService;
    private readonly documentPaths;
    private readonly documentIds;
    private readonly documentVersions;
    private readonly documentLanguages;
    private lint;
    private linter;
    private completionRegistry;
    private resourceCatalog;
    private semanticCatalog;
    private mainFile;
    private completionProfile;
    private projectRevisionEpoch;
    private completionSnapshotUpdate;
    constructor(options?: LatexLanguageServiceOptions);
    loadProject(files: Record<string, string | Uint8Array>): void;
    updateFile(path: string, content: string | Uint8Array): void;
    removeFile(path: string): boolean;
    /** Update a stable document identity and return the syntax snapshot used by LSP queries. */
    updateDocument(document: LatexDocumentInput): LatexFileSyntax;
    moveDocument(fileId: string, nextPath: string): LatexFileSyntax;
    removeDocument(fileId: string): boolean;
    getSyntaxService(): LatexSyntaxService;
    getFile(path: string): string | Uint8Array | null;
    private upsertSyntaxDocument;
    private removeSyntaxDocument;
    listFiles(): string[];
    setMainFile(path: string): void;
    configureCompletion(configuration: LatexCompletionConfiguration): void;
    updateAux(content: string): void;
    updateEngineCommands(commands: string[]): void;
    updateSemanticTrace(trace: string | SemanticTrace): void;
    updateCompletionSnapshot(snapshot: CompletionSnapshot): Promise<CompletionSnapshotState>;
    getCompletionSnapshotState(): CompletionSnapshotState;
    clearCompletionSnapshot(): void;
    private assertCompletionProfile;
    getDiagnostics(): Diagnostic[];
    getFileSymbols(path: string): FileSymbols | undefined;
    getOutline(path: string): SectionDef[];
    private textOf;
    getSignatureHelp(path: string, line: number, column: number): SignatureHelp | null;
    getFoldingRanges(path: string): FoldingRange[];
    getDocumentHighlights(path: string, line: number, column: number): LFRange[];
    getWorkspaceSymbols(query: string): WorkspaceSymbol[];
    getInlayHints(path: string): InlayHint[];
    getDocumentLinks(path: string): DocumentLink[];
    getSemanticTokens(path: string): SemanticToken[];
    getCodeActions(path: string, line: number): CodeAction[];
    private docFor;
    getCompletionContext(path: string, line: number, column: number): CompletionContext | null;
    getCompletions(path: string, line: number, column: number, cancellationToken?: CompletionCancellationToken): NeutralCompletionItem[];
    getCompletionResult(path: string, line: number, column: number, cancellationToken?: CompletionCancellationToken): NeutralCompletionList;
    /** Resolve completion after request-scoped lazy catalog loads settle once. */
    getCompletionResultAsync(path: string, line: number, column: number, cancellationToken?: CompletionCancellationToken): Promise<NeutralCompletionList>;
    getHover(path: string, line: number, column: number): NeutralHover | null;
    getDefinition(path: string, line: number, column: number): NeutralLocation | null;
    getReferences(path: string, line: number, column: number): NeutralLocation[];
    getRenameEdits(path: string, line: number, column: number, newName: string): LatexWorkspaceEdit | undefined;
    getProjectIndex(): ProjectIndex;
    getVirtualFileSystem(): VirtualFS;
    getCompletionRegistry(): CompletionResolverRegistry;
    getResourceCatalogState(kind: TexResourceKind): TexResourceCatalogState | null;
    loadResourceCatalog(kind: TexResourceKind, cancellationToken?: CompletionCancellationToken): Promise<TexResourceCatalogState> | null;
    getSemanticCatalogState(scopeId: string): TexSemanticCatalogState | null;
    loadSemanticCatalog(scopeId: string, cancellationToken?: CompletionCancellationToken): Promise<TexSemanticCatalogState> | null;
}
export declare function createLatexLanguageService(options?: LatexLanguageServiceOptions): LatexLanguageService;
export type { ProjectIndexStats } from './lsp/project-index';
export type { BibEntry, BibStringDef, ParsedBibFile, ProjectKeyDefinition, ProjectKeyValueType, ProjectValue, ProjectValueRole, } from './lsp/types';
export type { CompletionSnapshot, CompletionSnapshotCollection, CompletionSnapshotCommand, CompletionSnapshotEngine, CompletionSnapshotEvidence, CompletionSnapshotFieldName, CompletionSnapshotFields, CompletionSnapshotIdentity, CompletionSnapshotKey, CompletionSnapshotKeyFamily, CompletionSnapshotProfile, CompletionSnapshotResource, CompletionSnapshotState, CompletionSnapshotValue, } from './types';
export type { Diagnostic, FileSymbols, SectionDef, SemanticTrace };
