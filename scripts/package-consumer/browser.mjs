import { WasmTex } from 'wasmtex'
import { registerLatexMonacoProviders } from 'wasmtex/lsp/monaco'
import 'wasmtex/style.css'
import 'wasmtex/wasmtex.css'

// Keep the UI import graph in the consumer build. Browser interaction and worker
// asset setup belong to the existing E2E suites, not this installation probe.
window.consumerSdk = { WasmTex, registerLatexMonacoProviders }
