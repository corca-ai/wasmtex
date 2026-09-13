import { AuxData } from './types.js';
/** Compiler-output paths are relative to the TeX working directory, including
 * paths named by @input in a nested main document's aux file. */
export interface AuxFileSet {
    root: string;
    files: Readonly<Record<string, string>>;
}
/** Read only aux paths discovered from compiler output. The callback is the
 * host's authorization boundary, e.g. compiler.readOutput, never project fetch. */
export declare function readAuxFiles(root: string, read: (path: string) => Promise<string | null>): Promise<AuxFileSet>;
/** Resolve @input recursively using only explicitly supplied output bytes.
 * Incomplete graphs retain diagnostic data but cannot supply reference hints. */
export declare function parseAuxFiles(input: AuxFileSet): AuxData;
