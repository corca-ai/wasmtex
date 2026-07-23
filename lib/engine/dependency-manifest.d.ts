import { CompileResult, DependencyManifest } from '../types';
import { TexEngine } from './engine-select';
export interface AuxiliaryDependencyObservation {
    stage: 'bibliography' | 'index';
    projectInputs: string[];
    complete: boolean;
}
interface BuildDependencyManifestOptions {
    engine: TexEngine;
    root: string;
    projectFiles: string[];
    generatedFiles?: Iterable<string>;
    auxiliaryStages?: AuxiliaryDependencyObservation[];
    result: CompileResult;
}
/**
 * Normalize a path into the virtual project's root-relative namespace.
 *
 * Absolute paths outside `/work` are engine/system inputs and return `null`.
 * Paths that escape the project root are rejected rather than guessed.
 */
export declare function normalizeProjectDependencyPath(raw: string): string | null;
/** Build the sound manifest at the orchestration boundary where project files and
 * auxiliary-stage requests are both visible. */
export declare function buildDependencyManifest(options: BuildDependencyManifestOptions): DependencyManifest;
/** Incremental tail compilation does not currently return recorder observations.
 * Carry the last known inputs for tooling, but explicitly revoke completeness so
 * a newly introduced tail input can never be hidden from a host invalidator. */
export declare function buildIncrementalDependencyManifest(root: string, previous?: DependencyManifest): DependencyManifest;
export {};
