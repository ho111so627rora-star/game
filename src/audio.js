export class AudioManager {
  constructor() {
    this.mode = 'full';
    this.ctx = null;
    this.bgmTimer = null;
    this.bgmStep = 0;
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

  bgmBeat() {
    if (this.mode !== 'full' || document.hidden) return;
    const melody = [392, 494, 587, 494, 440, 523, 659, 523, 349, 440, 523, 440, 392, 494, 659, 587];
    const bass = [196, 220, 174.6, 196];
    const note = melody[this.bgmStep % melody.length];
    this.tone(note, 0.28, 'triangle', 0.026);
    if (this.bgmStep % 2 === 0) this.tone(note / 2, 0.22, 'sine', 0.012, 0.02);
    if (this.bgmStep % 4 === 0) this.tone(bass[Math.floor(this.bgmStep / 4) % bass.length], 0.75, 'sine', 0.018);
    this.bgmStep++;
  }

  startBgm() {
    this.ensureContext();
    if (this.mode !== 'full' || this.bgmTimer) return;
    this.bgmBeat();
    this.bgmTimer = setInterval(() => this.bgmBeat(), 330);
  }

  stopBgm() {
    if (this.bgmTimer) clearInterval(this.bgmTimer);
    this.bgmTimer = null;
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
