import { Token } from './latex-tokenizer.js';
import { CommandArg } from './package-db.js';
import { getStructuralSelectionIndex } from './structural-selection.js';
type SourceIndex = NonNullable<ReturnType<typeof getStructuralSelectionIndex>>;
export interface ConsumedRepairArgument {
    spec: CommandArg;
    start: number;
    end: number;
    /** A control sequence used as one argument is not a separate source invocation. */
    commandOffset?: number;
    grouped: boolean;
}
export interface RepairArgumentConsumption {
    arguments: ConsumedRepairArgument[];
    missing: readonly CommandArg[];
    insertOffset: number;
    missingBoundary?: 'eof' | 'group';
}
/**
 * Undelimited TeX argument consumption, not completion's tolerant group collection.
 * A command token consumes one argument without expanding its own arguments first.
 * null means that this source cannot prove which argument is missing.
 */
export declare function consumeRepairArguments(source: string, index: SourceIndex, commands: ReadonlyMap<number, Token>, start: number, signature: readonly CommandArg[]): RepairArgumentConsumption | null;
export {};
