import { NeutralDocument } from './protocol';
/** Wrap a Monaco text model as a {@link NeutralDocument} for the neutral cores. */
export declare function modelToDoc(model: {
    getValue(): string;
    getLineContent(line: number): string;
    uri?: {
        path: string;
    };
}): NeutralDocument;
