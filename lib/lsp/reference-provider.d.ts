import { ProjectIndex } from './project-index';
import type * as monaco from 'monaco-editor';
/** Monaco find-all-references adapter over the editor-neutral {@link provideReferences}.
 *  Delegating (rather than re-implementing the `\label`/`\ref` matching) keeps a single
 *  source of truth — the two used to drift, which is how the label-trim bug crept in. */
export declare function createReferenceProvider(index: ProjectIndex): monaco.languages.ReferenceProvider;
