export function sampleSchoolInfoCandidates<T>(items: T[], seed: number, poolSize = 50, sampleSize = 12) {
  const next = [...items.slice(0, poolSize)]
  let state = (seed >>> 0) || 0x6d2b79f5
  const random = () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[next[index], next[target]] = [next[target], next[index]]
  }
  return next.slice(0, sampleSize)
}
