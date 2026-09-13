import { ProjectIndex } from './project-index.js';
import * as monaco from 'monaco-editor';
/** Monaco hover adapter over the editor-neutral {@link provideHover}. */
export declare function createHoverProvider(index: ProjectIndex): monaco.languages.HoverProvider;
