import { VirtualFS } from '../fs/virtual-fs.js';
import { CompletionResolverRegistry } from './completion-registry.js';
import { ProjectIndex } from './project-index.js';
import * as monaco from 'monaco-editor';
/** Monaco completion adapter over the editor-neutral completion result. */
export declare function createCompletionProvider(index: ProjectIndex, fs: VirtualFS, registry?: CompletionResolverRegistry): monaco.languages.CompletionItemProvider;
/** Monaco adapter that settles request-scoped lazy catalogs before returning suggestions. */
export declare function createAsyncCompletionProvider(index: ProjectIndex, fs: VirtualFS, registry?: CompletionResolverRegistry): monaco.languages.CompletionItemProvider;
