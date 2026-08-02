import { VirtualFS } from '../fs/virtual-fs';
import { CompletionResolverRegistry } from './completion-registry';
import { ProjectIndex } from './project-index';
import * as monaco from 'monaco-editor';
/** Monaco completion adapter over the editor-neutral {@link provideCompletions}. */
export declare function createCompletionProvider(index: ProjectIndex, fs: VirtualFS, registry?: CompletionResolverRegistry): monaco.languages.CompletionItemProvider;
