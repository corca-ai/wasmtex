export interface CommandArg {
    kind: 'required' | 'optional';
    /** The snippet placeholder text, e.g. `text` from `${1:text}` (may be empty). */
    placeholder?: string;
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
/** The source package for a known command (undefined = LaTeX kernel / always available). */
export declare function getCommandPackage(name: string): string | undefined;
/** Render a signature like `\href{url}{text}` (placeholders) or `\frac{}{}`. */
export declare function formatSignature(name: string, args: CommandArg[]): string;
export {};
