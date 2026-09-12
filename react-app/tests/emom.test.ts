import { describe, expect, it } from 'vitest'
import { completedEmomRounds, emomLimitMs, emomPhase } from '../src/lib/emom'

describe('EMOM automático', () => {
  it('calcula o tempo total sem descanso depois do último round', () => {
    expect(emomLimitMs(3, 45, 15)).toBe(165_000)
  })

  it('computa o round ao terminar o trabalho', () => {
    expect(completedEmomRounds(44_999, 3, 45, 15)).toBe(0)
    expect(completedEmomRounds(45_000, 3, 45, 15)).toBe(1)
    expect(completedEmomRounds(104_999, 3, 45, 15)).toBe(1)
    expect(completedEmomRounds(105_000, 3, 45, 15)).toBe(2)
  })

  it('alterna trabalho e descanso', () => {
    expect(emomPhase(10_000, 3, 45, 15).kind).toBe('work')
    expect(emomPhase(50_000, 3, 45, 15).kind).toBe('rest')
    expect(emomPhase(60_000, 3, 45, 15)).toMatchObject({ kind: 'work', round: 2 })
  })
})
