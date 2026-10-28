import { normalizeProjectDependencyPath } from './dependency-manifest'

/** Include databases emitted by TeX classes (e.g. REVTeX notes and ACS controls).
 * Project files retain authority; generated inputs stay in the engine filesystem.
 */
export async function collectBibliographyInputs<T extends string | Uint8Array>(
  aux: string,
  projectFiles: Record<string, T>,
  readGenerated: (path: string) => Promise<string | null>,
): Promise<{ bibFiles: Record<string, string | T>; hasGenerated: boolean }> {
  const bibFiles: Record<string, string | T> = { ...projectFiles }
  const paths = bibliographyPaths(aux)
  let hasGenerated = false
  for (const path of paths) {
    if (Object.hasOwn(bibFiles, path)) continue
    const content = await readGenerated(path)
    if (content === null) continue
    bibFiles[path] = content
    hasGenerated = true
  }
  return { bibFiles, hasGenerated }
}

function bibliographyPaths(aux: string): Set<string> {
  const paths = new Set<string>()
  for (const match of aux.matchAll(/\\bibdata\{([^}]+)\}/g)) {
    for (const name of match[1]!.split(',')) {
      const trimmed = name.trim()
      if (!trimmed) continue
      const path = normalizeProjectDependencyPath(
        trimmed.endsWith('.bib') ? trimmed : `${trimmed}.bib`,
      )
      if (path) paths.add(path)
    }
  }
  return paths
}
