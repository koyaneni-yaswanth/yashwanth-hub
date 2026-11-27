/**
 * Opt-in Web Audio synthesizer for the Digital Engineering Universe.
 * - Muted by default, never triggers microphone access, never loads external MP3s.
 * - Only starts AudioContext in response to explicit user click/toggle.
 */

export class StudioAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private enabled = false;
  private volume = 0.22;

  isEnabled(): boolean {
    return this.enabled;
  }

  getVolume(): number {
    return this.volume;
  }

  async setEnabled(next: boolean): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      this.enabled = false;
      return false;
    }

    if (next) {
      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0;

        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 340;

        this.oscA = this.ctx.createOscillator();
        this.oscA.type = 'sine';
        this.oscA.frequency.value = 110; // A2 subtle studio foundation

        this.oscB = this.ctx.createOscillator();
        this.oscB.type = 'triangle';
        this.oscB.frequency.value = 164.81; // E3 warm fifth

        const gA = this.ctx.createGain();
        const gB = this.ctx.createGain();
        gA.gain.value = 0.35;
        gB.gain.value = 0.16;

        this.oscA.connect(gA);
        this.oscB.connect(gB);
        gA.connect(this.filter);
        gB.connect(this.filter);
        this.filter.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.oscA.start();
        this.oscB.start();
      }
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume().catch(() => {});
      }
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(this.volume * 0.22, this.ctx.currentTime, 0.25);
      }
      this.enabled = true;
      this.playTone(528, 0.08);
      return true;
    } else {
      this.enabled = false;
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      }
      return false;
    }
  }

  setVolume(val: number): void {
    this.volume = Math.min(1, Math.max(0, val));
    if (this.enabled && this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume * 0.22, this.ctx.currentTime, 0.1);
    }
  }

  /** Plays a gentle UI focus chime when switching stations (no-op while muted). */
  playTone(freqHz = 440, durationSec = 0.09): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqHz, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.02, this.volume * 0.14), now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + durationSec + 0.02);
    } catch {
      /* Ignore AudioContext teardown races */
    }
  }

  dispose(): void {
    this.enabled = false;
    try {
      this.oscA?.stop();
      this.oscB?.stop();
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.oscA = null;
    this.oscB = null;
    this.masterGain = null;
    this.filter = null;
    this.ctx = null;
  }
}
