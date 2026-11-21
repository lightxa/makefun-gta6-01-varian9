// Cinder Quay: every tuning number, colour and story beat in one place.
// A sun-soaked harbour city at dawn, 2600 by 1900 world units. The renderer scales
// a camera window of it to the screen, so no rule below depends on screen size.
export const WORLD = { width: 2600, height: 1900 };

// Road centre lines. Roads run the full city; blocks between them hold buildings.
export const ROADS_V = [260, 700, 1140, 1580, 2020];
export const ROADS_H = [260, 640, 1020, 1400, 1700];
export const ROAD_W = 96;

export const STEP = 1 / 60;

// Dawn runs 05:30 to 07:00 across ten minutes of play, then holds at full morning.
export const CLOCK = { startMinutes: 330, endMinutes: 420, spanSeconds: 600 };

export const PLAYER = {
  walkSpeed: 175,
  runSpeed: 265,
  radius: 13,
  maxHealth: 100,
  punchRange: 46,
  punchDamage: 26,
  punchCooldown: 0.42,
  regenDelay: 5,
  regenRate: 3,
};

export const CAR = {
  accel: 420,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 430,
  maxReverse: 160,
  steer: 2.6,
  grip: 0.92,
  handbrakeGrip: 0.55,
  length: 46,
  width: 24,
};

export const TRAFFIC = { count: 14, speed: 130, stopGap: 58 };
export const PEDS = { count: 18, speed: 55, fleeSpeed: 150 };

export const WANTED = {
  max: 5,
  steal: 1,
  hitPed: 2,
  policeTouch: 1,
  decaySeconds: 9,
  bustSeconds: 1.6,
};

// Four turf zones. Standing inside a rival zone claims it; owned zones pay rent.
export const ZONES = [
  { id: 'quay', name: 'Quay West', x: 120, y: 1480, w: 420, h: 300, owner: 'player' },
  { id: 'rust', name: 'Rust Wharf', x: 1660, y: 120, w: 460, h: 340, owner: 'rival' },
  { id: 'market', name: 'Market Row', x: 820, y: 760, w: 420, h: 220, owner: 'neutral' },
  { id: 'oldtown', name: 'Old Town', x: 1660, y: 1120, w: 460, h: 380, owner: 'neutral' },
];
export const TURF = { captureSeconds: 12, rentSeconds: 30, rentPay: 25 };

// Five story missions, in order. pickup/drop are named city places.
export const MISSIONS = [
  {
    name: 'First Light Run',
    story: 'Mara needs a sealed crate at the container yard before the harbour wakes. Take it to Harbormaster Ilya at the pier.',
    pickup: { x: 330, y: 1700, label: 'Container Yard' },
    drop: { x: 2200, y: 260, label: 'Harbormaster Pier' },
    time: 95, pay: 120, wanted: 0,
  },
  {
    name: 'Hot Tail',
    story: 'A market parcel for the Rail Office, and the harbour patrol is already on your bumper. Lose them by arriving, not by stopping.',
    pickup: { x: 1000, y: 640, label: 'Market Row' },
    drop: { x: 1760, y: 260, label: 'Rail Office' },
    time: 110, pay: 180, wanted: 2,
  },
  {
    name: 'Yard Ghost',
    story: 'Lift the crate from the container yard while the yard crew looks away, then vanish before the patrol boxes you in.',
    pickup: { x: 330, y: 1700, label: 'Container Yard' },
    drop: { x: 2020, y: 560, label: 'Signal House' },
    time: 100, pay: 220, wanted: 3,
  },
  {
    name: 'Rust Wharf',
    story: 'The rival crew holds Rust Wharf. Stand your ground in their yard until the turf is yours, and deal with anyone who objects.',
    pickup: { x: 1750, y: 200, label: 'Rust Wharf' },
    drop: { x: 1750, y: 200, label: 'Rust Wharf' },
    time: 150, pay: 250, wanted: 2, turf: 'rust',
  },
  {
    name: 'The Big Dawn',
    story: 'One last run, the whole city, the whole harbour watching. A heavy crate from the pier to the Rail Office, wanted high, no mistakes.',
    pickup: { x: 2200, y: 260, label: 'Harbormaster Pier' },
    drop: { x: 1760, y: 260, label: 'Rail Office' },
    time: 150, pay: 500, wanted: 4,
  },
];

export const PALETTE = {
  skyTop: '#ffd9a0',
  skyBottom: '#ff9e6b',
  ground: '#c9a06b',
  grass: '#8fae6d',
  road: '#4a4550',
  roadEdge: '#35313c',
  marking: '#f5d76e',
  sidewalk: '#b9a98c',
  water: '#3f7f9e',
  buildingRoof: '#7d6a58',
  buildingWall: '#a98f74',
  player: '#2fa8e0',
  playerCar: '#e0483e',
  police: '#2b4fd8',
  rival: '#c23b5e',
  ped: '#e8dcc8',
  text: '#fff6e8',
  muted: '#e8cfa8',
  panel: 'rgba(24, 18, 28, 0.78)',
  gold: '#f2c94c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (money, turf, missions open) is kept between visits. */
export const SAVE_KEY = 'cinder-quay.save.v1';

export const COLORS_CARS = ['#e0483e', '#3e7fe0', '#e0a13e', '#4fae62', '#8a5fd0', '#d0d4d8', '#3a3f4a'];
