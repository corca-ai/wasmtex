import { NeutralDocument } from './protocol.js';
/** Wrap a Monaco text model as a {@link NeutralDocument} for the neutral cores. */
export declare function modelToDoc(model: {
    getValue(): string;
    getLineContent(line: number): string;
    uri?: {
        path: string;
    };
}): NeutralDocument;
