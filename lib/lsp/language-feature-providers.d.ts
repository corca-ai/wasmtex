import { ProjectIndex } from './project-index';
/**
 * Monaco bindings for the editor-neutral language features in
 * `language-features.ts`. Each provider reads the model text, calls the pure
 * core, and converts the result to Monaco types.
 */
import * as monaco from 'monaco-editor';
export declare function createSignatureHelpProvider(): monaco.languages.SignatureHelpProvider;
export declare function createFoldingRangeProvider(): monaco.languages.FoldingRangeProvider;
export declare function createDocumentHighlightProvider(index: ProjectIndex): monaco.languages.DocumentHighlightProvider;
export declare function createInlayHintsProvider(index: ProjectIndex): monaco.languages.InlayHintsProvider;
export declare function createLinkProvider(): monaco.languages.LinkProvider;
export declare function createSemanticTokensProvider(): monaco.languages.DocumentSemanticTokensProvider;
/** Code-action provider. Applies workspace edits through `onWorkspaceEdit` if provided. */
export declare function createCodeActionProvider(index: ProjectIndex): monaco.languages.CodeActionProvider;
