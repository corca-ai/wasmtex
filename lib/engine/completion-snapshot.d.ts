import { CompletionSnapshot, CompletionSnapshotEngine, CompletionSnapshotProfile } from '../types';
export declare const COMPLETION_SNAPSHOT_SCHEMA_VERSION: 1;
export declare const COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES: number;
export interface CompletionSnapshotProjectFile {
    path: string;
    content: string | Uint8Array;
}
/** Bounded, engine-private observations produced after a normal engine pass. */
export interface EngineCompletionObservation {
    counters: string[];
    colors: string[];
    keyFamilies: Array<{
        name: string;
        keys: string[];
    }>;
    complete: boolean;
    fieldCompleteness?: {
        counters: boolean;
        colors: boolean;
        keyFamilies: boolean;
    };
    dropped?: {
        counters: number;
        colors: number;
        keyFamilies: number;
    };
}
export interface CreateCompletionSnapshotOptions {
    engine: CompletionSnapshotEngine;
    root: string;
    profile: CompletionSnapshotProfile;
    projectFiles: Iterable<CompletionSnapshotProjectFile>;
    engineCommands?: readonly string[];
    engineCommandsComplete?: boolean;
    engineCommandsDropped?: number;
    engineObservation?: EngineCompletionObservation;
    inputFiles?: readonly string[];
    inputFilesComplete?: boolean;
}
/** Hash paths, content kinds, and bytes without concatenating the whole project in memory. */
export declare function completionProjectRevision(files: Iterable<CompletionSnapshotProjectFile>): Promise<string>;
/** Validate and bound snapshots before retaining data received across a host/RPC boundary. */
export declare function boundCompletionSnapshot(snapshot: CompletionSnapshot): CompletionSnapshot;
export declare function createCompletionSnapshot(options: CreateCompletionSnapshotOptions): Promise<CompletionSnapshot>;
/** Parse the authored pdfTeX controller's bounded tab-delimited observation file. */
export declare function parseEngineCompletionObservation(lines: readonly unknown[]): EngineCompletionObservation;
