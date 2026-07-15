// ============================================================
// SYNC — Server
// Ten Humans. One Song.
// Created by Rachit Chaurasia for NMIMS Chandigarh Talent Hunt
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 2000,
  pingTimeout: 5000
});

const PORT = process.env.PORT || 3000;

// ============================================================
// Static files
// ============================================================
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// ============================================================
// Performance State
// ============================================================
const ROLES = [
  { id: 0, name: 'Kick', category: 'rhythm' },
  { id: 1, name: 'Snare / Clap', category: 'rhythm' },
  { id: 2, name: 'Hi-Hats / Percussion', category: 'rhythm' },
  { id: 3, name: 'Bass', category: 'foundation' },
  { id: 4, name: 'Chords / Pad', category: 'foundation' },
  { id: 5, name: 'Main Melody', category: 'melody' },
  { id: 6, name: 'Supporting Melody', category: 'melody' },
  { id: 7, name: 'Effects / Atmosphere', category: 'effects' },
  { id: 8, name: 'Vocal Effects', category: 'effects' },
  { id: 9, name: 'Final Energy / Drop', category: 'finale' }
];

const MAX_VOLUNTEERS = 10;

let state = createFreshState();

function createFreshState() {
  return {
    joinOpen: true,
    started: false,
    paused: false,
    currentScene: 0,
    demoMode: false,
    blackout: false,
    emergencyStop: false,
    masterVolume: 0.8,
    energySensitivity: 15,   // energy added per tap
    decayRate: 2,             // energy lost per second
    bpm: 120,
    volunteers: [],           // { id, socketId, name, roleId, energy, enabled, muted, connected, lastTap }
    roleVolumes: ROLES.map(() => 0.8),
    roleMutes: ROLES.map(() => false)
  };
}

// ============================================================
// Utility: Get LAN IP
// ============================================================
function getLanIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const LAN_IP = getLanIP();

// ============================================================
// Routes — Serve HTML pages
// ============================================================

// Root index
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/projector', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'projector.html'));
});

app.get('/conductor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'conductor.html'));
});

app.get('/join', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

app.get('/player', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// QR code endpoint
app.get('/api/qr', async (req, res) => {
  try {
    const joinUrl = `http://${LAN_IP}:${PORT}/join`;
    const qrDataUrl = await QRCode.toDataURL(joinUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#ffffff', light: '#00000000' }
    });
    res.json({ qr: qrDataUrl, url: joinUrl });
  } catch (e) {
    res.status(500).json({ error: 'QR generation failed' });
  }
});

// State endpoint
app.get('/api/state', (req, res) => {
  res.json(state);
});

// BGM file route
app.get('/api/bgm', (req, res) => {
  const bgmFile = path.join(__dirname, 'Lover Instrumental BGM - Diljit Dosanjh _ Intense _ MoonChild Era _ Sunny Rana _ Ringtone.mp3');
  res.sendFile(bgmFile);
});

// Logo route
app.get('/api/logo', (req, res) => {
  const logoFile = path.join(__dirname, 'nmims logo');
  res.sendFile(logoFile, { headers: { 'Content-Type': 'image/jpeg' } });
});

// ============================================================
// Socket.IO — Real-time Communication
// ============================================================
io.on('connection', (socket) => {
  console.log(`[SYNC] Connection: ${socket.id}`);

  // Send current state to new connection
  socket.emit('stateSync', state);

  // ---------- Volunteer Join ----------
  socket.on('volunteerJoin', ({ name }) => {
    if (!state.joinOpen) {
      socket.emit('joinRejected', { reason: 'Joining is closed.' });
      return;
    }

    // Check if reconnecting
    const existing = state.volunteers.find(v => v.name === name && !v.connected);
    if (existing) {
      existing.socketId = socket.id;
      existing.connected = true;
      socket.emit('joinAccepted', { volunteer: existing, role: ROLES[existing.roleId] });
      io.emit('participantReconnected', { volunteer: existing });
      io.emit('stateSync', state);
      console.log(`[SYNC] Reconnected: ${name} as ${ROLES[existing.roleId].name}`);
      return;
    }

    if (state.volunteers.length >= MAX_VOLUNTEERS) {
      socket.emit('joinRejected', { reason: 'ALL 10 PERFORMANCE POSITIONS ARE FILLED.' });
      return;
    }

    // Check duplicate name for connected users
    const dupe = state.volunteers.find(v => v.name === name && v.connected);
    if (dupe) {
      socket.emit('joinRejected', { reason: 'This name is already taken.' });
      return;
    }

    // Auto-assign the next available role
    const takenRoles = new Set(state.volunteers.map(v => v.roleId));
    let roleId = -1;
    for (let i = 0; i < ROLES.length; i++) {
      if (!takenRoles.has(i)) { roleId = i; break; }
    }
    if (roleId === -1) {
      socket.emit('joinRejected', { reason: 'ALL 10 PERFORMANCE POSITIONS ARE FILLED.' });
      return;
    }

    const volunteer = {
      id: state.volunteers.length,
      socketId: socket.id,
      name: name.trim().substring(0, 20),
      roleId,
      energy: 0,
      enabled: true,
      muted: false,
      connected: true,
      lastTap: 0
    };

    state.volunteers.push(volunteer);
    socket.emit('joinAccepted', { volunteer, role: ROLES[roleId] });
    io.emit('participantJoined', { volunteer, role: ROLES[roleId], count: state.volunteers.length });
    io.emit('stateSync', state);
    console.log(`[SYNC] Joined: ${name} → ${ROLES[roleId].name} (${state.volunteers.length}/${MAX_VOLUNTEERS})`);
  });

  // ---------- Volunteer Tap ----------
  socket.on('volunteerTap', () => {
    const vol = state.volunteers.find(v => v.socketId === socket.id);
    if (!vol || !vol.enabled || vol.muted || state.emergencyStop) return;

    vol.energy = Math.min(100, vol.energy + state.energySensitivity);
    vol.lastTap = Date.now();

    io.emit('participantTapped', {
      id: vol.id,
      roleId: vol.roleId,
      energy: vol.energy,
      name: vol.name,
      roleName: ROLES[vol.roleId].name
    });
  });

  // ---------- Conductor Controls ----------

  socket.on('conductorSetJoinOpen', ({ open }) => {
    state.joinOpen = open;
    io.emit('stateSync', state);
  });

  socket.on('conductorStart', () => {
    state.started = true;
    state.paused = false;
    state.emergencyStop = false;
    io.emit('performanceStarted', {});
    io.emit('stateSync', state);
  });

  socket.on('conductorPause', () => {
    state.paused = !state.paused;
    io.emit('performancePaused', { paused: state.paused });
    io.emit('stateSync', state);
  });

  socket.on('conductorScene', ({ scene }) => {
    state.currentScene = scene;
    io.emit('sceneChanged', { scene });
    io.emit('stateSync', state);
  });

  socket.on('conductorDemo', ({ active }) => {
    state.demoMode = active;
    if (active) {
      // Create simulated volunteers if fewer than 10 exist
      const demoNames = ['Aarav', 'Priya', 'Rohan', 'Ananya', 'Kabir', 'Isha', 'Dev', 'Meera', 'Arjun', 'Zara'];
      while (state.volunteers.length < MAX_VOLUNTEERS) {
        const i = state.volunteers.length;
        state.volunteers.push({
          id: i,
          socketId: 'demo-' + i,
          name: demoNames[i],
          roleId: i,
          energy: 0,
          enabled: true,
          muted: false,
          connected: true,
          lastTap: Date.now()
        });
      }
      state.started = true;
      state.emergencyStop = false;
      // Start server-side demo tapping loop
      startDemoLoop();
    } else {
      stopDemoLoop();
    }
    io.emit('demoModeActivated', { active });
    io.emit('stateSync', state);
  });

  socket.on('conductorBlackout', ({ active }) => {
    state.blackout = active;
    io.emit('stateSync', state);
  });

  socket.on('conductorFinalDrop', () => {
    state.currentScene = 8; // Scene 9 (0-indexed = 8)
    io.emit('finalDropActivated', {});
    io.emit('sceneChanged', { scene: 8 });
    io.emit('stateSync', state);
  });

  socket.on('conductorEmergencyStop', () => {
    state.emergencyStop = true;
    state.started = false;
    state.demoMode = false;
    io.emit('emergencyStop', {});
    io.emit('stateSync', state);
  });

  socket.on('conductorReset', () => {
    const oldVolunteers = state.volunteers;
    state = createFreshState();
    // Keep volunteers connected but reset energy
    state.volunteers = oldVolunteers.map(v => ({
      ...v,
      energy: 0,
      enabled: true,
      muted: false
    }));
    io.emit('stateSync', state);
  });

  socket.on('conductorFullReset', () => {
    state = createFreshState();
    io.emit('stateSync', state);
    io.emit('performanceReset', {});
  });

  socket.on('conductorMasterVolume', ({ volume }) => {
    state.masterVolume = volume;
    io.emit('stateSync', state);
  });

  socket.on('conductorRoleVolume', ({ roleId, volume }) => {
    state.roleVolumes[roleId] = volume;
    io.emit('stateSync', state);
  });

  socket.on('conductorRoleMute', ({ roleId, muted }) => {
    state.roleMutes[roleId] = muted;
    // Also update the volunteer assigned to this role
    const vol = state.volunteers.find(v => v.roleId === roleId);
    if (vol) vol.muted = muted;
    io.emit('participantMuted', { roleId, muted });
    io.emit('stateSync', state);
  });

  socket.on('conductorVolunteerMute', ({ id, muted }) => {
    const vol = state.volunteers[id];
    if (vol) {
      vol.muted = muted;
      const targetSocket = io.sockets.sockets.get(vol.socketId);
      if (targetSocket) targetSocket.emit(muted ? 'youAreMuted' : 'youAreUnmuted');
      io.emit(muted ? 'participantMuted' : 'participantUnmuted', { id, roleId: vol.roleId });
      io.emit('stateSync', state);
    }
  });

  socket.on('conductorVolunteerEnable', ({ id, enabled }) => {
    const vol = state.volunteers[id];
    if (vol) {
      vol.enabled = enabled;
      if (!enabled) vol.energy = 0;
      const targetSocket = io.sockets.sockets.get(vol.socketId);
      if (targetSocket) targetSocket.emit(enabled ? 'youAreEnabled' : 'youAreDisabled');
      io.emit(enabled ? 'participantEnabled' : 'participantDisabled', { id, roleId: vol.roleId });
      io.emit('stateSync', state);
    }
  });

  socket.on('conductorVolunteerRemove', ({ id }) => {
    const vol = state.volunteers[id];
    if (vol) {
      const targetSocket = io.sockets.sockets.get(vol.socketId);
      if (targetSocket) targetSocket.emit('youAreRemoved');
      state.volunteers.splice(id, 1);
      // Re-index
      state.volunteers.forEach((v, i) => v.id = i);
      io.emit('stateSync', state);
    }
  });

  socket.on('conductorHighlight', ({ id }) => {
    io.emit('highlightVolunteer', { id });
  });

  socket.on('conductorSimulateTap', ({ id }) => {
    const vol = state.volunteers[id];
    if (vol && vol.enabled) {
      vol.energy = Math.min(100, vol.energy + state.energySensitivity);
      vol.lastTap = Date.now();
      io.emit('participantTapped', {
        id: vol.id,
        roleId: vol.roleId,
        energy: vol.energy,
        name: vol.name,
        roleName: ROLES[vol.roleId].name
      });
    }
  });

  socket.on('conductorAssignRole', ({ id, roleId }) => {
    const vol = state.volunteers[id];
    if (vol) {
      vol.roleId = roleId;
      const targetSocket = io.sockets.sockets.get(vol.socketId);
      if (targetSocket) targetSocket.emit('roleAssigned', { role: ROLES[roleId] });
      io.emit('stateSync', state);
    }
  });

  socket.on('conductorSensitivity', ({ value }) => {
    state.energySensitivity = value;
    io.emit('stateSync', state);
  });

  socket.on('conductorDecayRate', ({ value }) => {
    state.decayRate = value;
    io.emit('stateSync', state);
  });

  socket.on('conductorBPM', ({ value }) => {
    state.bpm = value;
    io.emit('stateSync', state);
  });

  socket.on('conductorPanicMute', () => {
    state.roleMutes = ROLES.map(() => true);
    state.volunteers.forEach(v => v.muted = true);
    io.emit('stateSync', state);
  });

  socket.on('conductorUnmuteAll', () => {
    state.roleMutes = ROLES.map(() => false);
    state.volunteers.forEach(v => v.muted = false);
    io.emit('stateSync', state);
  });

  socket.on('conductorCaption', ({ text }) => {
    io.emit('showCaption', { text });
  });

  socket.on('conductorCountdown', () => {
    io.emit('startCountdown', {});
  });

  socket.on('conductorPlayerMessage', ({ id, message }) => {
    const vol = state.volunteers[id];
    if (vol) {
      const targetSocket = io.sockets.sockets.get(vol.socketId);
      if (targetSocket) targetSocket.emit('conductorMessage', { message });
    }
  });

  socket.on('conductorPlayerMessageAll', ({ message }) => {
    state.volunteers.forEach(vol => {
      const targetSocket = io.sockets.sockets.get(vol.socketId);
      if (targetSocket) targetSocket.emit('conductorMessage', { message });
    });
  });

  // ---------- Disconnect ----------
  socket.on('disconnect', () => {
    const vol = state.volunteers.find(v => v.socketId === socket.id);
    if (vol) {
      vol.connected = false;
      io.emit('participantDisconnected', { id: vol.id, roleId: vol.roleId });
      io.emit('stateSync', state);
      console.log(`[SYNC] Disconnected: ${vol.name}`);
    }
  });
});

// ============================================================
// Energy Decay Loop — runs every 100ms
// ============================================================
setInterval(() => {
  if (state.emergencyStop || state.paused) return;

  let changed = false;
  state.volunteers.forEach(vol => {
    if (vol.energy > 0) {
      vol.energy = Math.max(0, vol.energy - (state.decayRate * 0.1));
      changed = true;
    }
  });

  if (changed) {
    io.emit('energyUpdate', state.volunteers.map(v => ({
      id: v.id,
      roleId: v.roleId,
      energy: v.energy
    })));
  }
}, 100);

// ============================================================
// Demo Mode Loop — Server-side simulation
// ============================================================
let demoLoopInterval = null;
let demoTick = 0;

function startDemoLoop() {
  stopDemoLoop();
  demoTick = 0;
  demoLoopInterval = setInterval(() => {
    if (!state.demoMode) { stopDemoLoop(); return; }
    demoTick++;

    // Simulate tapping per role with different rhythmic patterns
    state.volunteers.forEach(vol => {
      if (!vol.enabled || vol.muted) return;
      // Different tap rates: kick=every 2, snare=every 2, hihat=every 1,
      // bass=every 3, pad=every 4, melody=every 2, etc.
      const patterns = [2, 2, 1, 3, 4, 2, 3, 5, 4, 2];
      const pattern = patterns[vol.roleId] || 2;

      if (demoTick % pattern === 0) {
        // Add randomness to feel human
        if (Math.random() > 0.1) {
          vol.energy = Math.min(100, vol.energy + state.energySensitivity * (0.7 + Math.random() * 0.6));
          vol.lastTap = Date.now();
          io.emit('participantTapped', {
            id: vol.id,
            roleId: vol.roleId,
            energy: vol.energy,
            name: vol.name,
            roleName: ROLES[vol.roleId].name
          });
        }
      }
    });

    // Auto-advance scenes
    if (demoTick === 15) { state.currentScene = 1; io.emit('sceneChanged', { scene: 1 }); }
    if (demoTick === 35) { state.currentScene = 2; io.emit('sceneChanged', { scene: 2 }); }
    if (demoTick === 60) { state.currentScene = 3; io.emit('sceneChanged', { scene: 3 }); }
    if (demoTick === 90) { state.currentScene = 4; io.emit('sceneChanged', { scene: 4 }); }
    if (demoTick === 120) { state.currentScene = 5; io.emit('sceneChanged', { scene: 5 }); }
    if (demoTick === 150) { state.currentScene = 6; io.emit('sceneChanged', { scene: 6 }); }
    if (demoTick === 175) { state.currentScene = 7; io.emit('sceneChanged', { scene: 7 }); }
    if (demoTick === 195) {
      state.currentScene = 8;
      io.emit('finalDropActivated', {});
      io.emit('sceneChanged', { scene: 8 });
    }
    if (demoTick === 230) {
      state.demoMode = false;
      io.emit('demoModeActivated', { active: false });
      stopDemoLoop();
    }

    io.emit('stateSync', state);
  }, 250); // Every 250ms ≈ synced to ~120bpm subdivisions
}

function stopDemoLoop() {
  if (demoLoopInterval) {
    clearInterval(demoLoopInterval);
    demoLoopInterval = null;
  }
}

// ============================================================
// Start Server
// ============================================================
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║              S Y N C                         ║');
  console.log('  ║        Ten Humans. One Song.                 ║');
  console.log('  ║   by Rachit Chaurasia — NMIMS Chandigarh     ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  🎵 Projector:  http://${LAN_IP}:${PORT}/projector`);
  console.log(`  🎛  Conductor:  http://${LAN_IP}:${PORT}/conductor`);
  console.log(`  📱 Join (QR):  http://${LAN_IP}:${PORT}/join`);
  console.log(`  🏠 Index:      http://${LAN_IP}:${PORT}/`);
  console.log('');
  console.log(`  Local:         http://localhost:${PORT}/`);
  console.log('');
});
