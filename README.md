# Arena FPS

A small first-person arena shooter built with Three.js + cannon-es, with a real
main menu, weapons, a proper map, and optional LAN multiplayer with score/leaderboard.

## Features
- **Main menu** — name entry, Solo Practice or Join LAN Game
- **Weapons** — Pistol (semi-auto), Rifle (full-auto), Knife (melee), each with
  real raycasting, damage, fire rate, magazine size and reload
- **Map** — bounded arena with perimeter walls, cover crates, and raised platforms
- **Players** — Counter-Strike-style operator models (masked T vs helmeted, armoured CT) with name tags and floating health bars
- **Weapons** — detailed procedural models of the Desert Eagle, AK-47, MP5, M3 shotgun, AWP and M249 (original geometry, CS-style silhouettes)
- **Physics** — cannon-es rigid body movement, ground-check via raycast (works on
  platforms/ramps, not just flat ground), jumping, sprinting
- **Camera** — smooth first-person camera with a weapon view model, muzzle flash
  and bullet tracers
- **Score & leaderboard** — kills/deaths tracked server-side in LAN mode
  (Tab to view), local kill counter for solo target practice
- **LAN multiplayer** — a small Node/WebSocket server relays positions and
  validates hits so everyone's score stays in sync

## Setup

```bash
npm install
```

## Play solo (no server needed)

```bash
npm run dev
```

Open the printed URL, pick **Solo Practice**, and fight the target dummies scattered
around the map.

## Play over LAN

1. On **one** machine, start the game server:
   ```bash
   npm run server
   ```
   It prints a LAN address like `ws://192.168.1.10:3000` — share that with the
   other players.

2. On the **same** machine, also start the web client so it's reachable on the LAN:
   ```bash
   npm run dev -- --host
   ```
   This prints a URL like `http://192.168.1.10:5173`.

3. Every player (including the host) opens that `http://192.168.1.10:5173` URL in
   a browser, enters a name, picks **Join LAN Game**, and enters the
   `ws://192.168.1.10:3000` server address, then clicks **Play**.

Positions, shots, hits, deaths/respawns, and the kill/death leaderboard are all
relayed through `server.js`.

## Controls
- `WASD` move, `Shift` sprint, `Space` jump, mouse to look
- `Left click` fire (hold for the rifle)
- `1 / 2 / 3` switch Pistol / Rifle / Knife
- `R` reload
- `Tab` show leaderboard
- `Esc` pause menu

## Notes
- Hit detection is client-authoritative (the shooter's client raycasts and
  reports hits); the server validates the target is alive and applies damage/
  kills. This keeps things simple and works well for casual LAN play, but isn't
  cheat-proof — fine for a friends-and-family arena shooter, not for competitive
  play over the open internet.
- `npm run build` / `npm run preview` produce a production build if you want to
  host the client somewhere other than the Vite dev server.
