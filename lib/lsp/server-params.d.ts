export declare class RpcError extends Error {
    readonly code: number;
    constructor(code: number, message: string);
}
export declare function record(value: unknown, label: string): Record<string, unknown>;
export declare function text(value: unknown, label: string, allowEmpty?: boolean): string;
export declare function documentParams(params: Record<string, unknown> | undefined): {
    uri: string;
    version: number;
};
export declare function positionParams(params: Record<string, unknown> | undefined): {
    textDocument: {
        uri: string;
    };
    position: {
        line: number;
        character: number;
    };
};
export declare function openParams(params: Record<string, unknown> | undefined): {
    text: string;
    languageId: string;
    uri: string;
    version: number;
};
export declare function changeParams(params: Record<string, unknown> | undefined): {
    content: string | undefined;
    uri: string;
    version: number;
};
