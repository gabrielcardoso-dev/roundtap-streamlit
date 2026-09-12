export type WorkoutMode = 'rounds' | 'fortime' | 'amrap' | 'emom'

export type WorkoutDraft = {
  name: string
  mode: WorkoutMode
  goal: number
  durationSec: number
  workSec: number
  restSec: number
}

export type WorkoutRecord = WorkoutDraft & {
  id: string
  userId: string
  rounds: number
  partialReps: number
  elapsedMs: number
  completedAt: string
  pendingSync?: boolean
}

export type Preferences = {
  sound: boolean
  vibration: boolean
  wakeLock: boolean
}

export type Profile = {
  id: string
  fullName: string
  email: string
  createdAt?: string
}
