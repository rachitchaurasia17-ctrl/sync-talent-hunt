// SYNC — shared show state across tabs (projector / conductor / volunteers)
// BroadcastChannel + localStorage snapshot. Simulated networking, swappable for sockets later.
const KEY = 'sync-show-state-v1';
const ROLES = [
  { id: 0, role: 'KICK', color: '#5ee7ff' },
  { id: 1, role: 'SNARE', color: '#5ee7ff' },
  { id: 2, role: 'HI-HATS', color: '#5ee7ff' },
  { id: 3, role: 'BASS', color: '#4d7cfe' },
  { id: 4, role: 'CHORDS', color: '#4d7cfe' },
  { id: 5, role: 'MAIN MELODY', color: '#9b6dff' },
  { id: 6, role: 'SUPPORT MELODY', color: '#9b6dff' },
  { id: 7, role: 'EFFECTS', color: '#ff5e8a' },
  { id: 8, role: 'VOICE FX', color: '#eaf2ff' },
  { id: 9, role: 'FINAL ENERGY', color: '#ffd166' },
];
export function defaultState() {
  return {
    scene: 1, demo: false, muted: false, playing: false, countdown: '', drop: 0,
    proofStep: 0, voiceStatus: 'idle', resetCount: 0, finalShown: false,
    vols: ROLES.map(r => ({ ...r, name: '', connected: false, enabled: true, muted: false, energy: 0 })),
  };
}
export const ROLE_LIST = ROLES;
export class SyncStore {
  constructor(who) {
    this.who = who;
    this.listeners = new Set();
    this.msgListeners = new Set();
    try { this.state = { ...defaultState(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch (e) { this.state = defaultState(); }
    if (!this.state.vols || this.state.vols.length !== 10) this.state = defaultState();
    this.ch = new BroadcastChannel('sync-show');
    this.ch.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'patch') { this._merge(m.data); this._emit(); }
      else if (m.type === 'patchVol') { this._mergeVol(m.id, m.data); this._emit(); }
      else if (m.type === 'reset') { this.state = defaultState(); this.state.resetCount = m.n; this._emit(); }
      else this.msgListeners.forEach(fn => fn(m));
    };
  }
  get() { return this.state; }
  vol(id) { return this.state.vols[id]; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onMessage(fn) { this.msgListeners.add(fn); return () => this.msgListeners.delete(fn); }
  _emit() { this.listeners.forEach(fn => fn(this.state)); }
  _merge(d) { this.state = { ...this.state, ...d }; this._save(); }
  _mergeVol(id, d) {
    this.state = { ...this.state, vols: this.state.vols.map(v => v.id === id ? { ...v, ...d } : v) };
    this._save();
  }
  _save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) {} }
  patch(d) { this._merge(d); this.ch.postMessage({ type: 'patch', data: d }); this._emit(); }
  patchVol(id, d) { this._mergeVol(id, d); this.ch.postMessage({ type: 'patchVol', id, data: d }); this._emit(); }
  send(type, payload) { this.ch.postMessage({ type, ...payload }); }
  reset() {
    const n = (this.state.resetCount || 0) + 1;
    this.state = defaultState(); this.state.resetCount = n; this._save();
    this.ch.postMessage({ type: 'reset', n }); this._emit();
  }
  // volunteer joins: claim next free slot, returns vol or null
  join(name) {
    const free = this.state.vols.find(v => !v.connected);
    if (!free) return null;
    this.patchVol(free.id, { connected: true, name: name.slice(0, 14) });
    return this.state.vols[free.id];
  }
  tap(id) { this.send('tap', { id }); }
}
