export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message)
  }
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RpcError(-32602, `${label} must be an object`)
  }
  return value as Record<string, unknown>
}

export function text(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw new RpcError(-32602, `${label} must be a string${allowEmpty ? '' : ' (nonempty)'}`)
  }
  return value
}

function integer(value: unknown, label: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > 2147483647) {
    throw new RpcError(-32602, `${label} must be an integer in [${min}, 2147483647]`)
  }
  return value
}

export function documentParams(params: Record<string, unknown> | undefined) {
  const doc = record(params?.textDocument, 'textDocument')
  return {
    uri: text(doc.uri, 'textDocument.uri'),
    version:
      doc.version === undefined ? 0 : integer(doc.version, 'textDocument.version', -2147483648),
  }
}

export function positionParams(params: Record<string, unknown> | undefined) {
  const { uri } = documentParams(params)
  const position = record(params?.position, 'position')
  return {
    textDocument: { uri },
    position: {
      line: integer(position.line, 'position.line'),
      character: integer(position.character, 'position.character'),
    },
  }
}

export function openParams(params: Record<string, unknown> | undefined) {
  const doc = record(params?.textDocument, 'textDocument')
  const identity = documentParams(params)
  return {
    ...identity,
    text: text(doc.text, 'textDocument.text', true),
    languageId:
      doc.languageId === undefined ? 'latex' : text(doc.languageId, 'textDocument.languageId'),
  }
}

export function changeParams(params: Record<string, unknown> | undefined) {
  const identity = documentParams(params)
  if (!Array.isArray(params?.contentChanges))
    throw new RpcError(-32602, 'contentChanges must be an array')
  const changes = params.contentChanges.map((value) => {
    const change = record(value, 'content change')
    if (change.range !== undefined)
      throw new RpcError(-32602, 'Only full document sync is supported')
    return text(change.text, 'content change text', true)
  })
  return { ...identity, content: changes.at(-1) }
}
