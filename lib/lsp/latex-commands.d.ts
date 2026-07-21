interface LatexCommand {
    name: string;
    snippet: string;
    detail?: string;
    documentation?: string;
    package?: string;
}
interface LatexEnvironment {
    name: string;
    snippet: string;
    detail?: string;
    package?: string;
}
export declare const LATEX_COMMANDS: LatexCommand[];
export declare function getCommandByName(name: string): LatexCommand | undefined;
export declare const LATEX_ENVIRONMENTS: LatexEnvironment[];
export declare function getEnvironmentByName(name: string): LatexEnvironment | undefined;
export declare const COMMON_PACKAGES: string[];
export {};
