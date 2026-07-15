// SYNC — audio engine: uploaded BGM through energy-controlled multiband mix + quantized synth accents
const BPM = 100;
const STEP = 60 / BPM / 4;
const TRACK = 'uploads/Lover Instrumental BGM - Diljit Dosanjh _ Intense _ MoonChild Era _ Sunny Rana _ Ringtone.mp3';
export class SyncAudio {
  constructor() {
    this.ready = false; this.trackReady = false; this.playing = false;
    this.energies = { kick: 0, snare: 0, hats: 0, bass: 0, chords: 0, mainMel: 0, supMel: 0, effects: 0, voice: 0, finalEnergy: 0 };
    this.voiceBuffer = null; this.muted = false; this._melIdx = 0;
  }
  init() {
    if (this.ready) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 256;
    this.master.connect(comp); comp.connect(this.analyser); this.analyser.connect(ctx.destination);
    // echo send
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = STEP * 3;
    const dfb = ctx.createGain(); dfb.gain.value = 0.4;
    const dflt = ctx.createBiquadFilter(); dflt.type = 'lowpass'; dflt.frequency.value = 2600;
    this.delay.connect(dfb); dfb.connect(dflt); dflt.connect(this.delay);
    this.dOut = ctx.createGain(); this.dOut.gain.value = 0.4;
    this.delay.connect(this.dOut); this.dOut.connect(this.master);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    // track band chain (gains driven by role energies)
    this.trackIn = ctx.createGain(); this.trackIn.gain.value = 1;
    this.bands = {};
    const mk = (name, type, freq, q) => {
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      this.trackIn.connect(f); f.connect(g); g.connect(this.master);
      this.bands[name] = { f, g };
      return g;
    };
    mk('sub', 'lowpass', 110);
    mk('low', 'bandpass', 230, 0.9);
    mk('mid', 'bandpass', 800, 0.7);
    mk('hiMid', 'bandpass', 2400, 0.8);
    mk('high', 'highpass', 4200);
    // fx send from track mids/highs
    this.fxSend = ctx.createGain(); this.fxSend.gain.value = 0;
    this.bands.hiMid.g.connect(this.fxSend); this.bands.high.g.connect(this.fxSend);
    this.fxSend.connect(this.delay);
    this.ready = true;
    // load BGM
    fetch(encodeURI(TRACK)).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => {
      this.trackBuf = buf; this.trackReady = true;
      if (this._wantPlay) this.playTrack();
    }).catch(e => console.warn('BGM load failed', e));
  }
  now() { return this.ctx ? this.ctx.currentTime : 0; }
  playTrack() {
    if (!this.ready) this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.trackReady) { this._wantPlay = true; return; }
    if (this.playing) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.trackBuf; src.loop = true;
    src.connect(this.trackIn);
    src.start();
    this.trackSrc = src; this.playing = true;
    this.gridStart = this.ctx.currentTime;
    this._timer = setInterval(() => this._tick(), 25);
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0; this.bar = 0;
  }
  stopTrack(fade = 0.5) {
    if (!this.playing) return;
    this.playing = false; this._wantPlay = false;
    clearInterval(this._timer);
    const t = this.ctx.currentTime, src = this.trackSrc;
    this.trackIn.gain.setValueAtTime(1, t);
    this.trackIn.gain.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => { try { src.stop(); } catch (e) {} this.trackIn.gain.value = 1; }, fade * 1000 + 50);
  }
  setMuted(m) { this.muted = m; if (this.ready) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); }
  // e: role energies 0..1 — called every frame from projector
  setEnergies(e) {
    if (!this.ready) return;
    this.energies = e;
    const t = this.ctx.currentTime, C = 0.12;
    const master = 0.4 + 0.6 * Math.min(1, (e.kick + e.snare + e.hats + e.bass + e.chords + e.mainMel + e.supMel) / 4 + e.finalEnergy * 0.5);
    const B = this.bands, clamp = (v) => Math.min(1.2, Math.max(0, v));
    B.sub.g.gain.setTargetAtTime(clamp(e.kick * 1.15 + e.bass * 0.25) * master, t, C);
    B.low.g.gain.setTargetAtTime(clamp(e.bass * 1.05 + e.kick * 0.2 + e.snare * 0.12) * master, t, C);
    B.mid.g.gain.setTargetAtTime(clamp(e.chords * 0.95 + e.snare * 0.3 + e.bass * 0.15) * master, t, C);
    B.hiMid.g.gain.setTargetAtTime(clamp(e.mainMel * 1.0 + e.chords * 0.2 + e.snare * 0.15) * master, t, C);
    B.high.g.gain.setTargetAtTime(clamp(e.hats * 0.8 + e.supMel * 0.6 + e.effects * 0.3) * master, t, C);
    this.fxSend.gain.setTargetAtTime(clamp(e.effects * 0.8 + e.supMel * 0.2), t, 0.2);
  }
  beatPhase() {
    if (!this.ready || !this.playing) return 0;
    const q = STEP * 4;
    return ((this.ctx.currentTime - (this.gridStart || 0)) % q) / q;
  }
  getLevel() {
    if (!this.ready) return 0;
    const a = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(a);
    let s = 0; for (let i = 0; i < 24; i++) s += a[i];
    return s / 24 / 255;
  }
  _tick() { // subtle quantized accents so taps feel musical
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const s = this.step, t = this.nextTime, e = this.energies;
      if (e.hats > 0.5 && s % 4 === 2) this.hat(t, 0.1 + e.hats * 0.1);
      if (e.voice && this.voiceBuffer && s === 0 && this.bar % 4 === 0 && e.voice > 0.25) this.playVoice(t, 0.5 + e.voice * 0.4);
      this.nextTime += STEP;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }
  _q() { return this.playing ? Math.max(this.nextTime, this.ctx.currentTime + 0.02) : this.ctx.currentTime + 0.02; }
  // --- synth kit ---
  _env(t, a, d, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    return g;
  }
  kick(t, v = 1) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this._env(t, 0.002, 0.28, 0.85 * v);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.35);
  }
  snare(t, v = 0.6) {
    for (let i = 0; i < 2; i++) {
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.2;
      const g = this._env(t + i * 0.011, 0.001, i ? 0.18 : 0.03, v * 0.4);
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t + i * 0.011); src.stop(t + 0.35);
    }
    const o = this.ctx.createOscillator(); o.frequency.value = 190;
    const g2 = this._env(t, 0.001, 0.09, v * 0.3);
    o.connect(g2); g2.connect(this.master); o.start(t); o.stop(t + 0.15);
  }
  hat(t, v = 0.3, open = false) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7800;
    const g = this._env(t, 0.001, open ? 0.2 : 0.045, v * 0.32);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.3);
  }
  bassNote(t, freq = 55, v = 0.7) {
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const sub = this.ctx.createOscillator(); sub.frequency.value = freq / 2;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(140, t + 0.3); f.Q.value = 4;
    const g = this._env(t, 0.008, 0.3, 0.45 * v), sg = this._env(t, 0.008, 0.3, 0.38 * v);
    o.connect(f); f.connect(g); g.connect(this.master);
    sub.connect(sg); sg.connect(this.master);
    o.start(t); o.stop(t + 0.45); sub.start(t); sub.stop(t + 0.45);
  }
  chordStab(t, v = 0.35) {
    [220, 261.63, 329.63].forEach(fr => {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
      const g = this._env(t, 0.01, 0.35, v * 0.16);
      o.connect(g); g.connect(this.master); g.connect(this.delay); o.start(t); o.stop(t + 0.5);
    });
  }
  pluck(t, freq, v = 0.3) {
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 6, t);
    f.frequency.exponentialRampToValueAtTime(freq, t + 0.3);
    const g = this._env(t, 0.004, 0.3, v);
    o.connect(f); f.connect(g); g.connect(this.master); g.connect(this.delay);
    o.start(t); o.stop(t + 0.5);
  }
  zap(t, v = 0.35) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.18);
    const g = this._env(t, 0.002, 0.2, v * 0.35);
    o.connect(g); g.connect(this.master); g.connect(this.delay); o.start(t); o.stop(t + 0.3);
  }
  riser(t, dur = 1.1, v = 0.5) {
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
    const g = this._env(t, 0.005, 1.1, v * 0.85);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.3);
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(4000, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 1);
    const ng = this._env(t, 0.005, 1, v * 0.3);
    src.connect(f); f.connect(ng); ng.connect(this.master); src.start(t); src.stop(t + 1.2);
  }
  tick(t, hi = false) {
    const o = this.ctx.createOscillator(); o.frequency.value = hi ? 880 : 440;
    const g = this._env(t, 0.002, hi ? 0.5 : 0.18, 0.4);
    o.connect(g); g.connect(this.master); g.connect(this.delay); o.start(t); o.stop(t + 0.7);
  }
  heartbeat(t, v = 0.25) { this.kick(t, v); this.kick(t + 0.28, v * 0.6); }
  playVoice(t, v = 0.8, rate = 1) {
    if (!this.voiceBuffer) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.voiceBuffer; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = v;
    src.connect(g); g.connect(this.master); g.connect(this.delay); src.start(t);
  }
  // quantized accent per volunteer tap; returns delay (s) until audible
  tapSound(role) {
    if (!this.ready) return 0.05;
    const t = this._q();
    const PENTA = [440, 523.25, 587.33, 659.25, 783.99];
    switch (role) {
      case 'KICK': this.kick(t, 0.75); break;
      case 'SNARE': this.snare(t, 0.6); break;
      case 'HI-HATS': this.hat(t, 0.5, Math.random() < 0.25); break;
      case 'BASS': this.bassNote(t, 55, 0.75); break;
      case 'CHORDS': this.chordStab(t); break;
      case 'MAIN MELODY': this.pluck(t, PENTA[this._melIdx++ % 5], 0.3); break;
      case 'SUPPORT MELODY': this.pluck(t, PENTA[(this._melIdx + 2) % 5] * 2, 0.18); break;
      case 'EFFECTS': this.zap(t); break;
      case 'VOICE FX': this.playVoice(t, 0.55); break;
      case 'FINAL ENERGY': this.riser(t, 0.5, 0.25); break;
    }
    return t - this.ctx.currentTime;
  }
  makeFallbackVoice() {
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * 1.1);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sr, p = i / len;
      const f0 = 155 + Math.sin(p * Math.PI) * 25;
      const env = Math.min(1, p * 12) * Math.pow(1 - p, 0.7);
      d[i] = (Math.sin(6.283 * f0 * t) * 0.5 + Math.sin(6.283 * f0 * 2 * t) * 0.3 * Math.sin(p * 9) +
        Math.sin(6.283 * (900 - p * 400) * t) * 0.22 + (Math.random() - 0.5) * 0.06 * (p > 0.75 ? 1 : 0.2)) * env * 0.6;
    }
    this.voiceBuffer = buf;
    return buf;
  }
  setVoiceFromPCM(pcm, rate) {
    if (!this.ready) this.init();
    const buf = this.ctx.createBuffer(1, pcm.length, rate);
    buf.getChannelData(0).set(pcm);
    this.voiceBuffer = buf;
    return buf;
  }
}
export const STEP_SEC = STEP;
