import { VirtualFS } from '../fs/virtual-fs';
import { CompletionCommandMetadataProvider, CompletionContext, CompletionDomain } from './completion-context';
import { CommandArg } from './package-db';
import { ProjectIndex } from './project-index';
import { NeutralCompletionItem, NeutralDocument, NeutralPosition } from './protocol';
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
}
export type CompletionResolver = (context: CompletionContext, environment: CompletionResolverEnvironment) => NeutralCompletionItem[];
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
}
