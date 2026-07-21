import type { NeutralDocument } from './protocol'

/** Wrap a Monaco text model as a {@link NeutralDocument} for the neutral cores. */
export function modelToDoc(model: {
  getValue(): string
  getLineContent(line: number): string
  uri?: { path: string }
}): NeutralDocument {
  return {
    path: model.uri ? model.uri.path.replace(/^\//, '') : '',
    getText: () => model.getValue(),
    lineAt: (line: number) => model.getLineContent(line),
  }
}
