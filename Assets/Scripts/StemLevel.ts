// StemLevel - reads how loud one playing stem is right now (RMS), scaled to 0..1. Shared by ToyAudioReact (each toy's
// stem) and StageFrame (the foundation stem), so there is one reading method and one set of settings.
// Each reader keeps its own buffer and its own auto-level peak, so stems never share a scale.
// Why position is set before reading: the stem's own read cursor otherwise drifts away from the sound.
// Settings: StageConfig > Audio-reactive motion (Auto Level, Level Decay Seconds, Level Floor, Level Reference, Analysis Samples).

// The settings a reader needs. StageConfig has all of these.
export interface StemLevelSettings {
  autoLevel: boolean
  levelDecaySeconds: number // seconds
  levelFloor: number // RMS 0-1
  levelReference: number // RMS 0-1
  analysisSamples: number // samples
}

// The two bands of one stem, each 0..1 and auto-levelled on its own (so a quiet band still reaches 1 at its own peak).
export class BandLevels {
  low: number = 0
  high: number = 0
}

export class StemLevelReader {
  private provider: FileAudioTrackProvider | null = null
  private buffer: Float32Array | null = null
  private peak: number = 0 // slowly decaying loudest recent RMS (for auto-level)
  private peakLow: number = 0 // the same, for the low band (readBands only)
  private peakHigh: number = 0 // the same, for the high band (readBands only)
  private warned: boolean = false

  // `label` only names the reader in the one warning it can print.
  constructor(private label: string) {}

  // Fills this.buffer with the stem's samples at the playing position. Returns how many samples, or 0 if not ready.
  private fetch(audio: AudioComponent | null, s: StemLevelSettings): number {
    if (!audio || !audio.audioTrack) return 0
    if (!this.provider) {
      this.provider = audio.audioTrack.control as FileAudioTrackProvider
      if (!this.provider) return 0
      this.buffer = new Float32Array(this.provider.maxFrameSize)
    }
    if (!audio.isPlaying() || !this.buffer) return 0
    const want = Math.max(64, Math.min(s.analysisSamples, this.provider.maxFrameSize))
    try {
      this.provider.position = audio.position
      return this.provider.getAudioBuffer(this.buffer, want).x
    } catch (e) {
      if (!this.warned) {
        this.warned = true
        console.warn("[StemLevel] " + this.label + " could not read its stem: " + e)
      }
      return 0
    }
  }

  // RMS -> 0..1 against the given auto-level peak (the caller keeps the peak). 0 below the Level Floor.
  private scaled(rms: number, peak: number, s: StemLevelSettings): number {
    if (s.autoLevel) {
      if (rms < s.levelFloor) return 0
      return Math.max(0, Math.min(1, rms / Math.max(peak, s.levelFloor)))
    }
    return Math.max(0, Math.min(1, rms / Math.max(0.0001, s.levelReference)))
  }

  // The stem split into a LOW and a HIGH band at `splitHz` (Hz), each 0..1. Both are 0 when the stem is not playing.
  // Method: two one-pole low-pass filters in a row give the lows (12 dB per octave); highs are what is left
  // (signal minus lows). The filter starts fresh on every read, which is fine for a split above about 150 Hz
  // with the default 512 samples (about 12 ms). The Level Floor applies to each band on its own.
  readBands(audio: AudioComponent | null, s: StemLevelSettings, dt: number, splitHz: number, out: BandLevels): void {
    out.low = 0
    out.high = 0
    const n = this.fetch(audio, s)
    if (n <= 0 || !this.buffer) return
    const sr = this.provider!.sampleRate > 0 ? this.provider!.sampleRate : 44100
    const fc = Math.max(20, Math.min(splitHz, sr * 0.45))
    const a = 1 - Math.exp((-2 * Math.PI * fc) / sr)
    const buf = this.buffer
    let y1 = buf[0]
    let y2 = buf[0]
    let sumLow = 0
    let sumHigh = 0
    for (let i = 0; i < n; i++) {
      const x = buf[i]
      y1 += a * (x - y1)
      y2 += a * (y1 - y2)
      const hi = x - y2
      sumLow += y2 * y2
      sumHigh += hi * hi
    }
    const rmsLow = Math.sqrt(sumLow / n)
    const rmsHigh = Math.sqrt(sumHigh / n)
    const decay = Math.exp(-dt / Math.max(0.1, s.levelDecaySeconds))
    this.peakLow = Math.max(rmsLow, this.peakLow * decay)
    this.peakHigh = Math.max(rmsHigh, this.peakHigh * decay)
    out.low = this.scaled(rmsLow, this.peakLow, s)
    out.high = this.scaled(rmsHigh, this.peakHigh, s)
  }

  // Loudness of the stem right now, 0..1. Returns 0 when the stem is not ready or not playing.
  read(audio: AudioComponent | null, s: StemLevelSettings, dt: number): number {
    if (!audio || !audio.audioTrack) return 0
    if (!this.provider) {
      this.provider = audio.audioTrack.control as FileAudioTrackProvider
      if (!this.provider) return 0
      this.buffer = new Float32Array(this.provider.maxFrameSize)
    }
    if (!audio.isPlaying() || !this.buffer) return 0
    const want = Math.max(64, Math.min(s.analysisSamples, this.provider.maxFrameSize))
    let rms = 0
    try {
      this.provider.position = audio.position
      const n = this.provider.getAudioBuffer(this.buffer, want).x
      let sum = 0
      for (let i = 0; i < n; i++) sum += this.buffer[i] * this.buffer[i]
      rms = n > 0 ? Math.sqrt(sum / n) : 0
    } catch (e) {
      if (!this.warned) {
        this.warned = true
        console.warn("[StemLevel] " + this.label + " could not read its stem: " + e)
      }
      return 0
    }
    let reference: number
    if (s.autoLevel) {
      this.peak = Math.max(rms, this.peak * Math.exp(-dt / Math.max(0.1, s.levelDecaySeconds)))
      reference = Math.max(this.peak, s.levelFloor)
      if (rms < s.levelFloor) return 0
    } else {
      reference = Math.max(0.0001, s.levelReference)
    }
    return Math.max(0, Math.min(1, rms / reference))
  }
}
