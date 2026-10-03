import { LatexDiagnosticRepairEdit } from './diagnostic-repair-types.js';
import { getStructuralSelectionIndex } from './structural-selection.js';
import { FileSymbols } from './types.js';
/** Insert after the root class declaration, before preamble commands can execute. */
export declare function packagePreambleEdit(text: string, symbols: FileSymbols, root: string, packageName: string, beforeOffset?: number): LatexDiagnosticRepairEdit | null;
export declare function topLevel(index: NonNullable<ReturnType<typeof getStructuralSelectionIndex>>, offset: number): boolean;
