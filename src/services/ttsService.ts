const GOOGLE_TTS_API = 'https://texttospeech.googleapis.com/v1/text:synthesize';

export interface VoiceOption {
  id: string;
  name: string;
  voiceName: string;
  gender: 'female' | 'male';
}

export const FRENCH_VOICES: VoiceOption[] = [
  { id: 'kore', name: 'Kore (Femme, naturelle)', voiceName: 'fr-FR-Chirp3-HD-Kore', gender: 'female' },
  { id: 'aoede', name: 'Aoede (Femme)', voiceName: 'fr-FR-Chirp3-HD-Aoede', gender: 'female' },
  { id: 'leda', name: 'Leda (Femme)', voiceName: 'fr-FR-Chirp3-HD-Leda', gender: 'female' },
  { id: 'gacrux', name: 'Gacrux (Femme)', voiceName: 'fr-FR-Chirp3-HD-Gacrux', gender: 'female' },
  { id: 'puck', name: 'Puck (Homme, naturel)', voiceName: 'fr-FR-Chirp3-HD-Puck', gender: 'male' },
  { id: 'fenrir', name: 'Fenrir (Homme)', voiceName: 'fr-FR-Chirp3-HD-Fenrir', gender: 'male' },
  { id: 'charon', name: 'Charon (Homme)', voiceName: 'fr-FR-Chirp3-HD-Charon', gender: 'male' },
  { id: 'orus', name: 'Orus (Homme)', voiceName: 'fr-FR-Chirp3-HD-Orus', gender: 'male' },
  { id: 'studio-a', name: 'Studio A (Femme)', voiceName: 'fr-FR-Studio-A', gender: 'female' },
  { id: 'studio-d', name: 'Studio D (Homme)', voiceName: 'fr-FR-Studio-D', gender: 'male' },
];

export const DEFAULT_VOICE = FRENCH_VOICES[0];

export function cleanTextForTTS(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[#*_`~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/- \*\*/g, '. ')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0F\u200D]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Single-shot speak (for re-listen button) ────────────────────────

let singleShotAudio: HTMLAudioElement | null = null;
let singleShotAbort: AbortController | null = null;

export function stopSpeaking(): void {
  const audio = singleShotAudio;
  singleShotAudio = null;
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    audio.src = '';
  }
  singleShotAbort?.abort();
  singleShotAbort = null;
  window.speechSynthesis?.cancel();
}

export function isSpeaking(): boolean {
  if (singleShotAudio && !singleShotAudio.paused && !singleShotAudio.ended) return true;
  return window.speechSynthesis?.speaking ?? false;
}

export async function speak(
  text: string,
  options: { voiceName?: string; onStart?: () => void; onEnd?: () => void } = {}
): Promise<void> {
  const cleaned = cleanTextForTTS(text);
  if (!cleaned) { options.onEnd?.(); return; }

  const apiKey = import.meta.env.VITE_GOOGLE_TTS_API_KEY;
  if (!apiKey) return speakWithBrowserTTS(cleaned, options);

  stopSpeaking();
  singleShotAbort = new AbortController();
  const { signal } = singleShotAbort;

  try {
    const response = await fetch(`${GOOGLE_TTS_API}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: cleaned },
        voice: { languageCode: 'fr-FR', name: options.voiceName ?? DEFAULT_VOICE.voiceName },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0 },
      }),
      signal,
    });

    if (!response.ok) {
      console.error('Google TTS error:', response.status, await response.text());
      return speakWithBrowserTTS(cleaned, options);
    }

    const data = await response.json();
    const blob = base64ToBlob(data.audioContent);
    if (signal.aborted) { options.onEnd?.(); return; }

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    singleShotAudio = audio;

    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        audio.pause();
        audio.onended = null;
        audio.onerror = null;
        URL.revokeObjectURL(url);
        if (singleShotAudio === audio) singleShotAudio = null;
        options.onEnd?.();
        resolve();
      };
      audio.onended = finish;
      audio.onerror = finish;
      signal.addEventListener('abort', finish, { once: true });
      options.onStart?.();
      audio.play().catch(finish);
    });
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      console.error('TTS error:', err);
      return speakWithBrowserTTS(cleaned, options);
    }
    options.onEnd?.();
  }
}

// ── StreamingTTSPlayer (sentence-by-sentence with prefetch) ─────────

export class StreamingTTSPlayer {
  private buffer = '';
  private queue: string[] = [];
  private playing = false;
  private stopped = false;
  private audio: HTMLAudioElement | null = null;
  private fetchCtrl: AbortController | null = null;
  private voiceName: string;
  private apiKey: string;
  private onStartCb?: () => void;
  private onEndCb?: () => void;
  private resolvePlay: (() => void) | null = null;
  private prefetch: Promise<{ audio: HTMLAudioElement; url: string } | null> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: { voiceName: string; onStart?: () => void; onEnd?: () => void }) {
    this.voiceName = opts.voiceName;
    this.apiKey = import.meta.env.VITE_GOOGLE_TTS_API_KEY || '';
    this.onStartCb = opts.onStart;
    this.onEndCb = opts.onEnd;
  }

  addText(delta: string): void {
    if (this.stopped) return;
    this.buffer += delta;
    this.drainBuffer();
    if (this.buffer.length > 0 && !this.playing) {
      this.resetFlushTimer();
    }
  }

  finish(): void {
    if (this.stopped) return;
    this.clearFlushTimer();
    const rest = cleanTextForTTS(this.buffer);
    this.buffer = '';
    if (rest) {
      this.queue.push(rest);
      if (!this.playing) this.loop();
    }
  }

  stop(): void {
    this.stopped = true;
    this.clearFlushTimer();
    this.queue = [];
    this.buffer = '';
    this.prefetch = null;
    this.fetchCtrl?.abort();
    this.fetchCtrl = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = '';
      this.audio = null;
    }
    this.resolvePlay?.();
    this.playing = false;
  }

  private resetFlushTimer(): void {
    this.clearFlushTimer();
    this.flushTimer = setTimeout(() => {
      if (this.buffer && !this.stopped) {
        const cleaned = cleanTextForTTS(this.buffer);
        this.buffer = '';
        if (cleaned && cleaned.length > 2) {
          this.queue.push(cleaned);
          if (!this.playing) this.loop();
        }
      }
    }, 800);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
  }

  get active(): boolean {
    return this.playing || this.queue.length > 0;
  }

  // ── private ──

  private drainBuffer(): void {
    const re = /([.!?;:])\s+/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buffer)) !== null) {
      const sentence = this.buffer.slice(last, m.index + m[1].length).trim();
      last = m.index + m[0].length;
      if (sentence.length > 3) {
        const cleaned = cleanTextForTTS(sentence);
        if (cleaned) this.queue.push(cleaned);
      }
    }
    if (last > 0) this.buffer = this.buffer.slice(last);
    if (this.queue.length > 0 && !this.playing) this.loop();
  }

  private async synthesize(text: string): Promise<{ audio: HTMLAudioElement; url: string } | null> {
    if (this.stopped || !this.apiKey) return null;
    const ctrl = new AbortController();
    this.fetchCtrl = ctrl;
    try {
      const resp = await fetch(`${GOOGLE_TTS_API}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'fr-FR', name: this.voiceName },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0 },
        }),
        signal: ctrl.signal,
      });
      if (!resp.ok || this.stopped) return null;
      const data = await resp.json();
      const blob = base64ToBlob(data.audioContent);
      const url = URL.createObjectURL(blob);
      return { audio: new Audio(url), url };
    } catch {
      return null;
    }
  }

  private async loop(): Promise<void> {
    this.playing = true;
    let firstChunk = true;

    while (this.queue.length > 0 && !this.stopped) {
      const text = this.queue.shift()!;

      let result: { audio: HTMLAudioElement; url: string } | null = null;
      if (this.prefetch) {
        result = await this.prefetch;
        this.prefetch = null;
      }
      if (!result && !this.stopped) {
        result = await this.synthesize(text);
      }
      if (!result || this.stopped) break;

      if (this.queue.length > 0 && !this.stopped) {
        this.prefetch = this.synthesize(this.queue[0]);
      }

      if (firstChunk) {
        firstChunk = false;
        this.onStartCb?.();
      }

      this.audio = result.audio;
      await new Promise<void>((resolve) => {
        this.resolvePlay = resolve;
        const done = () => {
          URL.revokeObjectURL(result!.url);
          result!.audio.onended = null;
          result!.audio.onerror = null;
          this.resolvePlay = null;
          if (this.audio === result!.audio) this.audio = null;
          resolve();
        };
        result!.audio.onended = done;
        result!.audio.onerror = done;
        result!.audio.play().catch(done);
      });
    }

    this.playing = false;
    if (!this.stopped) this.onEndCb?.();
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function base64ToBlob(b64: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: 'audio/mp3' });
}

function speakWithBrowserTTS(
  text: string,
  options: { onStart?: () => void; onEnd?: () => void } = {}
): Promise<void> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { options.onEnd?.(); resolve(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const frVoice = voices.find(
      (v) => v.lang.startsWith('fr') && v.name.toLowerCase().includes('google')
    ) ?? voices.find((v) => v.lang.startsWith('fr'));
    if (frVoice) utterance.voice = frVoice;
    utterance.onstart = () => options.onStart?.();
    utterance.onend = () => { options.onEnd?.(); resolve(); };
    utterance.onerror = () => { options.onEnd?.(); resolve(); };
    window.speechSynthesis.speak(utterance);
  });
}
