import { Diagnostic } from './diagnostic-provider.js';
import { ReferenceRepairSource } from './reference-repair-source.js';
/** Only exact literal source locations enter the repairable diagnostic surface. */
export declare function referenceRepairDiagnostics(source: ReferenceRepairSource): Diagnostic[];
