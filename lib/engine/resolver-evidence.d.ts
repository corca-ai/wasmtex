import { CompletionSnapshotProfile, ResolverEvidenceReport, ResolverStage } from '../types';
export interface RawResolverEvidence {
    requestedName?: unknown;
    format?: unknown;
    outcome?: unknown;
    attempts?: unknown;
}
/** Per-driver, per-command collector for untrusted worker messages. Entries are
 *  keyed by stage/format/request so retries update one final outcome instead of
 *  producing contradictory results. */
export declare class ResolverEvidenceCollector {
    private readonly stage;
    private readonly profile;
    private supported;
    private active;
    private readonly entries;
    private dropped;
    constructor(stage: ResolverStage, profile: CompletionSnapshotProfile);
    markSupported(): void;
    begin(): void;
    record(raw: RawResolverEvidence): void;
    finish(): ResolverEvidenceReport | undefined;
}
export declare function mergeResolverReports(profile: CompletionSnapshotProfile, reports: ReadonlyArray<ResolverEvidenceReport | undefined>): ResolverEvidenceReport;
