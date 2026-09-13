import { CompletionCommandMetadataProvider } from './completion-context.js';
import { CompletionCancellationToken } from './completion-registry.js';
import { RepairArgumentConsumption } from './diagnostic-repair-arguments.js';
import { Token } from './latex-tokenizer.js';
import { CommandArg } from './package-db.js';
import { FileSymbols } from './types.js';
export interface RepairInvocation {
    token: Token;
    name: string;
    signature: readonly CommandArg[];
    consumption: RepairArgumentConsumption;
}
/** Source commands only; template, verbatim and inactive spans belong to the parser. */
export declare function repairInvocations(source: string, symbols: FileSymbols, metadata: CompletionCommandMetadataProvider, cancellation?: CompletionCancellationToken): RepairInvocation[];
