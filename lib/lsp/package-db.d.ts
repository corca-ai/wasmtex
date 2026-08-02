/** Semantic value domains understood by the completion resolver registry. */
export type CompletionValueKind = 'tex-class' | 'tex-package' | 'bib-style' | 'biblatex-style' | 'project-tex' | 'project-bib' | 'project-image' | 'project-file' | 'font-family' | 'color' | 'label' | 'citation' | 'environment' | 'counter' | 'length' | 'glossary-key' | 'acronym-key' | 'boolean' | 'enum' | 'number' | 'dimension' | 'command' | 'key-value' | 'free-text';
export interface CommandArg {
    kind: 'required' | 'optional';
    /** The snippet placeholder text, e.g. `text` from `${1:text}` (may be empty). */
    placeholder?: string;
    /** Semantic domain used to resolve completion values for this argument. */
    valueKind?: CompletionValueKind;
    /** The argument contains a comma-separated list of values or key/value pairs. */
    list?: boolean;
    /** Named key family used to resolve keys and their typed values. */
    keyFamily?: string;
    /**
     * Signature index of the argument that selects this argument's resource scope.
     * For example, document-class options point at the following class-name argument.
     */
    selectorArgumentIndex?: number;
}
/** Parse a snippet (`\name{$1}[$2]…`) into its argument signature. */
export declare function parseSignature(snippet: string): CommandArg[];
type ShardCommandSpec = {
    name: string;
    args?: CommandArg[];
    doc?: string;
};
/** Register a package shard's commands (and environments) so lookups can resolve them. */
export declare function registerShard(shard: {
    package: string;
    commands: ShardCommandSpec[];
    environments?: {
        name: string;
        args?: CommandArg[];
        doc?: string;
    }[];
}): void;
/** Environment names contributed by loaded shards (for completion / known-env checks). */
export declare function getShardEnvironments(): ReadonlySet<string>;
/** The argument signature for a known command (bundled DB or a loaded shard). */
export declare function getCommandSignature(name: string): CommandArg[] | undefined;
/** The argument signature for a known environment contributed by a package shard. */
export declare function getEnvironmentSignature(name: string): CommandArg[] | undefined;
/** The source package for a known command (undefined = LaTeX kernel / always available). */
export declare function getCommandPackage(name: string): string | undefined;
/** Render a signature like `\href{url}{text}` (placeholders) or `\frac{}{}`. */
export declare function formatSignature(name: string, args: CommandArg[]): string;
export {};
