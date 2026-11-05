import { objectStoreConfig, runObjectStore } from './lib/object-store.mjs'

// Shell publishers use the same provider validation as the JavaScript tools.
try {
  runObjectStore(objectStoreConfig(), process.argv.slice(2), { stdio: 'inherit' })
} catch (error) {
  console.error(error.message)
  process.exitCode = Number.isInteger(error.status) ? error.status : 1
}
