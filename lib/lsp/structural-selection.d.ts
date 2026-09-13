import { CompletionCommandMetadataProvider } from './completion-context.js';
import { CompletionCancellationToken } from './completion-registry.js';
import { Token } from './latex-tokenizer.js';
import { NeutralRange } from './protocol.js';
import { FileSymbols } from './types.js';
type OffsetRange = [number, number];
/** File-local parser evidence. Never contains expanded or synthesized source. */
interface StructuralSelectionIndex {
    masked: string;
    lineStarts: number[];
    commands: Token[];
    groups: ReadonlyMap<number, number>;
    balancedGroups: ReadonlyMap<number, number>;
    ranges: OffsetRange[];
    excluded: OffsetRange[];
}
export declare function getStructuralSelectionIndex(symbols: FileSymbols | undefined): StructuralSelectionIndex | undefined;
export declare function structuralSelectionEstimatedBytes(symbols: FileSymbols): number;
export declare function cacheStructuralSelectionIndex(symbols: FileSymbols, masked: string, tokens: readonly Token[], lineStarts: number[], excluded: OffsetRange[], environments: OffsetRange[], existingGroups?: ReadonlyMap<number, number>): void;
/** Smallest-to-largest, strict containment; a query never mutates the cached index. */
export declare function structuralSelectionRanges(index: StructuralSelectionIndex | undefined, line: number, column: number, metadata: CompletionCommandMetadataProvider, cancellation?: CompletionCancellationToken): NeutralRange[];
export {};
