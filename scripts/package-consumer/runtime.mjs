import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// Reject even an accidentally available parent/global peer. The tested imports
// execute in Node with no DOM and no UI/PDF packages installed.
registerHooks({
  resolve(specifier, context, nextResolve) {
    assert(
      !/^(monaco-editor|pdfjs-dist|pdf-lib)(\/|$)/.test(specifier),
      `Headless runtime imported a UI/PDF peer: ${specifier}`,
    )
    return nextResolve(specifier, context)
  },
})

const { WasmTexCompiler, BackendRegistry } = await import('wasmtex/headless')
const { installNodeWorkerHost } = await import('wasmtex/node')
const { SynctexParser, normalizeSynctexInputName } = await import('wasmtex/synctex')
const { warmup } = await import('wasmtex/warmup')
const { createLatexLanguageService } = await import('wasmtex/lsp')
const { LatexLspServer } = await import('wasmtex/lsp/server')
const { createLatexSyntaxService } = await import('wasmtex/syntax')
for (const value of [
  BackendRegistry,
  installNodeWorkerHost,
  SynctexParser,
  warmup,
  createLatexLanguageService,
  LatexLspServer,
  createLatexSyntaxService,
]) {
  assert.equal(typeof value, 'function')
}
const compiler = new WasmTexCompiler({ files: { 'main.tex': 'consumer document' } })
assert.equal(compiler.getFile('main.tex'), 'consumer document')
compiler.dispose()
assert.equal(normalizeSynctexInputName('./main.tex'), 'main.tex')
const replies = []
const server = new LatexLspServer((message) => replies.push(message))
await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
assert.equal(replies[0].id, 1)
assert.equal(replies[0].result.capabilities.textDocumentSync, 1)
console.log('consumer runtime: seven neutral entry points import without UI/PDF peers')
