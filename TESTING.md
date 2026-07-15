# SYNC — Testing Checklist

Use this checklist to verify the MVP before the performance.

## 1. Server & Routing

- [ ] Run `npm install` — completes without errors
- [ ] Run `npm start` — server starts
- [ ] Terminal shows LAN IP URLs for all routes
- [ ] Open `http://localhost:3000/` — index page loads
- [ ] Click Projector link → `/projector` loads
- [ ] Click Conductor link → `/conductor` loads
- [ ] Click Join link → `/join` loads
- [ ] Click Player link → `/player` redirects to `/join` (no session)

## 2. Join & Connection (use phone or second browser tab)

- [ ] Open join URL on phone (or second tab)
- [ ] Enter a name and click JOIN
- [ ] Redirects to `/player` with name and assigned role
- [ ] Conductor shows the volunteer in the grid
- [ ] Projector shows a core light up (name visible)
- [ ] Repeat for 2-3 more test volunteers
- [ ] After 10 volunteers, the 11th sees "ALL 10 PERFORMANCE POSITIONS ARE FILLED."

## 3. Tapping & Energy

- [ ] On player page, tap the big button
- [ ] Button compresses and ripple appears
- [ ] Phone vibrates (if supported)
- [ ] Conductor shows energy bar filling for that volunteer
- [ ] Projector shows core reacting (glow, particles)
- [ ] Stop tapping — energy decays over a few seconds
- [ ] Projector core dims as energy drops

## 4. Audio

- [ ] On projector, click "UNLOCK AUDIO"
- [ ] On conductor, click START
- [ ] Advance to Scene 4 (Rhythm)
- [ ] Tap volunteer assigned to Kick — hear bass thump / filtered bass
- [ ] Tap multiple volunteers — hear layers building
- [ ] Stop all tapping — layers fade over time
- [ ] Master volume slider works
- [ ] Panic Mute silences everything
- [ ] Unmute All restores audio

## 5. Conductor Controls

- [ ] OPEN/LOCK JOINING toggles
- [ ] START begins performance
- [ ] PREV/NEXT scene changes scene
- [ ] Scene buttons 1-9 jump to scenes
- [ ] Mute a volunteer → their phone shows "MUTED BY CONDUCTOR"
- [ ] Unmute restores
- [ ] Disable a volunteer → phone locks with "DISABLED BY CONDUCTOR"
- [ ] Enable restores with pulse
- [ ] HIGHLIGHT flashes a volunteer's core on projector
- [ ] SIMULATE TAP triggers a tap from conductor
- [ ] Role reassignment works
- [ ] BLACKOUT / RESTORE works
- [ ] EMERGENCY STOP kills audio

## 6. Projector Scenes

- [ ] Scene 1: Shows SYNC title, then question
- [ ] Scene 2: Shows joining status
- [ ] Scene 3: Shows TAP ONCE prompt
- [ ] Scene 4-6: Section captions appear
- [ ] Scene 7: "ONE LAST BEAT" + energy dims
- [ ] Scene 8: Subtitle appears
- [ ] Scene 9: Countdown → shockwave → credits

## 7. Demo Mode

- [ ] Click RUN DEMO on conductor
- [ ] Demo simulates tapping for all volunteers
- [ ] Scenes auto-advance
- [ ] Projector shows energy building
- [ ] Audio layers become audible
- [ ] Demo reaches final drop
- [ ] Demo stops automatically

## 8. Keyboard Shortcuts

- [ ] Right arrow / Space → next scene
- [ ] Left arrow → previous scene
- [ ] 1-9 → jump to scene
- [ ] D → toggle demo
- [ ] F → final drop
- [ ] Escape → emergency stop

## 9. Edge Cases

- [ ] Refresh player page → reconnects with same name
- [ ] Close and reopen player → can rejoin
- [ ] Disconnect Wi-Fi on phone → shows CONNECTION LOST
- [ ] Reconnect Wi-Fi → auto-reconnects
- [ ] FULL RESET → clears all state

## 10. Visual Quality

- [ ] Projector looks cinematic (not like a dashboard)
- [ ] Near-black background with glowing cores
- [ ] Beams travel from cores to centre logo
- [ ] NMIMS logo is visible and not distorted
- [ ] Captions appear and disappear smoothly
- [ ] Player phone screen is simple with one big button
- [ ] Conductor is functional and readable

## Quick Test Run

1. `npm install && npm start`
2. Open `/conductor` in Chrome tab 1
3. Open `/projector` in Chrome tab 2 (F11 for fullscreen)
4. Click UNLOCK AUDIO on projector
5. Open `/join` in 2-3 incognito/phone tabs → join as different names
6. Click START on conductor
7. Advance to Scene 4
8. Tap on volunteer phone tabs → verify audio + visual reaction
9. Run DEMO mode → verify full automated sequence
10. Test EMERGENCY STOP
