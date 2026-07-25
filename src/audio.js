export class AudioManager {
  constructor() {
    this.mode = 'full';
    this.ctx = null;
    this.music = new Audio(new URL('../public/audio/space-flight.mp3', import.meta.url));
    this.music.loop = true;
    this.music.preload = 'auto';
    this.music.volume = 0.28;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.music.pause();
      else if (this.mode === 'full') this.startBgm();
    });
  }

  ensureContext() {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  tone(freq = 440, duration = 0.08, type = 'sine', volume = 0.13, delay = 0) {
    if (this.mode === 'muted') return;
    const ctx = this.ensureContext(), start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = type; oscillator.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start); oscillator.stop(start + duration + 0.02);
  }

  startBgm() {
    this.ensureContext();
    if (this.mode !== 'full' || document.hidden || !this.music.paused) return;
    this.music.play().catch(() => {});
  }

  stopBgm() {
    this.music.pause();
  }

  cycleMode() {
    this.mode = this.mode === 'full' ? 'effects' : this.mode === 'effects' ? 'muted' : 'full';
    if (this.mode === 'full') this.startBgm(); else this.stopBgm();
    if (this.mode !== 'muted') this.click();
    return this.mode;
  }

  drop() { this.tone(220, 0.09, 'triangle'); }
  click() { this.tone(520, 0.05, 'sine', 0.08); }
  win() { [523, 659, 784, 1047].forEach((frequency, index) => setTimeout(() => this.tone(frequency, 0.2, 'triangle', 0.12), index * 110)); }
}
