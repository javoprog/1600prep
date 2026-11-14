import { loadUserSettings } from '@/services/storage/preferences';

export type SoundEvent =
  | 'hover'
  | 'click'
  | 'select'
  | 'correct'
  | 'incorrect'
  | 'bookmark'
  | 'complete';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private lastHoverTime = 0;
  private lastClickTime = 0;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public play(event: SoundEvent): void {
    const settings = loadUserSettings();
    if (!settings.soundEnabled || settings.soundVolume <= 0) return;

    const nowMs = performance.now();
    if (event === 'hover') {
      if (nowMs - this.lastHoverTime < 65) return;
      this.lastHoverTime = nowMs;
    } else if (event === 'click' || event === 'select') {
      if (nowMs - this.lastClickTime < 45) return;
      this.lastClickTime = nowMs;
    }

    const ctx = this.getContext();
    if (!ctx) return;

    const vol = Math.min(1, Math.max(0, settings.soundVolume));
    const now = ctx.currentTime;

    try {
      switch (event) {
        case 'hover': {
          // Very subtle soft tick
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(920, now);
          osc.frequency.exponentialRampToValueAtTime(640, now + 0.018);

          gain.gain.setValueAtTime(0.025 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.02);
          break;
        }

        case 'click': {
          // Short crisp click
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.exponentialRampToValueAtTime(240, now + 0.032);

          gain.gain.setValueAtTime(0.075 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.035);
          break;
        }

        case 'select': {
          // Soft selection sound
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(587.33, now + 0.055);

          gain.gain.setValueAtTime(0.09 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.065);
          break;
        }

        case 'bookmark': {
          // Short pop (two quick ascending bubbles)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(480, now);
          osc.frequency.exponentialRampToValueAtTime(840, now + 0.075);

          gain.gain.setValueAtTime(0.11 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.085);
          break;
        }

        case 'correct': {
          // Pleasant high-pitched chime (C5 -> E5 -> G5 soft major triad arpeggio)
          const notes = [523.25, 659.25, 783.99];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.065;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.13 * vol, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.3);
          });
          break;
        }

        case 'incorrect': {
          // Soft low-pitched tone (subtle muted descending interval)
          const notes = [293.66, 246.94];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.09;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.1 * vol, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.24);
          });
          break;
        }

        case 'complete': {
          // Short success sound (warm 4-note uplift: C5 -> E5 -> G5 -> C6)
          const notes = [523.25, 659.25, 783.99, 1046.5];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.075;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.14 * vol, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.38);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.4);
          });
          break;
        }
      }
    } catch {
      // Ignore Web Audio errors if restricted by browser autoplay policy
    }
  }
}

export const soundEngine = new SoundEngine();
