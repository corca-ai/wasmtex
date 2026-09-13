import type { ProjectIndex } from './project-index'

/** Only complete aux data and already-expanded literal fields are display evidence. */
export function referenceDisplayValue(
  index: ProjectIndex,
  name: string,
  command: string | undefined,
): string | undefined {
  if (!index.hasCompleteAuxData()) return undefined
  const value =
    command === 'pageref'
      ? index.resolveLabelPage(name)
      : command === 'ref' || command === 'eqref'
        ? index.resolveLabel(name)
        : undefined
  return value && !/[\\{}%$~_^#&]/.test(value) ? value : undefined
}
