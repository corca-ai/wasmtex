import { CompletionResolverEnvironment } from './completion-registry.js';
import { NeutralCompletionItem } from './protocol.js';
import { TexSemanticShard } from './semantic-catalog.js';
export declare function completeColors(environment: CompletionResolverEnvironment, shards: TexSemanticShard[]): NeutralCompletionItem[];
