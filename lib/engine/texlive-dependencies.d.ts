import { CompletionSnapshotProfile, ResolverEvidenceReport, TexliveDependencySet, TexliveVersion } from '../types';
export interface TexliveDependencyOptions {
    /** Request names to leave out of `notFound` — project inputs and generated
     *  auxiliary files that kpathsea probes on the mirror before finding them in
     *  the work directory. They are absent on every mirror and would only bloat
     *  a persisted set. */
    excludeNames?: ReadonlySet<string>;
}
export declare function buildTexliveDependencySet(texliveVersion: TexliveVersion, profile: CompletionSnapshotProfile, reports: ReadonlyArray<ResolverEvidenceReport | undefined>, options?: TexliveDependencyOptions): TexliveDependencySet | undefined;
/** Union two sets observed under the same profile. A preamble-snapshot compile never
 *  looks up the files the snapshot baked in, so a single compile's evidence is only the
 *  body's; the session union keeps what earlier compiles resolved. The later set's
 *  entry wins on a name clash (it may carry a fresher candidate); a request the later
 *  set resolved leaves `notFound`. */
export declare function mergeTexliveDependencySets(previous: TexliveDependencySet | undefined, next: TexliveDependencySet): TexliveDependencySet;
