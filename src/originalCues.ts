import { parseTimestamp, type EditableCue } from './converter'

export function findClosestCueIndex(cues: EditableCue[], targetTimeMs: number): number {
  let closestIndex = -1
  let closestDistance = Number.POSITIVE_INFINITY
  cues.forEach((cue, index) => {
    const distance = Math.abs(parseTimestamp(cue.start) - targetTimeMs)
    if (distance < closestDistance) {
      closestIndex = index
      closestDistance = distance
    }
  })
  return closestIndex
}
