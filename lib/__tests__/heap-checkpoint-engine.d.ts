import { CompileResult } from '../types.js';
/** A successful compile result; `resumed` marks a heap-checkpoint resume. */
export declare function checkpointResult(resumed?: boolean, extra?: Partial<CompileResult>): CompileResult;
/** A heap-checkpoint engine whose full compiles and resumes return the given results. */
export declare function checkpointEngine(full?: () => CompileResult, resume?: () => CompileResult): {
    supportsHeapCheckpoints: boolean;
    init: () => Promise<void>;
    mkdir: () => Promise<void>;
    writeFile: () => Promise<void>;
    setMainFile: () => void;
    readFile: () => Promise<null>;
    flushCache: () => Promise<void>;
    clearCache: () => Promise<void>;
    terminate: import('vitest').Mock<import('@vitest/spy').Procedure>;
    getStatus: () => "ready";
    compile: import('vitest').Mock<() => Promise<CompileResult>>;
    compileFromHeapCheckpoint: import('vitest').Mock<() => Promise<CompileResult>>;
    dropHeapCheckpoints: () => Promise<void>;
};
