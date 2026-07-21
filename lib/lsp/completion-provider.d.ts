import { VirtualFS } from '../fs/virtual-fs';
import { ProjectIndex } from './project-index';
import * as monaco from 'monaco-editor';
/** Monaco completion adapter over the editor-neutral {@link provideCompletions}. */
export declare function createCompletionProvider(index: ProjectIndex, fs: VirtualFS): monaco.languages.CompletionItemProvider;
