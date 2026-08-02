import { SemanticTrace } from './trace-parser';
import { AuxData, BibEntry, BibitemDef, ColorDefinition, CommandDef, EnvironmentUse, FileSymbols, LabelDef, LabelRef } from './types';
export interface EngineCommandInfo {
    name: string;
    eqType: number;
    argCount: number;
    category: 'macro' | 'primitive' | 'unknown';
}
export declare class ProjectIndex {
    private files;
    private auxData;
    private bibEntries;
    private engineCommands;
    private engineEnvironments;
    private semanticTrace;
    private activeFilesCache;
    private labelDefIndex;
    private labelRefIndex;
    private citationIndex;
    private bibItemIndex;
    private commandIndex;
    private commandRefIndex;
    private envDefIndex;
    private bibEntryIndex;
    private allLabelsCache;
    updateFile(filePath: string, content: string): void;
    removeFile(filePath: string): void;
    private addToIndexes;
    private removeFromIndexes;
    updateAux(content: string): void;
    updateBib(entries: BibEntry[]): void;
    updateAuxData(data: AuxData): void;
    getFiles(): string[];
    hasFile(filePath: string): boolean;
    getAllLabels(): LabelDef[];
    getAllLabelRefs(name: string): LabelRef[];
    getFileSymbols(filePath: string): FileSymbols | undefined;
    /** Files in the deterministic include component that compiles the requested document. */
    getActiveFiles(filePath: string): string[];
    private includeGraph;
    getActiveColors(filePath: string): ColorDefinition[];
    getActiveColorNames(filePath: string): Set<string>;
    getLoadedClasses(filePath?: string): Set<string>;
    getClassOptions(filePath?: string): Set<string>;
    getPackageOptions(name: string, filePath?: string): Set<string>;
    getCommandDefs(): CommandDef[];
    getAllEnvironments(): string[];
    /** Names of all packages loaded via `\usepackage`/`\RequirePackage` in the project. */
    getLoadedPackages(filePath?: string): Set<string>;
    private symbolsInScope;
    private resolveInclude;
    getBibEntries(): BibEntry[];
    getAuxLabels(): Map<string, string>;
    getAuxCitations(): Set<string>;
    resolveLabel(name: string): string | undefined;
    /** Find the LabelDef for a given label name */
    findLabelDef(name: string): LabelDef | undefined;
    updateEngineCommands(commands: string[]): void;
    getEngineCommands(): ReadonlyMap<string, EngineCommandInfo>;
    getEngineEnvironments(): ReadonlySet<string>;
    updateSemanticTrace(trace: SemanticTrace): void;
    getSemanticTrace(): SemanticTrace | null;
    /** Find the BibitemDef for a given citation key */
    findBibitemDef(key: string): BibitemDef | undefined;
    /** Find the BibEntry for a given citation key in .bib files */
    findBibEntry(key: string): BibEntry | undefined;
    /** Find the CommandDef for a given command name */
    findCommandDef(name: string): CommandDef | undefined;
    /** Find the Environment definition for a given environment name */
    findEnvironmentDef(name: string): EnvironmentUse | undefined;
    /** Find the symbol at a given position and its usage locations */
    findSymbolAt(filePath: string, line: number, column: number): {
        name: string;
        type: 'label' | 'citation' | 'command';
    } | undefined;
    private findLabelAt;
    private findCitationAt;
    private findCommandAt;
    /**
     * Find all occurrences of a symbol across the project. O(result) — backed by
     * the inverted indexes, not a full-project scan.
     */
    findAllOccurrences(name: string, type: 'label' | 'citation' | 'command'): Occurrence[];
    private occurrenceLocations;
}
/** A single occurrence of a symbol (definition or use) in the project. */
export interface Occurrence {
    filePath: string;
    line: number;
    column: number;
    length: number;
}
