import { VirtualFS } from './fs/virtual-fs';
import { Diagnostic } from './lsp/diagnostic-provider';
import { CodeAction, DocumentLink, FoldingRange, InlayHint, LFRange, SemanticToken, SignatureHelp, WorkspaceSymbol } from './lsp/language-features';
import { LintConfig, lintSource } from './lsp/linter';
import { ProjectIndex } from './lsp/project-index';
import { NeutralCompletionItem, NeutralHover, NeutralLocation } from './lsp/protocol';
import { SemanticTrace } from './lsp/trace-parser';
import { FileSymbols, SectionDef } from './lsp/types';
export { lintSource, type LintConfig };
export type { CodeAction, DocumentLink, FoldingRange, InlayHint, LFRange, SemanticToken, SignatureHelp, WorkspaceSymbol, } from './lsp/language-features';
export type { LintRuleConfig, LintRuleId } from './lsp/linter';
export { DEFAULT_LINT_CONFIG } from './lsp/linter';
export { type CommandArg, formatSignature, getCommandPackage, getCommandSignature, parseSignature, registerShard, } from './lsp/package-db';
export { type PackageShard, PackageShardLoader, type PackageShardLoaderOptions, type ShardStore, } from './lsp/package-shard-loader';
export interface LatexLanguageServiceOptions {
    files?: Record<string, string | Uint8Array>;
    aux?: string;
    engineCommands?: string[];
    semanticTrace?: string | SemanticTrace;
    /** Static linter (ChkTeX-style). `false` disables it; an object overrides
     *  per-rule enabled/severity. Defaults to on with the default rule set. */
    lint?: boolean | Partial<LintConfig>;
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
    private lint;
    private linter;
    constructor(options?: LatexLanguageServiceOptions);
    loadProject(files: Record<string, string | Uint8Array>): void;
    updateFile(path: string, content: string | Uint8Array): void;
    removeFile(path: string): boolean;
    getFile(path: string): string | Uint8Array | null;
    listFiles(): string[];
    updateAux(content: string): void;
    updateEngineCommands(commands: string[]): void;
    updateSemanticTrace(trace: string | SemanticTrace): void;
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
    getCompletions(path: string, line: number, column: number): NeutralCompletionItem[];
    getHover(path: string, line: number, column: number): NeutralHover | null;
    getDefinition(path: string, line: number, column: number): NeutralLocation | null;
    getReferences(path: string, line: number, column: number): NeutralLocation[];
    getRenameEdits(path: string, line: number, column: number, newName: string): LatexWorkspaceEdit | undefined;
    getProjectIndex(): ProjectIndex;
    getVirtualFileSystem(): VirtualFS;
    private updateBibIndex;
}
export declare function createLatexLanguageService(options?: LatexLanguageServiceOptions): LatexLanguageService;
export type { Diagnostic, FileSymbols, SectionDef, SemanticTrace };
