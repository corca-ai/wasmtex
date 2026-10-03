import { DiagnosticRepairSource } from './diagnostic-repair.js';
import { LatexPdfMetadataRepairProposal } from './diagnostic-repair-types.js';
/** A conservative source-backed proposal, never a write or an expansion of user macros. */
export declare function getPdfMetadataRepairs(source: DiagnosticRepairSource, path: string, offset: number): LatexPdfMetadataRepairProposal[];
