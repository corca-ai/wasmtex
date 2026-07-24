import { Diagnostic } from './diagnostic-provider';
import { LintConfig } from './linter';
type LintSetting = boolean | Partial<LintConfig>;
type LintRunner = (content: string, filePath: string, config?: Partial<LintConfig>) => Diagnostic[];
export declare class IncrementalLinter {
    private readonly lint;
    private readonly runLint;
    private readonly cache;
    constructor(lint: LintSetting, runLint?: LintRunner);
    updateFile(path: string, content: string | Uint8Array): boolean;
    removeFile(path: string): boolean;
    diagnostics(paths: readonly string[]): Diagnostic[];
}
export {};
