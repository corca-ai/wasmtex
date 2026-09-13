import { CompletionCommandMetadataProvider } from './completion-context.js';
import { CompletionResolverRegistry } from './completion-registry.js';
import { ProjectIndex } from './project-index.js';
/** Project declarations shadow catalog knowledge even when their structure is unknown. */
export declare function projectCommandMetadata(index: ProjectIndex, path: string, fallback: CompletionResolverRegistry): CompletionCommandMetadataProvider;
