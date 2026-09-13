import type { CompletionCommandMetadataProvider } from './completion-context'
import type { CompletionResolverRegistry } from './completion-registry'
import type { CommandArg } from './package-db'
import type { ProjectIndex } from './project-index'

/** Project declarations shadow catalog knowledge even when their structure is unknown. */
export function projectCommandMetadata(
  index: ProjectIndex,
  path: string,
  fallback: CompletionResolverRegistry,
): CompletionCommandMetadataProvider {
  const definitions = new Map<string, readonly CommandArg[]>()
  for (const definition of index.getCommandDefs(path)) {
    const args =
      definitions.has(definition.name) || definition.mayRedefine ? [] : (definition.arguments ?? [])
    definitions.set(definition.name, args)
    definitions.set(`${definition.name}*`, definition.acceptsStar ? args : [])
  }
  const scopes = [
    ...[...index.getLoadedPackages(path)].map((name) => `package/${name}`),
    ...[...index.getLoadedClasses(path)].map((name) => `class/${name}`),
  ]
  return {
    getCommandArguments: (command) =>
      definitions.get(command) ?? fallback.getScopedCommandArguments(command, scopes),
  }
}
