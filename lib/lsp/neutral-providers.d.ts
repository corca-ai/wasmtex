import { VirtualFS } from '../fs/virtual-fs';
import { ProjectIndex } from './project-index';
import { NeutralCompletionItem, NeutralDocument, NeutralHover, NeutralLocation, NeutralPosition } from './protocol';
type CompletionContextType = 'command' | 'ref' | 'cite' | 'begin' | 'end' | 'usepackage' | 'include';
interface CompletionContext {
    type: CompletionContextType;
    prefix: string;
}
/** Detect what kind of completion the cursor is in (editor-neutral). */
export declare function detectCompletionContext(lineContent: string, column: number): CompletionContext | null;
/** Compute completions at a position (editor-neutral). */
export declare function provideCompletions(doc: NeutralDocument, pos: NeutralPosition, index: ProjectIndex, fs: VirtualFS): NeutralCompletionItem[];
/** Hover info at a position (editor-neutral). */
export declare function provideHover(doc: NeutralDocument, pos: NeutralPosition, index: ProjectIndex): NeutralHover | null;
/** Go-to-definition target at a position (editor-neutral). */
export declare function provideDefinition(doc: NeutralDocument, pos: NeutralPosition, index: ProjectIndex): NeutralLocation | null;
/** Find-all-references at a position (editor-neutral). */
export declare function provideReferences(doc: NeutralDocument, pos: NeutralPosition, index: ProjectIndex): NeutralLocation[];
/** Offset → 1-based line/column (re-exported for adapters). */
export declare function positionAt(text: string, offset: number): NeutralPosition;
export {};
