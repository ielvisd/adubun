export interface TimingHint {
  startTime: number // in seconds
  endTime: number // in seconds
  text: string
}

export interface Clip {
  localPath: string
  voicePath?: string
  startTime: number
  endTime: number
  type: string
  timingHints?: TimingHint[] // Optional timing hints for speech synchronization
}

