import { CompletionResolverEnvironment } from './completion-registry';
import { NeutralCompletionItem } from './protocol';
import { TexSemanticShard } from './semantic-catalog';
export declare function completeColors(environment: CompletionResolverEnvironment, shards: TexSemanticShard[]): NeutralCompletionItem[];
