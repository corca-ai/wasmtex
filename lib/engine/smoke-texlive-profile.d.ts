export type SmokeTexliveProfile = {
    version: '2025' | '2026';
    url: string;
};
export declare function smokeTexliveProfile(env?: Partial<Record<'WASMTEX_SMOKE_TEXLIVE_VERSION' | 'WASMTEX_SMOKE_TEXLIVE_URL', string>>): SmokeTexliveProfile;
