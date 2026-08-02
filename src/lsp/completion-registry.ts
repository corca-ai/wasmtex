import type { VirtualFS } from '../fs/virtual-fs'
import type {
  CompletionCommandMetadataProvider,
  CompletionContext,
  CompletionDomain,
} from './completion-context'
import type { CommandArg } from './package-db'
import { getCommandSignature } from './package-db'
import type { ProjectIndex } from './project-index'
import type { NeutralCompletionItem, NeutralDocument, NeutralPosition } from './protocol'

/** Minimal cancellation shape shared by Monaco, headless hosts, and resolver implementations. */
export interface CompletionCancellationToken {
  readonly isCancellationRequested: boolean
}

export interface CompletionResolverEnvironment {
  document: NeutralDocument
  position: NeutralPosition
  index: ProjectIndex
  fs: VirtualFS
  cancellationToken?: CompletionCancellationToken
}

export type CompletionResolver = (
  context: CompletionContext,
  environment: CompletionResolverEnvironment,
) => NeutralCompletionItem[]

/**
 * Host-neutral command metadata and value-domain resolver registry.
 *
 * A service may own an isolated registry, while the compatibility provider uses a shared
 * default instance. Registering a command here overrides only that registry; package-shard
 * metadata remains the process-wide fallback maintained by package-db.
 */
export class CompletionResolverRegistry implements CompletionCommandMetadataProvider {
  private commandArguments = new Map<string, readonly CommandArg[]>()
  private resolvers = new Map<CompletionDomain, CompletionResolver>()

  registerCommand(command: string, args: readonly CommandArg[]): void {
    this.commandArguments.set(command, args)
  }

  getCommandArguments(command: string): readonly CommandArg[] | undefined {
    return this.commandArguments.get(command) ?? getCommandSignature(command)
  }

  registerResolver(domain: CompletionDomain, resolver: CompletionResolver): void {
    this.resolvers.set(domain, resolver)
  }

  hasResolver(domain: CompletionDomain): boolean {
    return this.resolvers.has(domain)
  }

  resolve(
    context: CompletionContext,
    environment: CompletionResolverEnvironment,
  ): NeutralCompletionItem[] {
    if (environment.cancellationToken?.isCancellationRequested) return []
    const resolver = this.resolvers.get(context.domain)
    if (!resolver) return []
    const items = resolver(context, environment)
    if (environment.cancellationToken?.isCancellationRequested) return []
    return items.map((item) =>
      item.replacementRange ? item : { ...item, replacementRange: context.replacementRange },
    )
  }
}
