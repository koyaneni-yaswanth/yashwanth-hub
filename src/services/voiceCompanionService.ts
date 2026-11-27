/**
 * JARVIS 4.0 Natural Voice Companion Service
 *
 * Guarantees:
 * - Never activates or claims microphone access unless the user explicitly clicks Listen.
 * - Releases all MediaStream audio tracks immediately when stopping or unmounting.
 * - Reports honest browser capability flags (`sttSupported`, `ttsSupported`).
 * - Supports instant barge-in interruption when the user speaks or sends a message.
 */

export interface VoiceCapabilities {
  sttSupported: boolean;
  ttsSupported: boolean;
}

export interface VoiceCallbacks {
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onMicLevel?: (level: number) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onListeningChange?: (listening: boolean) => void;
  onError?: (message: string) => void;
}

type SpeechRecConstructor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRec(): SpeechRecConstructor | null {
  if (typeof window === 'undefined') return null;
  return ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null) as SpeechRecConstructor | null;
}

export function getVoiceCapabilities(): VoiceCapabilities {
  return {
    sttSupported: Boolean(getSpeechRec()),
    ttsSupported: typeof window !== 'undefined' && 'speechSynthesis' in window,
  };
}

function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const scored = [...voices].sort((a, b) => {
    const score = (v: SpeechSynthesisVoice) => {
      let s = 0;
      if (/^en/i.test(v.lang)) s += 10;
      if (/natural|neural|online|google|aria|guy|libby|sonia/i.test(v.name)) s += 8;
      if (v.localService) s += 1;
      return s;
    };
    return score(b) - score(a);
  });
  return scored[0] || voices[0];
}

export class VoiceCompanionController {
  private callbacks: VoiceCallbacks;
  private recognition: InstanceType<SpeechRecConstructor> | null = null;
  private mediaStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private levelRaf = 0;
  private isListening = false;
  private isSpeaking = false;

  constructor(callbacks: VoiceCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public getState() {
    return {
      isListening: this.isListening,
      isSpeaking: this.isSpeaking,
    };
  }

  public async startListening(): Promise<boolean> {
    const Rec = getSpeechRec();
    if (!Rec) {
      this.callbacks.onError?.('Speech recognition is not supported in this browser; type your message instead.');
      return false;
    }

    // Barge-in: stop speech output immediately when user wants to talk
    this.stopSpeaking();

    try {
      // Optional WebAudio meter for truthful 3D sphere audio reactivity
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
          this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            this.audioCtx = new AudioCtx();
            const src = this.audioCtx.createMediaStreamSource(this.mediaStream);
            const analyser = this.audioCtx.createAnalyser();
            analyser.fftSize = 64;
            src.connect(analyser);
            const buf = new Uint8Array(analyser.frequencyBinCount);
            const sample = () => {
              if (!this.isListening) return;
              analyser.getByteFrequencyData(buf);
              let sum = 0;
              for (let i = 0; i < buf.length; i++) sum += buf[i];
              const level = Math.min(1, sum / (buf.length * 140));
              this.callbacks.onMicLevel?.(level);
              this.levelRaf = requestAnimationFrame(sample);
            };
            this.levelRaf = requestAnimationFrame(sample);
          }
        } catch (micErr: any) {
          if (micErr?.name === 'NotAllowedError') {
            this.callbacks.onError?.('Microphone permission denied. Allow mic access in browser settings or type below.');
            return false;
          }
          // Continue with Web Speech even if analyser failed
        }
      }

      const rec = new Rec();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'en-IN';

      let finalBuffer = '';
      rec.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const chunk = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            finalBuffer += chunk;
          } else {
            interim += chunk;
          }
        }
        if (interim.trim()) this.callbacks.onInterimTranscript?.(interim.trim());
        if (finalBuffer.trim()) {
          const text = finalBuffer.trim();
          finalBuffer = '';
          this.callbacks.onFinalTranscript?.(text);
        }
      };

      rec.onerror = (ev: any) => {
        const code = String(ev?.error || 'voice_error');
        if (code !== 'aborted' && code !== 'no-speech') {
          this.callbacks.onError?.(`Voice input issue (${code}).`);
        }
        this.stopListening();
      };

      rec.onend = () => {
        this.cleanupMic();
      };

      this.recognition = rec;
      this.isListening = true;
      this.callbacks.onListeningChange?.(true);
      rec.start();
      return true;
    } catch (err: any) {
      this.cleanupMic();
      this.callbacks.onError?.(err?.message || 'Unable to start microphone.');
      return false;
    }
  }

  public stopListening(): void {
    try {
      this.recognition?.stop();
    } catch {
      /* ignore */
    }
    this.cleanupMic();
  }

  private cleanupMic(): void {
    if (this.levelRaf) {
      cancelAnimationFrame(this.levelRaf);
      this.levelRaf = 0;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.recognition = null;
    if (this.isListening) {
      this.isListening = false;
      this.callbacks.onMicLevel?.(0);
      this.callbacks.onListeningChange?.(false);
    }
  }

  public speak(text: string, rate = 1.0): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    const clean = String(text || '')
      .replace(/```[\s\S]*?```/g, 'Code snippet omitted.')
      .replace(/[#*`>_]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200);
    if (!clean) return false;

    this.stopSpeaking();
    try {
      const utter = new SpeechSynthesisUtterance(clean);
      utter.rate = Math.min(1.4, Math.max(0.75, rate || 1.0));
      const voice = pickBestVoice(window.speechSynthesis.getVoices());
      if (voice) utter.voice = voice;

      utter.onstart = () => {
        this.isSpeaking = true;
        this.callbacks.onSpeakingChange?.(true);
      };
      utter.onend = () => {
        this.isSpeaking = false;
        this.callbacks.onSpeakingChange?.(false);
      };
      utter.onerror = () => {
        this.isSpeaking = false;
        this.callbacks.onSpeakingChange?.(false);
      };

      window.speechSynthesis.speak(utter);
      return true;
    } catch {
      return false;
    }
  }

  public stopSpeaking(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.callbacks.onSpeakingChange?.(false);
    }
  }

  public dispose(): void {
    this.stopListening();
    this.stopSpeaking();
  }
}
