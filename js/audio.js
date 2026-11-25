// Cool, quiet ice-arena audio built on the shared CC0 Kenney WAVs plus a synthesized glide rumble.

const SFX_FILES = {
  release: 'assets/sfx/start.wav',
  clack: 'assets/sfx/switch-out.wav',
  clackLow: 'assets/sfx/crash-low.wav',
  brush: 'assets/sfx/switch-in.wav',
  countSoft: 'assets/sfx/spark-soft.wav',
  countWarm: 'assets/sfx/spark-warm.wav',
  winGong: 'assets/sfx/reverse.wav',
  thud: 'assets/sfx/crash-thud.wav',
  whoosh: 'assets/sfx/nearmiss.wav',
  tick: 'assets/sfx/tick.wav'
};

export class IceAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();
    this.rawCache = new Map();
    this.muted = false;
    this.lastClackAt = 0;
    this.lastBrushAt = 0;
    this.brushSide = 1;
    this.glideGain = null;
    this.preloadRaw();
  }

  preloadRaw() {
    for (const [key, url] of Object.entries(SFX_FILES)) {
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((buf) => {
          if (buf) {
            this.rawCache.set(key, buf);
            if (this.ctx) this.decodeKey(key, buf);
          }
        })
        .catch(() => {});
    }
  }

  ensure() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 20;
      comp.ratio.value = 3;
      comp.attack.value = 0.008;
      comp.release.value = 0.2;

      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      this.buildGlide();
      for (const [key, raw] of this.rawCache.entries()) this.decodeKey(key, raw);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.03);
    }
  }

  // Looping filtered noise: the low granite-on-pebble rumble of a travelling stone.
  buildGlide() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.96 + (Math.random() * 2 - 1) * 0.04;
      data[i] = last * 6;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    lp.Q.value = 0.9;
    this.glideGain = ctx.createGain();
    this.glideGain.gain.value = 0;
    src.connect(lp);
    lp.connect(this.glideGain);
    this.glideGain.connect(this.master);
    src.start();
  }

  setGlide(speed) {
    if (!this.ctx || !this.glideGain) return;
    const target = this.muted ? 0 : Math.min(0.32, speed * 0.045);
    this.glideGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  decodeKey(key, raw) {
    if (!this.ctx || this.buffers.has(key)) return;
    this.ctx.decodeAudioData(raw.slice(0))
      .then((decoded) => this.buffers.set(key, decoded))
      .catch(() => {});
  }

  play(key, { volume = 0.45, rate = 1, cutoff = 2400, delay = 0, pan = 0 } = {}) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;
    const at = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.005);
    let tail = gain;
    if (ctx.createStereoPanner && pan !== 0) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      gain.connect(p);
      tail = p;
    }
    src.connect(filter);
    filter.connect(gain);
    tail.connect(this.master);
    src.start(at);
  }

  playRelease(power) {
    this.play('whoosh', { volume: 0.22 + power * 0.18, rate: 0.7 + power * 0.25, cutoff: 1500 });
  }

  playClack(speed) {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastClackAt < 0.05) return;
    this.lastClackAt = now;
    const v = Math.min(0.62, 0.2 + speed * 0.07);
    this.play('clack', { volume: v, rate: 0.62 + Math.min(0.2, speed * 0.03), cutoff: 2600 });
    if (speed > 3) this.play('clackLow', { volume: v * 0.6, rate: 0.9, cutoff: 1200, delay: 0.01 });
  }

  brushStroke() {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastBrushAt < 0.15) return;
    this.lastBrushAt = now;
    this.brushSide *= -1;
    this.play('brush', { volume: 0.16, rate: 1.7 + Math.random() * 0.2, cutoff: 3200, pan: this.brushSide * 0.35 });
  }

  playAimTick() {
    this.play('tick', { volume: 0.08, rate: 1.4, cutoff: 2600 });
  }

  playOut() {
    this.play('thud', { volume: 0.32, rate: 0.85, cutoff: 900 });
  }

  playCount(points, mine) {
    for (let i = 0; i < Math.max(1, points); i++) {
      this.play(mine ? 'countWarm' : 'countSoft', { volume: 0.4, rate: (mine ? 0.95 : 0.75) + i * 0.08, cutoff: 2200, delay: i * 0.16 });
    }
  }

  playGameOver(won) {
    if (won) {
      this.play('winGong', { volume: 0.5, rate: 0.95, cutoff: 1900 });
      this.play('release', { volume: 0.4, rate: 1.05, cutoff: 2200, delay: 0.08 });
    } else {
      this.play('thud', { volume: 0.4, rate: 0.7, cutoff: 900 });
    }
  }
}
