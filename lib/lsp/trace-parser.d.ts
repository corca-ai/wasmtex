export interface SemanticTrace {
    labels: Set<string>;
    refs: Set<string>;
}
export declare function parseTraceFile(content: string): SemanticTrace;
