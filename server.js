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
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

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
    demoMode: false,
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
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.get('/player', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// QR code endpoint
app.get('/api/qr', async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    const joinUrl = `${protocol}://${host}/join`;
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

    // Check if reconnecting (only for real volunteers)
    const existing = state.volunteers.find(v => v.name === name && !v.connected && !v.isDemo);
    if (existing) {
      existing.socketId = socket.id;
      existing.connected = true;
      socket.emit('joinAccepted', { volunteer: existing, role: ROLES[existing.roleId] });
      io.emit('participantReconnected', { volunteer: existing });
      io.emit('stateSync', state);
      console.log(`[SYNC] Reconnected: ${name} as ${ROLES[existing.roleId].name}`);
      return;
    }

    const realVolunteers = state.volunteers.filter(v => !v.isDemo);

    if (realVolunteers.length >= MAX_VOLUNTEERS) {
      socket.emit('joinRejected', { reason: 'ALL 10 PERFORMANCE POSITIONS ARE FILLED.' });
      return;
    }

    // Check duplicate name for connected real users
    const dupe = realVolunteers.find(v => v.name === name && v.connected);
    if (dupe) {
      socket.emit('joinRejected', { reason: 'This name is already taken.' });
      return;
    }

    // Auto-assign the next available role (checking only real volunteers)
    const takenRoles = new Set(realVolunteers.map(v => v.roleId));
    let roleId = -1;
    for (let i = 0; i < ROLES.length; i++) {
      if (!takenRoles.has(i)) { roleId = i; break; }
    }
    if (roleId === -1) {
      socket.emit('joinRejected', { reason: 'ALL 10 PERFORMANCE POSITIONS ARE FILLED.' });
      return;
    }

    // If there is a demo volunteer holding this role, remove it to make space
    const demoIndex = state.volunteers.findIndex(v => v.roleId === roleId && v.isDemo);
    if (demoIndex !== -1) {
      state.volunteers.splice(demoIndex, 1);
    }

    const volunteer = {
      id: 0, // Will be updated during re-indexing
      socketId: socket.id,
      name: name.trim().substring(0, 20),
      roleId,
      energy: 0,
      enabled: true,
      muted: false,
      connected: true,
      lastTap: 0,
      isDemo: false
    };

    state.volunteers.push(volunteer);
    // Re-index to keep id aligned with array index
    state.volunteers.forEach((v, i) => v.id = i);

    socket.emit('joinAccepted', { volunteer, role: ROLES[roleId] });
    io.emit('participantJoined', { volunteer, role: ROLES[roleId], count: realVolunteers.length + 1 });
    io.emit('stateSync', state);
    console.log(`[SYNC] Joined: ${name} → ${ROLES[roleId].name} (${realVolunteers.length + 1}/${MAX_VOLUNTEERS} real)`);
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

  socket.on('conductorDemo', ({ active }) => {
    state.demoMode = active;
    if (!active) {
      // Clear demo volunteers if disabled
      state.volunteers = state.volunteers.filter(v => !v.isDemo);
    }
    io.emit('demoModeActivated', { active });
    io.emit('stateSync', state);
  });

  socket.on('demoVolunteerPatch', ({ roleId, connected, name }) => {
    if (connected) {
      const existing = state.volunteers.find(v => v.roleId === roleId);
      if (!existing) {
        state.volunteers.push({
          id: roleId,
          socketId: 'demo-' + roleId,
          name: name,
          roleId: roleId,
          energy: 0,
          enabled: true,
          muted: false,
          connected: true,
          isDemo: true
        });
      }
    } else {
      state.volunteers = state.volunteers.filter(v => v.roleId !== roleId);
    }
    io.emit('stateSync', state);
  });

  socket.on('syncMessage', (m) => {
    // Relay arbitrary sync messages (e.g. energy array, role swaps)
    io.emit('syncMessage', m);
  });

  socket.on('voicePCM', (m) => {
    // Relay voice waveform to all clients (mainly Projector)
    io.emit('voicePCM', m);
  });

  socket.on('conductorEmergencyStop', () => {
    state.emergencyStop = true;
    state.started = false;
    state.demoMode = false;
    io.emit('emergencyStop', {});
    io.emit('stateSync', state);
  });

  socket.on('conductorClearVolunteers', () => {
    state.volunteers.forEach(v => {
      const targetSocket = io.sockets.sockets.get(v.socketId);
      if (targetSocket) targetSocket.emit('youAreRemoved');
    });
    state.volunteers = [];
    io.emit('stateSync', state);
    console.log('[SYNC] All volunteers cleared');
  });

  socket.on('conductorReset', () => {
    state.volunteers.forEach(v => {
      const targetSocket = io.sockets.sockets.get(v.socketId);
      if (targetSocket) targetSocket.emit('youAreRemoved');
    });
    state = createFreshState();
    io.emit('stateSync', state);
    io.emit('performanceReset', {});
    console.log('[SYNC] Performance Reset');
  });

  socket.on('conductorFullReset', () => {
    state.volunteers.forEach(v => {
      const targetSocket = io.sockets.sockets.get(v.socketId);
      if (targetSocket) targetSocket.emit('youAreRemoved');
    });
    state = createFreshState();
    io.emit('stateSync', state);
    io.emit('performanceReset', {});
    console.log('[SYNC] Full Reset');
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

  socket.on('conductorRoleEnable', ({ roleId, enabled }) => {
    const vol = state.volunteers.find(v => v.roleId === roleId);
    if (vol) {
        vol.enabled = enabled;
        if (!enabled) vol.energy = 0;
        const targetSocket = io.sockets.sockets.get(vol.socketId);
        if (targetSocket) targetSocket.emit(enabled ? 'youAreEnabled' : 'youAreDisabled');
        io.emit(enabled ? 'participantEnabled' : 'participantDisabled', { id: vol.id, roleId: vol.roleId });
    }
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
      console.log(`[SYNC] Disconnected: ${vol.name} ${vol.isDemo ? '(Demo)' : '(Real)'}`);
    }
  });
});

// ============================================================
// Energy Decay & Demo Loops
// Moved to Projector Frontend UI. Server just relays states!
// ============================================================
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
