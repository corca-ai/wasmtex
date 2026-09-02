import { CompletionSnapshotProfile, ResolverEvidenceReport, TexliveDependencySet, TexliveVersion } from '../types';
export interface TexliveDependencyOptions {
    /** Request names to leave out of `notFound` — project inputs and generated
     *  auxiliary files that kpathsea probes on the mirror before finding them in
     *  the work directory. They are absent on every mirror and would only bloat
     *  a persisted set. */
    excludeNames?: ReadonlySet<string>;
}
export declare function buildTexliveDependencySet(texliveVersion: TexliveVersion, profile: CompletionSnapshotProfile, reports: ReadonlyArray<ResolverEvidenceReport | undefined>, options?: TexliveDependencyOptions): TexliveDependencySet | undefined;
