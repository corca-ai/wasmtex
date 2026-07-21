import { NeutralLocation } from './protocol';
import { SourceLocation } from './types';
import * as monaco from 'monaco-editor';
/** Convert a SourceLocation to a Monaco Location (uri + range).
 *  Monaco-only — kept out of `latex-patterns.ts` so the pure parser (and the headless
 *  core that uses it) carries no `monaco-editor` dependency (#108 boundary). */
export declare function sourceLocationToMonaco(loc: SourceLocation): monaco.languages.Location;
/** Convert an editor-neutral {@link NeutralLocation} (file + range) to a Monaco Location,
 *  so Monaco adapters can delegate to the neutral provider cores without re-implementing
 *  their logic. */
export declare function neutralLocationToMonaco(loc: NeutralLocation): monaco.languages.Location;
