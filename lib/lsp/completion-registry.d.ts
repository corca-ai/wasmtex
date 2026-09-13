import { VirtualFS } from '../fs/virtual-fs.js';
import { CompletionCommandMetadataProvider, CompletionContext, CompletionDomain } from './completion-context.js';
import { CommandArg } from './package-db.js';
import { ProjectIndex } from './project-index.js';
import { NeutralCompletionItem, NeutralCompletionList, NeutralDocument, NeutralPosition } from './protocol.js';
/** Minimal cancellation shape shared by Monaco, headless hosts, and resolver implementations. */
export interface CompletionCancellationToken {
    readonly isCancellationRequested: boolean;
}
export interface CompletionResolverEnvironment {
    document: NeutralDocument;
    position: NeutralPosition;
    index: ProjectIndex;
    fs: VirtualFS;
    cancellationToken?: CompletionCancellationToken;
    /** Async catalog work required to settle this completion request. */
    waitUntil?: (pending: Promise<unknown>) => void;
}
export type CompletionResolverResult = NeutralCompletionItem[] | NeutralCompletionList;
export type CompletionResolver = (context: CompletionContext, environment: CompletionResolverEnvironment) => CompletionResolverResult;
/**
 * Host-neutral command metadata and value-domain resolver registry.
 *
 * A service may own an isolated registry, while the compatibility provider uses a shared
 * default instance. Registering a command here overrides only that registry; package-shard
 * metadata remains the process-wide fallback maintained by package-db.
 */
export declare class CompletionResolverRegistry implements CompletionCommandMetadataProvider {
    private commandArguments;
    private resolvers;
    registerCommand(command: string, args: readonly CommandArg[]): void;
    getCommandArguments(command: string): readonly CommandArg[] | undefined;
    registerResolver(domain: CompletionDomain, resolver: CompletionResolver): void;
    hasResolver(domain: CompletionDomain): boolean;
    resolve(context: CompletionContext, environment: CompletionResolverEnvironment): NeutralCompletionItem[];
    resolveResult(context: CompletionContext, environment: CompletionResolverEnvironment): NeutralCompletionList;
}
