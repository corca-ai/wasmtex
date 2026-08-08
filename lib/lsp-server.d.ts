import { LatexLanguageService, LatexLanguageServiceOptions } from './lsp-service';
export interface JsonRpcMessage {
    jsonrpc?: '2.0';
    id?: number | string | null;
    method?: string;
    params?: Record<string, unknown>;
    result?: unknown;
    error?: {
        code: number;
        message: string;
    };
}
export type SendMessage = (message: JsonRpcMessage) => void;
export declare function pathFromUri(uri: string): string;
export declare function uriFromPath(path: string): string;
export declare class LatexLspServer {
    private send;
    private service;
    private readonly cancelledRequests;
    constructor(send: SendMessage, options?: LatexLanguageServiceOptions | LatexLanguageService);
    /** Feed one incoming JSON-RPC message. Responses/notifications go to `send`. */
    handle(message: JsonRpcMessage): void | Promise<void>;
    private dispatch;
    private respondDispatchError;
    private respond;
    private respondError;
    private didOpen;
    private didChange;
    private didClose;
    private completion;
    private hover;
    private definition;
    private references;
    private rename;
    /** URIs that currently carry diagnostics — so the next publish can clear them. */
    private publishedUris;
    /**
     * Publish diagnostics project-wide. Diagnostics are computed across the whole
     * project, so a change in one file can fix (or introduce) markers in another;
     * publishing only the changed file would leave stale cross-file diagnostics.
     * Files that previously had diagnostics but no longer do are sent an empty array
     * so their markers clear.
     */
    private publishAllDiagnostics;
}
