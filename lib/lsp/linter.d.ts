import { Diagnostic } from './diagnostic-provider';
export type LintRuleId = 'nbsp-before-ref' | 'space-before-punctuation' | 'doubled-space' | 'ellipsis' | 'straight-double-quotes' | 'display-math-dollars' | 'en-dash-range' | 'math-operator-as-text' | 'footnote-spacing' | 'abbreviation-spacing';
type Severity = 'error' | 'warning' | 'info';
export interface LintRuleConfig {
    enabled: boolean;
    severity: Severity;
}
export type LintConfig = Record<LintRuleId, LintRuleConfig>;
/** Default configuration. Noisy rules (e.g. abbreviation spacing) ship disabled. */
export declare const DEFAULT_LINT_CONFIG: LintConfig;
/**
 * Lint a single LaTeX source string. Returns style/correctness diagnostics for
 * the enabled rules. `config` is per-rule merged over {@link DEFAULT_LINT_CONFIG}:
 * a partial rule override (e.g. `{ 'doubled-space': { severity: 'error' } }`)
 * keeps the rule's other default fields (here `enabled: true`) instead of
 * replacing the whole rule object.
 */
export declare function lintSource(content: string, filePath: string, config?: Partial<Record<LintRuleId, Partial<LintRuleConfig>>>): Diagnostic[];
export {};
