/** One main-engine operation, including all of its asynchronous continuations. */
export declare class CompilerOperations {
    private active;
    get busy(): boolean;
    cancel(): Promise<void>;
    run<T>(work: () => Promise<T>): Promise<T>;
    assertCurrent(): void;
    observe<T>(promise: PromiseLike<T> | T): Promise<{
        resume(): T;
    }>;
}
