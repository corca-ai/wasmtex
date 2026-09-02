import { CompletionSnapshotProfile, ResolverEvidenceReport, TexliveDependencySet, TexliveVersion } from '../types';
export declare function buildTexliveDependencySet(texliveVersion: TexliveVersion, profile: CompletionSnapshotProfile, reports: ReadonlyArray<ResolverEvidenceReport | undefined>): TexliveDependencySet | undefined;
