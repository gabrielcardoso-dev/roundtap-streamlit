export type EmomPhase = { kind: 'work' | 'rest'; round: number; remainingMs: number }

export function emomLimitMs(goal: number, workSec: number, restSec: number): number {
  return (goal * workSec + Math.max(0, goal - 1) * restSec) * 1000
}

export function completedEmomRounds(elapsedMs: number, goal: number, workSec: number, restSec: number): number {
  const workMs = workSec * 1000
  const cycleMs = (workSec + restSec) * 1000
  if (elapsedMs < workMs) return 0
  return Math.min(goal, 1 + Math.floor((elapsedMs - workMs) / cycleMs))
}

export function emomPhase(elapsedMs: number, goal: number, workSec: number, restSec: number): EmomPhase {
  const workMs = workSec * 1000
  const cycleMs = (workSec + restSec) * 1000
  const position = elapsedMs % cycleMs
  const round = Math.min(goal, Math.floor(elapsedMs / cycleMs) + 1)
  if (position < workMs || restSec === 0) return { kind: 'work', round, remainingMs: Math.max(0, workMs - position) }
  return { kind: 'rest', round, remainingMs: Math.max(0, cycleMs - position) }
}
