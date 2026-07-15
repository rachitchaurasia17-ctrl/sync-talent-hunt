// SYNC — shared show state over Socket.IO (replaces local BroadcastChannel)

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
    this.state = defaultState();
    
    // Connect Socket.IO
    this.socket = window.io ? window.io() : null;
    if (!this.socket) {
        console.error('Socket.IO not found on window. Ensure <script src="/socket.io/socket.io.js"></script> is loaded.');
    } else {
        this.socket.on('stateSync', (serverState) => {
            // Map server state to Claude UI state
            this.state.scene = serverState.currentScene + 1;
            this.state.demo = serverState.demoMode;
            
            this.state.vols = ROLES.map(r => {
                const sVol = serverState.volunteers.find(v => v.roleId === r.id);
                if (sVol) {
                    return { 
                      ...r, 
                      name: sVol.name, 
                      connected: sVol.connected, 
                      enabled: sVol.enabled, 
                      muted: sVol.muted, 
                      energy: sVol.energy 
                    };
                } else {
                    return { ...r, name: '', connected: false, enabled: true, muted: false, energy: 0 };
                }
            });
            this._emit();
        });

        this.socket.on('performanceReset', () => {
            this.state = defaultState();
            this.state.resetCount = (this.state.resetCount || 0) + 1;
            this._emit();
        });

        this.socket.on('youAreRemoved', () => {
            this.state = defaultState();
            this.state.resetCount = (this.state.resetCount || 0) + 1;
            this._emit();
            localStorage.removeItem('sync-my-vol');
            window.location.reload();
        });

        // Map async join events to callbacks we injected in player.html
        this.socket.on('joinAccepted', ({ volunteer, role }) => {
            if (this.onJoinAccepted) this.onJoinAccepted(volunteer);
        });

        this.socket.on('joinRejected', ({ reason }) => {
            if (this.onJoinRejected) this.onJoinRejected(reason);
        });

        // Custom messages
        this.socket.on('syncMessage', (m) => {
            this.msgListeners.forEach(fn => fn(m));
        });

        this.socket.on('participantTapped', (m) => {
           this.msgListeners.forEach(fn => fn({ type: 'tap', id: m.roleId }));
        });
        
        // Handle voice simulation logic fallback
        this.socket.on('voicePCM', (m) => {
            this.msgListeners.forEach(fn => fn({ type: 'voicePCM', pcm: new Float32Array(m.pcm), rate: m.rate }));
        });
    }
  }

  get() { return this.state; }
  vol(id) { return this.state.vols[id]; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onMessage(fn) { this.msgListeners.add(fn); return () => this.msgListeners.delete(fn); }
  _emit() { this.listeners.forEach(fn => fn(this.state)); }

  patch(d) {
      if (!this.socket) return;
      if (d.scene !== undefined) this.socket.emit('conductorScene', { scene: d.scene - 1 });
      if (d.demo !== undefined) this.socket.emit('conductorDemo', { active: d.demo });
  }

  patchVol(id, d) {
      if (!this.socket) return;
      if (d.muted !== undefined) this.socket.emit('conductorRoleMute', { roleId: id, muted: d.muted });
      if (d.enabled !== undefined) this.socket.emit('conductorRoleEnable', { roleId: id, enabled: d.enabled });
      if (d.connected !== undefined) this.socket.emit('demoVolunteerPatch', { roleId: id, connected: d.connected, name: d.name });
  }

  send(type, payload) {
      if (!this.socket) return;
      if (type === 'energy') {
          this.socket.emit('syncMessage', { type: 'energy', ...payload });
      } else if (type === 'voicePCM') {
          this.socket.emit('voicePCM', { pcm: Array.from(payload.pcm), rate: payload.rate });
      } else {
          this.socket.emit('syncMessage', { type, ...payload });
      }
  }

  reset() {
      if (this.socket) this.socket.emit('conductorFullReset');
  }

  join(name) {
      if (this.socket) this.socket.emit('volunteerJoin', { name });
  }

  tap(id) {
      if (this.socket) this.socket.emit('volunteerTap');
  }
}
