interface MonacoEnvironmentHost {
  MonacoEnvironment?: {
    getWorker?(workerId: string, label: string): Worker
  }
}

const workerHost = self as unknown as MonacoEnvironmentHost

/** Demo/dev helper. Consumers should usually configure Monaco workers in their own app source. */
export function configureMonacoWorkers(): void {
  if (workerHost.MonacoEnvironment?.getWorker) return

  workerHost.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === 'json') {
        return new Worker(
          new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url),
          { type: 'module' },
        )
      }
      return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), {
        type: 'module',
      })
    },
  }
}
