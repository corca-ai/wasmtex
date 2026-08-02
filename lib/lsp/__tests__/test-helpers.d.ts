import * as monaco from 'monaco-editor';
export interface MockModel {
    getValue(): string;
    getLineContent(lineNumber: number): string;
    uri: monaco.Uri;
}
export declare function mockModel(lines?: string[], path?: string): MockModel;
