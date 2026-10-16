/** A rendered spelling and the real UTF-16 source slice producing it. */
export interface VisibleTextUnit {
  text: string
  start: number
  end: number
}

export interface NormalizedVisibleText {
  text: string
  /** One original range per normalized UTF-16 code unit, including expansions. */
  starts: Uint32Array
  ends: Uint32Array
}

let graphemes: Intl.Segmenter | undefined

class NormalizedTextBuilder {
  private readonly chars: string[] = []
  private readonly starts: number[] = []
  private readonly ends: number[] = []

  appendUnit(unit: VisibleTextUnit) {
    graphemes ??= new Intl.Segmenter('und', { granularity: 'grapheme' })
    for (const cluster of graphemes.segment(unit.text)) {
      // Literal runs map by UTF-16 offset. Synthetic spellings retain the
      // entire real invocation range instead of inventing source characters.
      const literal = unit.end - unit.start === unit.text.length
      const start = literal ? unit.start + cluster.index : unit.start
      const end = literal ? start + cluster.segment.length : unit.end
      const normalized = cluster.segment.normalize('NFKC').toLowerCase().replaceAll('\u00ad', '')
      for (const char of normalized) this.appendCharacter(char, start, end)
    }
  }

  private appendCharacter(char: string, start: number, end: number) {
    if (/\s/u.test(char)) {
      if (!this.chars.length) return
      if (this.chars.at(-1) === ' ') {
        this.ends[this.ends.length - 1] = end
        return
      }
      char = ' '
    }
    this.chars.push(char)
    for (let index = 0; index < char.length; index++) {
      this.starts.push(start)
      this.ends.push(end)
    }
  }

  finish(): NormalizedVisibleText {
    if (this.chars.at(-1) === ' ') {
      this.chars.pop()
      this.starts.pop()
      this.ends.pop()
    }
    return {
      text: this.chars.join(''),
      starts: Uint32Array.from(this.starts),
      ends: Uint32Array.from(this.ends),
    }
  }
}

/** Normalization is a view; source offsets always name the unchanged input. */
export function normalizeVisibleText(units: readonly VisibleTextUnit[]): NormalizedVisibleText {
  const builder = new NormalizedTextBuilder()
  for (const unit of units) builder.appendUnit(unit)
  return builder.finish()
}

export function normalizeNavigationText(text: string) {
  return normalizeVisibleText([{ text, start: 0, end: text.length }])
}
