import { CommandArg } from './package-db.js';
import { ProjectIndex } from './project-index.js';
export interface LatexWrapOption {
    kind: 'command' | 'environment';
    name: string;
    /** Signature slots, including optional slots. Null denotes an environment body. */
    selectionArgument: number | null;
    arguments: readonly CommandArg[];
}
export interface WrapDefinition extends LatexWrapOption {
    context: 'text' | 'math';
    package?: string;
    bodyContext?: 'text' | 'math';
}
export declare function activeWrapDefinitions(index: ProjectIndex, path: string): readonly WrapDefinition[];
export declare function publicWrapOption(wrapper: WrapDefinition): LatexWrapOption;
