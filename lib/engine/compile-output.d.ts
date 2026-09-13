/** Published controllers can attach a previous run's file after TeX exits early.
 * The explicit terminal no-output diagnostic overrides their status-1 success. */
export declare function hasFatalNoOutput(log: string): boolean;
export declare function compileArtifact(bytes: ArrayBuffer | undefined, noOutput: boolean): Uint8Array | null;
