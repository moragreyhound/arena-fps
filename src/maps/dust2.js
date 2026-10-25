// Pure data map definition (no THREE imports here so the server can import it too).
// Dust II inspired layout: Long A, Mid + catwalk, B tunnels, A site, B site.

const SANDS = {
  ground: '#d3b280',
  lane:   '#c9a86a',
  sand1:  '#b99a66',
  sand2:  '#a98d5c',
  wall:   '#8a6d3f',
  dark:   '#5d4a2e',
  wood:   '#8a5a2b',
  metal:  '#6e7175',
  crate:  '#7a5230',
  stone:  '#9c8a6a',
  accent: '#d8b981',
}

function box(w, h, d, x, y, z, color, opts = {}) {
  return {
    type: 'box', w, h, d, x, y, z,
    color: color || SANDS.sand1,
    yaw: opts.yaw || 0,
    collide: opts.collide !== false,
    shadow: opts.shadow !== false,
    receive: opts.receive !== false,
  }
}

function cyl(r, h, x, y, z, color, opts = {}) {
  return {
    type: 'cylinder', r, h, x, y, z,
    color: color || SANDS.metal,
    collide: opts.collide !== false,
    shadow: opts.shadow !== false,
    receive: opts.receive !== false,
  }
}

export const dust2 = {
  id: 'dust2',
  name: 'Dust II',
  author: 'built-in',
  sky: '#b7cbe8',
  fog: { near: 80, far: 260, color: '#b7cbe8' },
  light: {
    ambient: 0xffffff, ambientIntensity: 0.72,
    sun: { color: 0xffe7b8, intensity: 1.15, x: 70, y: 110, z: 40 },
  },
  ground: { w: 150, d: 130, color: SANDS.ground },
  grid: true,

  geometry: [
    // ---- Perimeter walls ----
    box(150, 16, 2, 0, 8, 64, SANDS.sand1),
    box(150, 16, 2, 0, 8, -64, SANDS.sand1),
    box(2, 16, 128, -74, 8, 0, SANDS.sand2),
    box(2, 16, 128, 74, 8, 0, SANDS.sand2),

    // ---- Long A (southern lane from T side to A site) ----
    box(6, 0.4, 12, -58, 0.2, -55, SANDS.lane, { collide: false, shadow: false }),
    box(48, 0.4, 12, -35, 0.2, -55, SANDS.lane, { collide: false, shadow: false }),
    box(40, 0.4, 12, 5, 0.2, -55, SANDS.lane, { collide: false, shadow: false }),
    // long north wall (blocks mid, opens near A)
    box(80, 7, 3, -3, 3.5, -45, SANDS.wall),
    box(18, 7, 3, 62, 3.5, -45, SANDS.wall),
    // long cover crates
    box(3.5, 2, 3.5, -18, 1, -52, SANDS.crate),
    box(3, 1.6, 3, 5, 0.8, -56, SANDS.wood),
    box(3.5, 2, 3.5, 28, 1, -51, SANDS.crate),
    box(2.6, 1.4, 2.6, 33, 0.7, -57, SANDS.wood),
    // doorway block near A
    box(3, 2, 2.5, 46, 1, -46, SANDS.crate),

    // ---- A site (east) ----
    box(16, 1, 18, 60, 0.5, -22, SANDS.accent),        // elevated platform
    box(2, 1, 8, 52, 0.5, -22, SANDS.stone),           // steps (low)
    box(2, 1.6, 8, 53, 0.8, -22, SANDS.stone),
    box(5, 2.2, 3.4, 55, 1.1, -38, SANDS.metal),       // "car" crate
    box(3.2, 2.4, 3.2, 42, 1.2, -30, SANDS.crate),
    box(3.2, 2.4, 3.2, 45, 1.2, -34, SANDS.wood),
    box(3, 1.4, 3, 40, 0.7, -36, SANDS.crate),         // double stack base
    box(2.6, 1.2, 2.6, 40, 2, -36, SANDS.wood),        //   ... top
    // palace corner room (east wall/south wall)
    box(1.4, 10, 16, 66, 5, -32, SANDS.wall),
    box(8, 10, 1.4, 70, 5, -25, SANDS.wall),
    box(5, 1.2, 6, 70, 0.6, -34, SANDS.stone, { collide: false }),

    // ---- Mid (central street) ----
    box(3, 1.4, 3, -6, 0.7, -3, SANDS.crate),
    box(2.6, 1.2, 2.6, -6, 2, -5, SANDS.wood),
    box(3.2, 2, 3.2, -22, 1, 2, SANDS.crate),
    // catwalk platform + rails + steps
    box(44, 1, 4, -4, 3, 14, SANDS.wall),
    box(44, 0.7, 0.5, -4, 3.9, 12.3, SANDS.metal),
    box(44, 0.7, 0.5, -4, 3.9, 15.7, SANDS.metal),
    box(2, 1, 4, -28, 0.5, 14, SANDS.stone),
    box(2, 1, 4, -26.5, 1.5, 14, SANDS.stone),
    box(2, 1, 4, -25, 2.5, 14, SANDS.stone),
    box(2, 1, 4, 18, 0.5, 14, SANDS.stone),
    box(2, 1, 4, 19.5, 1.5, 14, SANDS.stone),
    box(2, 1, 4, 21, 2.5, 14, SANDS.stone),
    // catwalk pillars
    cyl(0.5, 6, -20, 3, 14, SANDS.stone),
    cyl(0.5, 6, 12, 3, 14, SANDS.stone),
    // north wall of mid separating B tunnels (with two door gaps)
    box(30, 9, 3, -27, 4.5, 26, SANDS.wall),
    box(12, 9, 3, 9, 4.5, 26, SANDS.wall),

    // ---- B tunnels (north-west) ----
    box(46, 6, 3, -22, 3, 33, SANDS.wall),             // upper tunnel north wall
    box(3.2, 2, 3.2, -30, 1, 29, SANDS.crate),
    box(3, 1.6, 3, -16, 0.8, 31, SANDS.wood),
    box(30, 8, 3, -20, 4, 38, SANDS.wall),             // lower tunnel south wall
    box(20, 8, 3, -25, 4, 46, SANDS.wall),             // lower tunnel north wall
    box(3, 2.2, 3, -24, 1.1, 42, SANDS.crate),
    box(2.8, 1.5, 2.8, -12, 0.75, 43, SANDS.wood),

    // ---- B site (north) ----
    box(2.6, 1.2, 2.6, -20, 2, 56, SANDS.wood),         // double stack top
    box(3, 1.5, 3, -20, 0.75, 56, SANDS.crate),
    box(3.2, 2.2, 3.2, -35, 1.1, 54, SANDS.crate),
    box(3, 1.6, 3, -10, 0.8, 52, SANDS.wood),
    box(3, 1.8, 3, -28, 0.9, 60, SANDS.crate),
    box(5, 1, 6, 0, 0.5, 55, SANDS.stone),              // step into site from tunnel
    box(3.4, 2.4, 3.4, -45, 1.2, 57, SANDS.wood),

    // ---- CT spawn (east) ----
    box(3.2, 2, 3.2, 64, 1, 5, SANDS.crate),
    box(3, 1.6, 3, 58, 0.8, 12, SANDS.wood),
    box(2.8, 2, 2.8, 68, 1, 18, SANDS.crate),

    // ---- T spawn (south-west) crates ----
    box(3.4, 2.2, 3.4, -55, 1.1, -20, SANDS.wood),
    box(3, 1.6, 3, -48, 0.8, -35, SANDS.crate),
    box(3.4, 2, 3.4, -63, 1, -25, SANDS.crate),
    box(3, 1.4, 3, -40, 0.7, -55, SANDS.wood),
    box(5, 1.2, 5, -70, 0.6, -40, SANDS.crate),
  ],

  spawns: [
    { x: -60, y: 2, z: -30 }, { x: -50, y: 2, z: -45 }, { x: -66, y: 2, z: -50 },
    { x: -15, y: 2, z: -52 }, { x: 20, y: 2, z: -55 },  { x: 40, y: 2, z: -52 },
    { x: 45, y: 2, z: -32 },  { x: 60, y: 2, z: -25 },  { x: 50, y: 2, z: 0 },
    { x: 62, y: 2, z: -10 },  { x: 66, y: 2, z: 5 },    { x: 58, y: 2, z: 18 },
    { x: -15, y: 2, z: -5 },  { x: 10, y: 2, z: -8 },   { x: 0, y: 2, z: 8 },
    { x: -25, y: 2, z: 28 },  { x: -5, y: 2, z: 30 },   { x: -20, y: 2, z: 45 },
    { x: -30, y: 2, z: 55 },  { x: -15, y: 2, z: 52 },  { x: -45, y: 2, z: 58 },
  ],

  teams: {
    T:  [{ x: -60, y: 2, z: -30 }, { x: -50, y: 2, z: -45 }, { x: -66, y: 2, z: -50 }, { x: -15, y: 2, z: -52 }],
    CT: [{ x: 60, y: 2, z: -25 },  { x: 62, y: 2, z: -10 },  { x: 66, y: 2, z: 5 },   { x: 45, y: 2, z: -32 }],
  },
}