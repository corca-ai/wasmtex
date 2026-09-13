import { CompletionCommandMetadataProvider } from './completion-context.js';
import { CommandArg } from './package-db.js';
import { ProjectIndex } from './project-index.js';
/** 1-based, end-exclusive source range. */
export interface LFRange {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
}
export interface SignatureHelp {
    /** Rendered signature, e.g. `\href{url}{text}`. */
    label: string;
    parameters: string[];
    /** Index in the declared signature, including omitted optional arguments. */
    activeParameter: number;
    command: string;
    starred: boolean;
    /** Index among argument groups actually present at the call site. */
    argumentIndex: number;
    /** Confirmed argument structure and value domains, without editor-specific types. */
    parameterDetails: CommandArg[];
}
/** Argument hints use exactly the same invocation analysis as completion. */
export declare function getSignatureHelp(content: string, line: number, column: number, metadata?: CompletionCommandMetadataProvider): SignatureHelp | null;
export interface FoldingRange {
    startLine: number;
    endLine: number;
    kind?: 'comment' | 'region';
}
/** Foldable ranges: environments, `% region`/`% endregion`, and section blocks. */
export declare function getFoldingRanges(content: string): FoldingRange[];
/** Structural occurrences in `file`; conflicting active declarations are ambiguous. */
export declare function getDocumentHighlights(file: string, line: number, column: number, index: ProjectIndex): LFRange[];
export interface WorkspaceSymbol {
    name: string;
    kind: 'label' | 'section' | 'command';
    file: string;
    line: number;
    column: number;
}
/** Search labels, sections, and command definitions across the project. */
export declare function getWorkspaceSymbols(query: string, index: ProjectIndex): WorkspaceSymbol[];
export interface InlayHint {
    line: number;
    column: number;
    label: string;
}
/** Inline resolved `.aux` numbers next to `\ref` (e.g. `\ref{fig:x}` → "(3.2)"). */
export declare function getInlayHints(content: string, index: ProjectIndex): InlayHint[];
export interface DocumentLink {
    range: LFRange;
    target: string;
    /** A project file path, or an external URL. */
    kind: 'file' | 'url';
}
/** Clickable `\input`/`\include`/`\subfile` files and `\url`/`\href` URLs. */
export declare function getDocumentLinks(content: string): DocumentLink[];
export type SemanticTokenType = 'command' | 'math' | 'comment' | 'verbatim';
export interface SemanticToken {
    line: number;
    startColumn: number;
    length: number;
    type: SemanticTokenType;
}
/** Classify tokens for accurate highlighting (commands, math, comments, verbatim). */
export declare function getSemanticTokens(content: string): SemanticToken[];
export interface TextEdit {
    range: LFRange;
    newText: string;
}
export interface CodeAction {
    title: string;
    kind: 'quickfix';
    edits: Array<{
        file: string;
        edit: TextEdit;
    }>;
}
/** Quick-fixes for the diagnostics/commands intersecting the given line. */
export declare function getCodeActions(content: string, file: string, line: number, index: ProjectIndex): CodeAction[];
