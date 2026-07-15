# SYNC — Ten Humans. One Song.

An interactive musical performance application for NMIMS Chandigarh Talent Hunt.

**Created by Rachit Chaurasia**

---

## Concept

Exactly 10 volunteers from the audience join using their phones. Each volunteer controls one musical layer (Kick, Snare, Bass, Melody, etc.) through tapping on their phone screen.

- More tapping → more energy → their musical layer becomes louder
- Stop tapping → energy decays → their layer fades
- The audience sees this happen in real-time on the projector

All audio plays only from the laptop. Phones are silent controllers.

## Quick Start

### Prerequisites

- **Node.js** v18+ installed
- Laptop and phones on the **same Wi-Fi / hotspot**

### Install & Run

```bash
cd "talent hunt"
npm install
npm start
```

The terminal will print URLs for each page:

```
🎵 Projector:  http://<LAN_IP>:3000/projector
🎛  Conductor:  http://<LAN_IP>:3000/conductor
📱 Join (QR):  http://<LAN_IP>:3000/join
🏠 Index:      http://<LAN_IP>:3000/
```

### Setup for Performance

1. **Open `/conductor`** on the laptop in one browser tab (private control panel)
2. **Open `/projector`** on the laptop in another tab or window (connect to projector/screen)
   - Press F11 for fullscreen
   - Click **"UNLOCK AUDIO"** button
3. **Share the QR code** or join URL displayed on the conductor page
4. Volunteers scan QR → enter their name → join → redirect to tap screen
5. Use the conductor to control scenes, demo mode, mute/enable volunteers

### Routes

| Route | Purpose |
|-------|---------|
| `/` | Index page with links |
| `/projector` | Audience-facing cinematic display |
| `/conductor` | Private performance controls |
| `/join` | Volunteer entry (mobile) |
| `/player` | Volunteer tap screen (mobile) |

## Keyboard Shortcuts (Projector & Conductor)

| Key | Action |
|-----|--------|
| `→` or `Space` | Next scene |
| `←` | Previous scene |
| `1-9` | Jump to scene |
| `D` | Toggle demo mode |
| `F` | Final drop |
| `Escape` | Emergency stop |

## Scenes

1. **Opening** — Title: "SYNC" → "Can ten strangers become one musician?"
2. **Joining** — Volunteer cores awaken
3. **Interaction Proof** — TAP ONCE demo
4. **Rhythm** — Kick, Snare, Hi-Hats
5. **Foundation** — Bass, Chords
6. **Melody** — Main and Supporting Melody
7. **Effects** — Effects and Vocal Effects
8. **Silence Before Finale** — "ONE LAST BEAT"
9. **Final Drop** — Countdown → Full sync → Credits

## Audio System

The BGM (Lover Instrumental) is loaded and played through 10 parallel filtered layers:
- Each layer uses a different filter (lowpass, bandpass, highpass) to isolate different frequency ranges
- Volunteer energy controls the gain of their assigned layer
- Supplementary synthesized sounds (kick, snare, hi-hat) add immediate tap feedback
- All layers stay synchronized on a shared timeline

## Technology

- **Node.js + Express** — Server
- **Socket.IO** — Real-time communication
- **Web Audio API** — Audio layering & synthesis
- **Canvas** — Particle effects & beams
- **CSS** — Animations & responsive design
- No database, no authentication, no cloud dependency

## Files

```
talent hunt/
├── server.js              # Main server
├── package.json           # Dependencies
├── README.md              # This file
├── TESTING.md             # Testing checklist
├── nmims logo             # Official NMIMS logo (JPEG)
├── Lover Instrumental...  # BGM audio (MP3)
└── public/
    ├── index.html          # Root page
    ├── projector.html      # Projector experience
    ├── conductor.html      # Conductor console
    ├── join.html           # Volunteer join
    └── player.html         # Volunteer player
```

## Troubleshooting

- **Audio doesn't play**: Click "UNLOCK AUDIO" on the projector page (browser autoplay policy)
- **Phones can't connect**: Ensure all devices are on the same Wi-Fi/hotspot. Check firewall isn't blocking port 3000
- **Lag**: Close unnecessary apps. Use the laptop's hotspot for lowest latency
- **Volunteer disconnects**: They can rejoin with the same name to reconnect
