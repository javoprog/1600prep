import { loadUserSettings } from '@/services/storage/preferences';

export type SoundEvent =
  | 'hover'
  | 'click'
  | 'select'
  | 'deselect'
  | 'strikethrough'
  | 'restore'
  | 'navigate'
  | 'toggleOpen'
  | 'toggleClose'
  | 'undo'
  | 'clear'
  | 'copy'
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
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
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
      if (nowMs - this.lastHoverTime < 55) return;
      this.lastHoverTime = nowMs;
    } else if (
      event === 'click' ||
      event === 'select' ||
      event === 'deselect' ||
      event === 'navigate'
    ) {
      if (nowMs - this.lastClickTime < 35) return;
      this.lastClickTime = nowMs;
    }

    const ctx = this.getContext();
    if (!ctx) return;

    // Boost overall volume so UI interactions feel tactile and clearly audible
    const vol = Math.min(1, Math.max(0.85, settings.soundVolume));
    const now = ctx.currentTime;

    try {
      switch (event) {
        case 'hover': {
          // Crisp, warm micro-tick
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1040, now);
          osc.frequency.exponentialRampToValueAtTime(680, now + 0.022);

          gain.gain.setValueAtTime(0.055 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.025);
          break;
        }

        case 'click': {
          // Mechanical tactile button tap (body + crisp transient)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(560, now);
          osc1.frequency.exponentialRampToValueAtTime(220, now + 0.04);

          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1120, now);
          osc2.frequency.exponentialRampToValueAtTime(380, now + 0.025);

          gain.gain.setValueAtTime(0.15 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.042);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.045);
          osc2.stop(now + 0.03);
          break;
        }

        case 'select': {
          // Warm ascending two-step harmonic interval (D5 -> A5)
          const notes = [587.33, 880];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.028;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.16 * vol, start + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.075);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.08);
          });
          break;
        }

        case 'deselect': {
          // Smooth descending two-step interval (A5 -> D5)
          const notes = [783.99, 523.25];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.026;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.13 * vol, start + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.068);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.072);
          });
          break;
        }

        case 'strikethrough': {
          // Crisp descending cross-out slash tone
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(720, now);
          osc.frequency.exponentialRampToValueAtTime(260, now + 0.065);

          gain.gain.setValueAtTime(0.16 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.068);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.072);
          break;
        }

        case 'restore': {
          // Crisp ascending un-cross / restore tone
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(310, now);
          osc.frequency.exponentialRampToValueAtTime(760, now + 0.065);

          gain.gain.setValueAtTime(0.15 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.068);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.072);
          break;
        }

        case 'navigate': {
          // Smooth page-turn / step transition sound
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(340, now);
          osc.frequency.exponentialRampToValueAtTime(510, now + 0.055);

          gain.gain.setValueAtTime(0.16 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.065);
          break;
        }

        case 'toggleOpen': {
          // Bright upward two-note tool/modal open chime
          const notes = [523.25, 783.99];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.038;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.15 * vol, start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.095);
          });
          break;
        }

        case 'toggleClose': {
          // Soft downward two-note tool/modal close tone
          const notes = [659.25, 440];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.035;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.14 * vol, start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.085);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.09);
          });
          break;
        }

        case 'undo': {
          // Quick reverse pop for Undo
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(620, now);
          osc.frequency.exponentialRampToValueAtTime(390, now + 0.055);

          gain.gain.setValueAtTime(0.16 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.065);
          break;
        }

        case 'clear': {
          // Crisp descending three-step sweep for Clear
          const notes = [783.99, 587.33, 392.0];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.03;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.14 * vol, start + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.075);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.08);
          });
          break;
        }

        case 'copy':
        case 'bookmark': {
          // Bright double-blip confirmation
          const notes = [659.25, 987.77];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.045;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.17 * vol, start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.12);
          });
          break;
        }

        case 'correct': {
          // Celebratory major triad chime (C5 -> E5 -> G5 -> C6)
          const notes = [523.25, 659.25, 783.99, 1046.5];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.06;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.22 * vol, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.34);
          });
          break;
        }

        case 'incorrect': {
          // Distinct low descending double-tone
          const notes = [311.13, 246.94];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.095;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.19 * vol, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.27);
          });
          break;
        }

        case 'complete': {
          // Warm 4-note uplift fanfare
          const notes = [523.25, 659.25, 783.99, 1046.5];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.075;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.24 * vol, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.45);
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
