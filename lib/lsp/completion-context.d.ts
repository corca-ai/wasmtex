import { BibCompletionContext } from './bib-completion-context';
import { CommandArg, CompletionValueKind } from './package-db';
import { NeutralDocument, NeutralPosition, NeutralRange } from './protocol';
export type CompletionDomain = 'command' | CompletionValueKind;
export interface CompletionCommandMetadataProvider {
    getCommandArguments(command: string): readonly CommandArg[] | undefined;
}
interface CompletionContextBase {
    /** Project-relative path of the active document. */
    documentPath: string;
    /** Prefix before the cursor used to filter candidates. */
    prefix: string;
    /** Exact edit range, including a suffix after the cursor when present. */
    replacementRange: NeutralRange;
    /** Resolver domain selected for this context. */
    domain: CompletionDomain;
}
export interface CommandNameCompletionContext extends CompletionContextBase {
    type: 'command';
    domain: 'command';
}
export interface RelatedCompletionArgument {
    argumentIndex: number;
    signatureIndex?: number;
    valueKind: CompletionValueKind;
    values: string[];
}
export interface CommandArgumentCompletionContext extends CompletionContextBase {
    type: 'argument';
    command: string;
    starred: boolean;
    /** Index among groups that are actually present in the invocation. */
    argumentIndex: number;
    /** Index in the declared command signature, when the group matched one. */
    signatureIndex?: number;
    delimiter: 'required' | 'optional';
    valueKind: CompletionValueKind;
    list: boolean;
    listIndex: number;
    keyFamily?: string;
    keyValuePosition?: 'key' | 'value';
    key?: string;
    /** Keys used by sibling list items, excluding the item currently being edited. */
    usedKeys: string[];
    /** Semantic sibling arguments, including resource selectors after the cursor. */
    relatedArguments: RelatedCompletionArgument[];
    /** Resource argument selected by this argument's metadata, when present. */
    selector?: RelatedCompletionArgument;
    /** Project key family selected by a sibling argument, when present. */
    keyFamilySelector?: RelatedCompletionArgument;
}
export type CompletionContext = CommandNameCompletionContext | CommandArgumentCompletionContext | BibCompletionContext;
/** Analyze a completion position using the full active document. Never throws. */
export declare function analyzeCompletionContext(document: NeutralDocument, position: NeutralPosition, metadata?: CompletionCommandMetadataProvider): CompletionContext | null;
export {};
