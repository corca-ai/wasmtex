import { VirtualFS } from '../fs/virtual-fs';
import { CompletionCancellationToken, CompletionResolverRegistry } from './completion-registry';
import { ProjectIndex } from './project-index';
import { NeutralCompletionItem, NeutralCompletionList, NeutralDocument, NeutralHover, NeutralLocation, NeutralPosition } from './protocol';
import { TexResourceCatalogProvider } from './resource-catalog';
import { TexSemanticCatalogProvider } from './semantic-catalog';
type LegacyCompletionContextType = 'command' | 'ref' | 'cite' | 'begin' | 'end' | 'usepackage' | 'include';
interface LegacyCompletionContext {
    type: LegacyCompletionContextType;
    prefix: string;
}
/**
 * Compatibility wrapper for the former line-only context API. New integrations should use
 * {@link analyzeCompletionContext}, which handles multiline invocations and exact ranges.
 */
export declare function detectCompletionContext(lineContent: string, column: number): LegacyCompletionContext | null;
export interface ProvideCompletionOptions {
    registry?: CompletionResolverRegistry;
    cancellationToken?: CompletionCancellationToken;
}
export interface DefaultCompletionRegistryOptions {
    resourceCatalog?: TexResourceCatalogProvider;
    semanticCatalog?: TexSemanticCatalogProvider;
}
/** Create an isolated registry with WasmTex's built-in completion domains. */
export declare function createDefaultCompletionRegistry(options?: DefaultCompletionRegistryOptions): CompletionResolverRegistry;
/** Start loading semantic shards for packages already present in the project. */
export declare function preloadSemanticCatalog(registry: CompletionResolverRegistry, index: ProjectIndex, cancellationToken?: CompletionCancellationToken): void;
/** Compute completions at a position (editor-neutral). */
export declare function provideCompletions(doc: NeutralDocument, pos: NeutralPosition, index: ProjectIndex, fs: VirtualFS, options?: ProvideCompletionOptions): NeutralCompletionItem[];
/** Compute completions plus lazy-loading state at a position (editor-neutral). */
export declare function provideCompletionResult(doc: NeutralDocument, pos: NeutralPosition, index: ProjectIndex, fs: VirtualFS, options?: ProvideCompletionOptions): NeutralCompletionList;
/** Hover info at a position (editor-neutral). */
export declare function provideHover(doc: NeutralDocument, pos: NeutralPosition, index: ProjectIndex): NeutralHover | null;
/** Go-to-definition target at a position (editor-neutral). */
export declare function provideDefinition(doc: NeutralDocument, pos: NeutralPosition, index: ProjectIndex): NeutralLocation | null;
/** Find-all-references at a position (editor-neutral). */
export declare function provideReferences(doc: NeutralDocument, pos: NeutralPosition, index: ProjectIndex): NeutralLocation[];
/** Offset → 1-based line/column (re-exported for adapters). */
export declare function positionAt(text: string, offset: number): NeutralPosition;
export {};
