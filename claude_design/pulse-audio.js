// Project Pulse — quantized music engine (Web Audio, all synthesized)
const BPM = 112;
const STEP = 60 / BPM / 4; // 16th note
const ROOTS = [55, 43.65, 65.41, 49]; // A F C G
const PENTA = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];

export class PulseAudio {
  constructor() {
    this.ready = false;
    this.running = false;
    this.intensity = { drums: 0, bass: 0, melody: 0, fx: 0, voice: 0 };
    this.onStep = null; // (stepIndex, time, barIndex)
    this.voiceBuffer = null;
    this.step = 0;
    this.bar = 0;
    this.level = 0; // rough output level for visuals
    this._melIdx = 0;
    this.muted = false;
  }
  init() {
    if (this.ready) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 256;
    this.master.connect(this.comp); this.comp.connect(this.analyser); this.analyser.connect(ctx.destination);
    // echo send
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = STEP * 3;
    this.dfb = ctx.createGain(); this.dfb.gain.value = 0.35;
    this.dflt = ctx.createBiquadFilter(); this.dflt.type = 'lowpass'; this.dflt.frequency.value = 2400;
    this.delay.connect(this.dfb); this.dfb.connect(this.dflt); this.dflt.connect(this.delay);
    this.dOut = ctx.createGain(); this.dOut.gain.value = 0.5;
    this.delay.connect(this.dOut); this.dOut.connect(this.master);
    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    // pad (continuous)
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0;
    const pf = ctx.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 600; pf.Q.value = 2;
    this.padFilter = pf;
    [110, 110.7, 164.8, 220.9].forEach(f => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.05; o.connect(g); g.connect(pf); o.start();
    });
    pf.connect(this.padGain); this.padGain.connect(this.master);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lg = ctx.createGain(); lg.gain.value = 300; lfo.connect(lg); lg.connect(pf.frequency); lfo.start();
    this.ready = true;
  }
  now() { return this.ctx ? this.ctx.currentTime : 0; }
  start() {
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.running) return;
    this.running = true;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0; this.bar = 0;
    this._timer = setInterval(() => this._tick(), 25);
  }
  stop(fade = 0.6) {
    if (!this.ready) return;
    clearInterval(this._timer); this.running = false;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => { if (!this.running) this.master.gain.value = 0.9; }, fade * 1000 + 60);
  }
  setMuted(m) { this.muted = m; if (this.ready) this.master.gain.value = m ? 0 : 0.9; }
  set(layer, v) { this.intensity[layer] = Math.max(0, Math.min(1, v)); }
  beatPhase() { // 0..1 within current beat (quarter note)
    if (!this.ready || !this.running) return 0;
    const q = STEP * 4;
    return ((this.ctx.currentTime % q) / q);
  }
  getLevel() {
    if (!this.ready) return 0;
    const a = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(a);
    let s = 0; for (let i = 0; i < 24; i++) s += a[i];
    return s / 24 / 255;
  }
  _tick() {
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this._schedule(this.step, this.nextTime, this.bar);
      if (this.onStep) {
        const s = this.step, t = this.nextTime, b = this.bar;
        setTimeout(() => this.onStep(s, b), Math.max(0, (t - this.ctx.currentTime) * 1000));
      }
      this.nextTime += STEP;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }
  _schedule(s, t, bar) {
    const I = this.intensity, root = ROOTS[bar % 4];
    // pad follows fx
    this.padGain.gain.setTargetAtTime(I.fx * 0.5, t, 0.4);
    this.padFilter.frequency.setTargetAtTime(400 + I.fx * 1800, t, 0.5);
    // drums
    if (I.drums > 0.02) {
      if (s === 0) this.kick(t, 0.5 + I.drums * 0.5);
      if (s === 8 && I.drums > 0.12) this.kick(t, 0.4 + I.drums * 0.5);
      if ((s === 4 || s === 12) && I.drums > 0.3) this.kick(t, 0.9);
      if (s === 14 && I.drums > 0.75) this.kick(t, 0.5);
      if ((s === 4 || s === 12) && I.drums > 0.4) this.clap(t, 0.7);
      if (s % 4 === 2 && I.drums > 0.25) this.hat(t, 0.4 + I.drums * 0.3, s === 10);
      if (s % 2 === 0 && I.drums > 0.65) this.hat(t, 0.25);
      if (s % 2 === 1 && I.drums > 0.85) this.hat(t, 0.15);
    }
    // bass groove
    if (I.bass > 0.05) {
      const pat = { 0: 1, 3: 0.35, 6: 0.5, 8: 0.9, 11: 0.55, 14: 0.7 };
      if (pat[s] !== undefined && I.bass * pat[s] > 0.12) {
        const oct = (s === 14 && I.bass > 0.6) ? 2 : 1;
        this.bassNote(t, root * oct, STEP * 1.8, I.bass, 0.35 + pat[s] * 0.5);
      }
    }
    // melody arp
    if (I.melody > 0.1) {
      const dense = I.melody > 0.65 ? 2 : 4;
      if (s % dense === 0 && (s !== 0 || I.melody > 0.4)) {
        const seq = [0, 2, 4, 3, 5, 4, 2, 1];
        const n = PENTA[seq[this._melIdx++ % seq.length]];
        this.pluck(t, n * (bar % 4 === 2 ? 1.19 : 1), 0.15 + I.melody * 0.25);
      }
    }
    // fx sparkle
    if (I.fx > 0.4 && s === 6) this.pluck(t, PENTA[4] * 2, 0.08, true);
    // voice loop
    if (this.voiceBuffer && I.voice > 0.15 && bar % 2 === 0 && s === 0) this.playVoice(t, 0.9);
    if (this.voiceBuffer && I.voice > 0.6 && bar % 2 === 1 && s === 8) this.playVoice(t, 0.35, 1.5);
  }
  // --- instruments ---
  _env(t, a, d, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    return g;
  }
  kick(t, v = 1) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this._env(t, 0.002, 0.28, 0.9 * v);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.35);
  }
  hat(t, v = 0.3, open = false) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = this._env(t, 0.001, open ? 0.22 : 0.045, v * 0.35);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.3);
  }
  clap(t, v = 0.6) {
    for (let i = 0; i < 3; i++) {
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 1.4;
      const g = this._env(t + i * 0.012, 0.001, i === 2 ? 0.2 : 0.03, v * 0.4);
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t + i * 0.012); src.stop(t + 0.4);
    }
  }
  bassNote(t, freq, dur, intensity, v = 0.7) {
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const sub = this.ctx.createOscillator(); sub.frequency.value = freq / 2;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(180 + intensity * 2200, t);
    f.frequency.exponentialRampToValueAtTime(120, t + dur);
    f.Q.value = 4;
    const g = this._env(t, 0.008, dur, 0.5 * v);
    const sg = this._env(t, 0.008, dur, 0.4 * v);
    o.connect(f); f.connect(g); g.connect(this.master);
    sub.connect(sg); sg.connect(this.master);
    o.start(t); o.stop(t + dur + 0.1); sub.start(t); sub.stop(t + dur + 0.1);
  }
  pluck(t, freq, v = 0.3, shimmer = false) {
    const o = this.ctx.createOscillator(); o.type = shimmer ? 'sine' : 'triangle'; o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 6, t);
    f.frequency.exponentialRampToValueAtTime(freq, t + 0.3);
    const g = this._env(t, 0.004, 0.32, v);
    o.connect(f); f.connect(g); g.connect(this.master); g.connect(this.delay);
    o.start(t); o.stop(t + 0.5);
  }
  zap(t, v = 0.4) { // energy-role tap
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.18);
    const g = this._env(t, 0.002, 0.2, v * 0.4);
    o.connect(g); g.connect(this.master); g.connect(this.delay); o.start(t); o.stop(t + 0.3);
  }
  riser(t, dur = 1.2, v = 0.5) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(v * 0.5, t + dur);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.15);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur + 0.3);
  }
  impact(t, v = 1) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    const g = this._env(t, 0.005, 1.1, v * 0.9);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.3);
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(4000, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 1);
    const ng = this._env(t, 0.005, 1, v * 0.35);
    src.connect(f); f.connect(ng); ng.connect(this.master); src.start(t); src.stop(t + 1.2);
  }
  tick(t, hi = false) { // countdown tick
    const o = this.ctx.createOscillator(); o.frequency.value = hi ? 880 : 440;
    const g = this._env(t, 0.002, hi ? 0.5 : 0.18, 0.4);
    o.connect(g); g.connect(this.master); g.connect(this.delay); o.start(t); o.stop(t + 0.7);
  }
  playVoice(t, v = 0.8, rate = 1) {
    const src = this.ctx.createBufferSource(); src.buffer = this.voiceBuffer; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = v;
    src.connect(g); g.connect(this.master); g.connect(this.delay); src.start(t);
  }
  // quantized one-shot for a volunteer tap; returns seconds until it sounds
  tapSound(role) {
    if (!this.ready || !this.running) return 0;
    const t = Math.max(this.nextTime, this.ctx.currentTime + 0.02);
    const bar = this.bar, root = ROOTS[bar % 4];
    if (role === 'rhythm') { this.kick(t, 0.7); this.hat(t, 0.5); }
    else if (role === 'bass') this.bassNote(t, root, STEP * 2, Math.max(0.4, this.intensity.bass), 0.8);
    else if (role === 'melody') this.pluck(t, PENTA[(this._melIdx++) % PENTA.length] * 1.0, 0.35);
    else if (role === 'energy') this.zap(t);
    else if (role === 'voice' && this.voiceBuffer) this.playVoice(t, 0.6);
    return t - this.ctx.currentTime;
  }
  // simulated 2-second "word" when no mic
  makeFallbackVoice() {
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * 1.1);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    // vowel-ish formant sweep: "en-em-ess"
    for (let i = 0; i < len; i++) {
      const t = i / sr, p = i / len;
      const f0 = 155 + Math.sin(p * Math.PI) * 25;
      const env = Math.min(1, p * 12) * Math.pow(1 - p, 0.7);
      const form = Math.sin(2 * Math.PI * f0 * t) * 0.5 +
        Math.sin(2 * Math.PI * f0 * 2 * t) * 0.3 * Math.sin(p * 9) +
        Math.sin(2 * Math.PI * (900 - p * 400) * t) * 0.22 +
        (Math.random() - 0.5) * 0.06 * (p > 0.75 ? 1 : 0.2);
      d[i] = form * env * 0.6;
    }
    this.voiceBuffer = buf;
    return buf;
  }
}
export const STEP_SEC = STEP;
export const BPM_VAL = BPM;
