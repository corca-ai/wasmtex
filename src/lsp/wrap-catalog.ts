import { type CommandArg, getCommandSignature } from './package-db'
import type { ProjectIndex } from './project-index'

export interface LatexWrapOption {
  kind: 'command' | 'environment'
  name: string
  /** Signature slots, including optional slots. Null denotes an environment body. */
  selectionArgument: number | null
  arguments: readonly CommandArg[]
}

export interface WrapDefinition extends LatexWrapOption {
  context: 'text' | 'math'
  package?: string
  bodyContext?: 'text' | 'math'
}

const command = (
  name: string,
  context: 'text' | 'math',
  selectionArgument = 0,
): WrapDefinition => ({
  kind: 'command',
  name,
  context,
  selectionArgument,
  arguments: getCommandSignature(name) ?? [],
})
const environment = (name: string, context: 'text' | 'math', pkg?: string): WrapDefinition => ({
  kind: 'environment',
  name,
  context,
  selectionArgument: null,
  bodyContext: name === 'equation' || context === 'math' ? 'math' : 'text',
  arguments: [],
  ...(pkg ? { package: pkg } : {}),
})

/** Explicit authoring contracts, not an inference from arbitrary completion snippets. */
const wrappers: readonly WrapDefinition[] = [
  ...['emph', 'textbf', 'textit', 'texttt', 'underline'].map((name) => command(name, 'text')),
  ...['mathrm', 'mathbf'].map((name) => command(name, 'math')),
  command('sqrt', 'math', 1),
  command('frac', 'math'),
  ...['quote', 'quotation', 'center', 'flushleft', 'flushright', 'equation'].map((name) =>
    environment(name, 'text'),
  ),
  environment('aligned', 'math', 'amsmath'),
]

export function activeWrapDefinitions(
  index: ProjectIndex,
  path: string,
): readonly WrapDefinition[] {
  const commands = new Set(index.getCommandDefs(path).map((definition) => definition.name))
  const environments = new Set(
    index.getEnvironmentDefinitions(path).map((definition) => definition.name),
  )
  const packages = index.getLoadedPackages(path)
  return wrappers.filter(
    (wrapper) =>
      (wrapper.kind !== 'command' ||
        (wrapper.selectionArgument !== null &&
          wrapper.arguments[wrapper.selectionArgument]?.kind === 'required')) &&
      !environments.has(wrapper.name) &&
      !commands.has(wrapper.name) &&
      !commands.has(`end${wrapper.name}`) &&
      (!wrapper.package || packages.has(wrapper.package)),
  )
}

export function publicWrapOption(wrapper: WrapDefinition): LatexWrapOption {
  return {
    kind: wrapper.kind,
    name: wrapper.name,
    selectionArgument: wrapper.selectionArgument,
    arguments: wrapper.arguments.map((argument) => ({ ...argument })),
  }
}
