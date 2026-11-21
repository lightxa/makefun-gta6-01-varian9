// Cinder Quay's rules and state, with no drawing and no browser in it: the city
// layout, the player on foot and in a car, traffic, pedestrians, police, the five
// story missions, dispatch jobs, turf, combat and the wanted level. step() advances
// one fixed step and returns what happened as bit flags, so the caller can react
// (sound, announcements) without the world knowing about screens or sound.
import {
  CAR, CLOCK, COLORS_CARS, MISSIONS, PEDS, PLAYER, ROADS_H, ROADS_V, ROAD_W,
  TRAFFIC, TURF, WANTED, WORLD, ZONES,
} from './config.js';
import { createRandom, randomInt, randomPick } from './random.js';

export const EVENT_PICKUP = 1;
export const EVENT_CASH = 2;
export const EVENT_PUNCH = 4;
export const EVENT_HURT = 8;
export const EVENT_CAPTURE = 16;
export const EVENT_FAIL = 32;
export const EVENT_MISSION_DONE = 64;
export const EVENT_OVER = 128;
export const EVENT_WANTED_UP = 256;
export const EVENT_BUSTED = 512;

const SPAWN = { x: 780, y: 1080 };
const NAMED = [
  { name: 'Rail Office', x: 1700, y: 380, w: 170, h: 110 },
  { name: 'Signal House', x: 2120, y: 400, w: 130, h: 90 },
  { name: 'Harbormaster', x: 2240, y: 360, w: 120, h: 80 },
  { name: 'Market Hall', x: 820, y: 780, w: 200, h: 120 },
  { name: 'Warehouse 7', x: 800, y: 1480, w: 200, h: 140 },
  { name: 'Sunrise Diner', x: 800, y: 400, w: 140, h: 90 },
  { name: 'Quay Hotel', x: 1700, y: 800, w: 170, h: 120 },
  { name: 'Old Town Flats', x: 1700, y: 1180, w: 220, h: 140 },
  { name: 'Fish Market', x: 1240, y: 1120, w: 160, h: 100 },
  { name: 'Depot Garage', x: 1240, y: 1480, w: 180, h: 110 },
];
const FILLER_NAMES = ['Flats', 'Shops', 'Offices', 'Stores', 'Lofts', 'Cafe Row', 'Depot', 'Flats'];
const CONTAINER_COLORS = ['#c25e3a', '#3a7fc2', '#4fae62', '#c2a13a', '#8a5fd0'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Build the fixed city: named buildings plus one or two filler buildings per block. */
function buildCity() {
  const buildings = NAMED.map((b) => ({ ...b, color: '#a98f74', roof: '#7d6a58' }));
  const layout = createRandom(20261121);
  let nameIndex = 0;
  for (let vi = 0; vi < ROADS_V.length - 1; vi += 1) {
    for (let hi = 0; hi < ROADS_H.length - 1; hi += 1) {
      const x0 = ROADS_V[vi] + ROAD_W / 2 + 16;
      const x1 = ROADS_V[vi + 1] - ROAD_W / 2 - 16;
      const y0 = ROADS_H[hi] + ROAD_W / 2 + 16;
      const y1 = ROADS_H[hi + 1] - ROAD_W / 2 - 16;
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw < 150 || bh < 110) continue;
      const count = bw > 300 && bh > 220 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const w = 110 + layout() * 90;
        const h = 80 + layout() * 70;
        let x = x0 + (count === 1 ? (bw - w) / 2 : i * (bw / 2) + (bw / 2 - w) / 2);
        let y = y0 + (bh - h) / 2 + (layout() - 0.5) * 30;
        // Keep the whole building inside its block, clear of the roads.
        x = Math.max(x0, Math.min(x1 - w, x));
        y = Math.max(y0, Math.min(y1 - h, y));
        const name = FILLER_NAMES[nameIndex % FILLER_NAMES.length];
        nameIndex += 1;
        if (buildings.some((b) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y)) continue;
        buildings.push({ name, x, y, w, h, color: '#b39a7d', roof: '#8a7460' });
      }
    }
  }
  // Shipping containers stacked in the container yard (south-west block, clear
  // of both roads that border the yard).
  const containers = [];
  const crand = createRandom(77);
  for (let i = 0; i < 12; i += 1) {
    containers.push({
      x: 332 + (i % 4) * 74,
      y: 1464 + Math.floor(i / 4) * 66,
      w: 66, h: 52,
      color: CONTAINER_COLORS[Math.floor(crand() * CONTAINER_COLORS.length)],
    });
  }
  return { buildings, containers };
}

function circleHitsRect(x, y, radius, rect) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  return dist(x, y, cx, cy) < radius;
}

function resolveCircleRect(body, radius, rect) {
  if (!circleHitsRect(body.x, body.y, radius, rect)) return;
  const cx = clamp(body.x, rect.x, rect.x + rect.w);
  const cy = clamp(body.y, rect.y, rect.y + rect.h);
  let dx = body.x - cx;
  let dy = body.y - cy;
  let d = Math.hypot(dx, dy);
  if (d === 0) { dx = 0; dy = -1; d = 1; }
  const push = radius - d;
  body.x += (dx / d) * push;
  body.y += (dy / d) * push;
}

export function createWorld(random) {
  const city = buildCity();
  const state = {
    time: 0,
    money: 40,
    health: PLAYER.maxHealth,
    wanted: 0,
    wantedTimer: 0,
    hiddenTimer: 0,
    bustTimer: 0,
    missionIndex: 0,
    mission: null,
    dispatch: null,
    zones: ZONES.map((z) => ({ ...z })),
    capture: null,
    player: {
      x: SPAWN.x, y: SPAWN.y, angle: -Math.PI / 2, speed: 0,
      onFoot: true, car: null, punchTimer: 0, hurtTimer: 0, regenTimer: 0,
    },
    cars: [],
    peds: [],
    police: [],
    rivals: [],
    particles: [],
    skids: [],
    message: '',
    messageTimer: 0,
    reclaimTimers: {},
    rentTimer: TURF.rentSeconds,
    gameOver: false,
  };

  function showMessage(text, seconds) {
    state.message = text;
    state.messageTimer = seconds || 4;
  }

  function spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const s = (0.3 + random() * 0.7) * (speed || 160);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + random() * 0.4, max: 1, color, size: 3 + random() * 4 });
    }
    if (state.particles.length > 220) state.particles.splice(0, state.particles.length - 220);
  }

  function nearestRoadX(x) {
    return ROADS_V.reduce((best, v) => (Math.abs(v - x) < Math.abs(best - x) ? v : best), ROADS_V[0]);
  }
  function nearestRoadY(y) {
    return ROADS_H.reduce((best, h) => (Math.abs(h - y) < Math.abs(best - h) ? h : best), ROADS_H[0]);
  }
  function onRoad(x, y) {
    return ROADS_V.some((v) => Math.abs(x - v) < ROAD_W / 2) || ROADS_H.some((h) => Math.abs(y - h) < ROAD_W / 2);
  }

  function makeCar(x, y, angle, color, opts) {
    return {
      x, y, angle, speed: 0, color,
      parked: !!(opts && opts.parked),
      traffic: !!(opts && opts.traffic),
      police: !!(opts && opts.police),
      axis: (opts && opts.axis) || 'v',
      dir: (opts && opts.dir) || 1,
      lane: (opts && opts.lane) || 0,
      stopTimer: 0,
      id: Math.floor(random() * 1000000),
    };
  }

  function spawnTraffic() {
    state.cars = [];
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const vertical = random() < 0.5;
      const road = vertical ? randomPick(random, ROADS_V) : randomPick(random, ROADS_H);
      const along = 120 + random() * (vertical ? WORLD.height - 240 : WORLD.width - 240);
      const lane = (random() < 0.5 ? -1 : 1) * 22;
      const car = makeCar(
        vertical ? road + lane : along,
        vertical ? along : road + lane,
        vertical ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI),
        randomPick(random, COLORS_CARS),
        { traffic: true, axis: vertical ? 'v' : 'h', dir: 1, lane },
      );
      car.speed = TRAFFIC.speed * (0.8 + random() * 0.4);
      state.cars.push(car);
    }
    // Parked cars near the spawn and around the city, free to steal.
    const parkedSpots = [
      [860, 1010, 0], [860, 1060, 0], [700, 1180, Math.PI / 2],
      [1240, 700, 0], [1640, 1080, Math.PI], [420, 700, 0],
      [2080, 700, Math.PI / 2], [760, 1480, 0], [1640, 1480, 0],
    ];
    for (const [x, y, angle] of parkedSpots) {
      state.cars.push(makeCar(x, y, angle, randomPick(random, COLORS_CARS), { parked: true }));
    }
  }

  function spawnPeds() {
    state.peds = [];
    for (let i = 0; i < PEDS.count; i += 1) {
      const road = randomPick(random, ROADS_V);
      const x = road + (random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 14);
      const y = 120 + random() * (WORLD.height - 240);
      state.peds.push({ x, y, angle: 0, speed: PEDS.speed, tx: x, ty: y, flee: 0, color: randomPick(random, ['#e8dcc8', '#d8a0a0', '#a0c8d8', '#c8d8a0']) });
    }
  }

  function reset() {
    state.time = 0;
    state.money = 40;
    state.health = PLAYER.maxHealth;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.hiddenTimer = 0;
    state.bustTimer = 0;
    state.missionIndex = 0;
    state.mission = null;
    state.dispatch = null;
    state.zones = ZONES.map((z) => ({ ...z }));
    state.capture = null;
    state.player.x = SPAWN.x;
    state.player.y = SPAWN.y;
    state.player.angle = -Math.PI / 2;
    state.player.speed = 0;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.punchTimer = 0;
    state.player.hurtTimer = 0;
    state.player.regenTimer = 0;
    state.police = [];
    state.rivals = [];
    state.particles = [];
    state.skids = [];
    state.reclaimTimers = {};
    state.rentTimer = TURF.rentSeconds;
    state.gameOver = false;
    spawnTraffic();
    spawnPeds();
    showMessage('Cinder Quay, 05:30. Mara is waiting on your first run. Press Enter to take Mission 1.', 6);
  }

  function addWanted(amount) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + amount, 0, WANTED.max);
    state.hiddenTimer = 0;
    return state.wanted > before;
  }

  function startMission(index) {
    const def = MISSIONS[index];
    if (!def) return false;
    state.mission = {
      def, index, phase: def.turf ? 'turf' : 'pickup',
      timer: def.time, pay: def.pay, carrying: false, progress: 0,
    };
    if (def.wanted > state.wanted) state.wanted = def.wanted;
    if (def.turf) {
      spawnRivals(def.pickup.x, def.pickup.y, 3);
      showMessage(`${def.name}: hold ${def.pickup.label} until it is yours.`, 5);
    } else {
      showMessage(`${def.name}: pick up at ${def.pickup.label}.`, 5);
    }
    return true;
  }

  function spawnRivals(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      state.rivals.push({ x: x + (random() - 0.5) * 160, y: y + (random() - 0.5) * 160, hp: 50, angle: 0, attackTimer: 0, speed: 95 });
    }
  }

  function completeMission() {
    const mission = state.mission;
    if (!mission) return EVENT_CASH;
    state.money += mission.pay;
    state.missionIndex = Math.min(MISSIONS.length, mission.index + 1);
    state.mission = null;
    spawnParticles(state.player.x, state.player.y, '#f2c94c', 26, 220);
    showMessage(`Job done. +$${mission.pay}. ${state.missionIndex >= MISSIONS.length ? 'Every story mission is complete. Free roam, courier.' : 'Next mission is ready: press Enter.'}`, 6);
    return EVENT_CASH | EVENT_MISSION_DONE;
  }

  function failMission(reason) {
    state.mission = null;
    state.rivals = [];
    showMessage(reason, 5);
    return EVENT_FAIL;
  }

  function createDispatch() {
    const spots = [
      { x: 1000, y: 640, label: 'Market Row' }, { x: 1760, y: 260, label: 'Rail Office' },
      { x: 330, y: 1700, label: 'Container Yard' }, { x: 2200, y: 260, label: 'Harbormaster Pier' },
      { x: 700, y: 1560, label: 'Depot Garage' }, { x: 2020, y: 1300, label: 'Old Town Flats' },
      { x: 1240, y: 1020, label: 'Fish Market' }, { x: 2020, y: 560, label: 'Signal House' },
    ];
    const a = randomPick(random, spots);
    let b = randomPick(random, spots);
    while (b === a) b = randomPick(random, spots);
    const pay = Math.max(30, Math.round(dist(a.x, a.y, b.x, b.y) / 9));
    state.dispatch = { pickup: a, drop: b, pay, timer: 120, phase: 'pickup' };
    showMessage(`Dispatch: collect at ${a.label}, deliver to ${b.label} for $${pay}.`, 5);
  }

  function enterNearestCar() {
    const p = state.player;
    let best = null;
    let bestDist = 78;
    for (const car of state.cars) {
      if (car.police) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestDist) { best = car; bestDist = d; }
    }
    if (!best) return 0;
    let events = 0;
    if (best.traffic) {
      const witness = state.peds.some((ped) => dist(ped.x, ped.y, p.x, p.y) < 230);
      if (witness && addWanted(WANTED.steal)) events |= EVENT_WANTED_UP;
      best.traffic = false;
    }
    best.parked = false;
    p.car = best;
    p.onFoot = false;
    p.angle = best.angle;
    p.speed = 0;
    showMessage('In the car. W A S D to drive, Space is the handbrake, E to step out.', 3);
    return events;
  }

  function exitCar() {
    const p = state.player;
    if (!p.car) return;
    const car = p.car;
    car.speed = 0;
    car.parked = true;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    p.onFoot = true;
    p.car = null;
    p.speed = 0;
  }

  function punch() {
    const p = state.player;
    if (p.punchTimer > 0) return 0;
    p.punchTimer = PLAYER.punchCooldown;
    let events = EVENT_PUNCH;
    const fx = p.x + Math.cos(p.angle) * 30;
    const fy = p.y + Math.sin(p.angle) * 30;
    for (const rival of state.rivals) {
      if (dist(fx, fy, rival.x, rival.y) < PLAYER.punchRange) {
        rival.hp -= PLAYER.punchDamage;
        spawnParticles(rival.x, rival.y, '#ff6b5e', 8, 140);
        if (rival.hp <= 0) {
          state.money += 10;
          spawnParticles(rival.x, rival.y, '#f2c94c', 16, 200);
          showMessage('Rival down. +$10 taken off him.', 2);
        }
      }
    }
    state.rivals = state.rivals.filter((r) => r.hp > 0);
    return events;
  }

  function hurtPlayer(amount) {
    const p = state.player;
    if (p.hurtTimer > 0) return 0;
    p.hurtTimer = 0.7;
    p.regenTimer = 0;
    state.health = Math.max(0, state.health - amount);
    spawnParticles(p.x, p.y, '#ff6b5e', 10, 150);
    if (state.health <= 0) {
      state.gameOver = true;
      return EVENT_HURT | EVENT_OVER;
    }
    return EVENT_HURT;
  }

  function updatePlayer(dt, input, actions) {
    const p = state.player;
    p.punchTimer = Math.max(0, p.punchTimer - dt);
    p.hurtTimer = Math.max(0, p.hurtTimer - dt);
    p.regenTimer += dt;
    if (p.regenTimer > PLAYER.regenDelay && state.health > 0 && state.health < PLAYER.maxHealth) {
      state.health = Math.min(PLAYER.maxHealth, state.health + PLAYER.regenRate * dt);
    }
    let events = 0;
    if (actions.has('enterCar')) {
      if (p.onFoot) events |= enterNearestCar();
      else exitCar();
    }
    if (actions.has('punch') && p.onFoot) events |= punch();
    if (actions.has('dispatch') && !state.dispatch && !state.mission) createDispatch();

    const up = input.isDown('KeyW', 'ArrowUp');
    const down = input.isDown('KeyS', 'ArrowDown');
    const left = input.isDown('KeyA', 'ArrowLeft');
    const right = input.isDown('KeyD', 'ArrowRight');
    const run = input.isDown('ShiftLeft', 'ShiftRight');

    if (p.onFoot) {
      let mx = (right ? 1 : 0) - (left ? 1 : 0);
      let my = (down ? 1 : 0) - (up ? 1 : 0);
      if (mx !== 0 || my !== 0) {
        const len = Math.hypot(mx, my);
        const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
        p.x += (mx / len) * speed * dt;
        p.y += (my / len) * speed * dt;
        p.angle = Math.atan2(my, mx);
        p.speed = speed;
      } else {
        p.speed = 0;
      }
      p.x = clamp(p.x, 20, WORLD.width - 20);
      p.y = clamp(p.y, 20, WORLD.height - 20);
      for (const b of city.buildings) resolveCircleRect(p, PLAYER.radius, b);
      for (const c of city.containers) resolveCircleRect(p, PLAYER.radius, c);
    } else if (p.car) {
      const car = p.car;
      const handbrake = input.isDown('Space');
      const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
      if (up) car.speed += CAR.accel * dt;
      if (down) car.speed -= (car.speed > 0 ? CAR.brake : CAR.reverseAccel) * dt;
      if (!up && !down) car.speed *= Math.pow(0.4, dt);
      car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
      // Steering stays effective at low speed (a 0.35 floor on the factor), so
      // a car can turn around from a standstill instead of wedging on a wall.
      const speedFactor = 0.35 + 0.65 * Math.min(1, Math.abs(car.speed) / CAR.maxSpeed);
      car.angle += steerInput * CAR.steer * speedFactor * dt * (car.speed >= 0 ? 1 : -1) * (handbrake ? 1.5 : 1);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (handbrake && Math.abs(car.speed) > 140) {
        state.skids.push({ x: car.x, y: car.y, angle: car.angle, life: 3 });
        if (state.skids.length > 160) state.skids.shift();
      }
      car.x = clamp(car.x, 20, WORLD.width - 20);
      car.y = clamp(car.y, 20, WORLD.height - 20);
      let hitBuilding = false;
      for (const b of city.buildings) {
        if (circleHitsRect(car.x, car.y, 22, b)) {
          resolveCircleRect(car, 22, b);
          hitBuilding = true;
        }
      }
      for (const c of city.containers) {
        if (circleHitsRect(car.x, car.y, 22, c)) { resolveCircleRect(car, 22, c); hitBuilding = true; }
      }
      if (hitBuilding) car.speed *= 0.4;
      for (const other of state.cars) {
        if (other === car || other.police) continue;
        const d = dist(car.x, car.y, other.x, other.y);
        if (d < 46 && d > 0.01) {
          const push = (46 - d) / 2;
          const nx = (other.x - car.x) / d;
          const ny = (other.y - car.y) / d;
          other.x += nx * push;
          other.y += ny * push;
          car.speed *= 0.85;
        }
      }
      for (const ped of state.peds) {
        const d = dist(car.x, car.y, ped.x, ped.y);
        if (d < 34 && Math.abs(car.speed) > 60) {
          ped.flee = 2;
          if (addWanted(WANTED.hitPed)) events |= EVENT_WANTED_UP;
          spawnParticles(ped.x, ped.y, '#ff6b5e', 12, 180);
          ped.x += (ped.x - car.x) / (d || 1) * 40;
          ped.y += (ped.y - car.y) / (d || 1) * 40;
          car.speed *= 0.7;
        } else if (d < 40) {
          ped.flee = 1.5;
        }
      }
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      p.speed = car.speed;
    }
    return events;
  }

  function updateTraffic(dt) {
    for (const car of state.cars) {
      if (!car.traffic) continue;
      let blocked = false;
      for (const other of state.cars) {
        if (other === car) continue;
        if (car.axis === 'v' && other.axis === 'v' && Math.abs(other.x - car.x) < 34) {
          const ahead = car.angle === Math.PI / 2 ? other.y > car.y : other.y < car.y;
          if (ahead && Math.abs(other.y - car.y) < TRAFFIC.stopGap) blocked = true;
        }
        if (car.axis === 'h' && other.axis === 'h' && Math.abs(other.y - car.y) < 34) {
          const ahead = car.angle === 0 ? other.x > car.x : other.x < car.x;
          if (ahead && Math.abs(other.x - car.x) < TRAFFIC.stopGap) blocked = true;
        }
      }
      if (car.stopTimer > 0) {
        car.stopTimer -= dt;
        car.speed = 0;
        continue;
      }
      if (blocked) car.speed = Math.max(0, car.speed - 300 * dt);
      else car.speed += (TRAFFIC.speed - car.speed) * Math.min(1, dt * 1.5);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const onV = ROADS_V.some((v) => Math.abs(car.x - v) < 6);
      const onH = ROADS_H.some((h) => Math.abs(car.y - h) < 6);
      if (car.axis === 'v' && onV && onH && random() < 0.004) {
        car.axis = 'h';
        car.angle = random() < 0.5 ? 0 : Math.PI;
        car.y = nearestRoadY(car.y);
      } else if (car.axis === 'h' && onH && onV && random() < 0.004) {
        car.axis = 'v';
        car.angle = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        car.x = nearestRoadX(car.x);
      }
      if (car.axis === 'v' && (car.y < 60 || car.y > WORLD.height - 60)) {
        car.angle += Math.PI;
        car.y = clamp(car.y, 60, WORLD.height - 60);
      }
      if (car.axis === 'h' && (car.x < 60 || car.x > WORLD.width - 60)) {
        car.angle += Math.PI;
        car.x = clamp(car.x, 60, WORLD.width - 60);
      }
    }
  }

  function updatePeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      ped.flee = Math.max(0, ped.flee - dt);
      let speed = PEDS.speed;
      let tx = ped.tx;
      let ty = ped.ty;
      const danger = !p.onFoot && Math.abs(p.speed) > 80 && dist(ped.x, ped.y, p.x, p.y) < 130;
      if (ped.flee > 0 || danger) {
        speed = PEDS.fleeSpeed;
        const away = angleTo(p.x, p.y, ped.x, ped.y);
        tx = ped.x + Math.cos(away) * 120;
        ty = ped.y + Math.sin(away) * 120;
      } else if (dist(ped.x, ped.y, tx, ty) < 12) {
        const road = randomPick(random, ROADS_V);
        ped.tx = road + (random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 14);
        ped.ty = 100 + random() * (WORLD.height - 200);
        tx = ped.tx; ty = ped.ty;
      }
      const a = angleTo(ped.x, ped.y, tx, ty);
      ped.angle = a;
      ped.x += Math.cos(a) * speed * dt;
      ped.y += Math.sin(a) * speed * dt;
      ped.x = clamp(ped.x, 20, WORLD.width - 20);
      ped.y = clamp(ped.y, 20, WORLD.height - 20);
      for (const b of city.buildings) resolveCircleRect(ped, 10, b);
    }
  }

  function updatePolice(dt) {
    const p = state.player;
    const want = state.wanted > 0 ? Math.min(state.wanted, 4) : 0;
    while (state.police.length < want) {
      const a = random() * Math.PI * 2;
      const x = clamp(p.x + Math.cos(a) * 420, 80, WORLD.width - 80);
      const y = clamp(p.y + Math.sin(a) * 420, 80, WORLD.height - 80);
      state.police.push(makeCar(x, y, 0, '#2b4fd8', { police: true, axis: 'v' }));
    }
    while (state.police.length > want) state.police.pop();
    let events = 0;
    for (const cop of state.police) {
      const targetAngle = angleTo(cop.x, cop.y, p.x, p.y);
      const diff = angleDiff(cop.angle, targetAngle);
      cop.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
      const targetSpeed = 360 + state.wanted * 22;
      cop.speed += (targetSpeed - cop.speed) * Math.min(1, dt * 1.2);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      cop.x = clamp(cop.x, 20, WORLD.width - 20);
      cop.y = clamp(cop.y, 20, WORLD.height - 20);
      for (const b of city.buildings) {
        if (circleHitsRect(cop.x, cop.y, 22, b)) { resolveCircleRect(cop, 22, b); cop.speed *= 0.6; }
      }
      const d = dist(cop.x, cop.y, p.x, p.y);
      if (d < 48) {
        if (p.onFoot) {
          state.bustTimer += dt;
          if (state.bustTimer > WANTED.bustSeconds) {
            state.bustTimer = 0;
            state.wanted = 0;
            state.money = Math.max(0, state.money - 50);
            p.x = SPAWN.x; p.y = SPAWN.y; p.onFoot = true; p.car = null;
            showMessage('Busted. The patrol took $50 and dropped you back at the market.', 5);
            events |= EVENT_BUSTED;
          }
          if (p.hurtTimer <= 0) events |= hurtPlayer(6);
        } else if (p.car) {
          p.car.speed *= 0.92;
          if (p.hurtTimer <= 0) events |= hurtPlayer(4);
          spawnParticles(cop.x, cop.y, '#ffd76e', 4, 120);
        }
      } else {
        state.bustTimer = Math.max(0, state.bustTimer - dt);
      }
    }
    if (state.wanted > 0) {
      const nearest = state.police.reduce((best, cop) => Math.min(best, dist(cop.x, cop.y, p.x, p.y)), Infinity);
      if (nearest > 520) {
        state.hiddenTimer += dt;
        if (state.hiddenTimer > WANTED.decaySeconds) {
          state.wanted -= 1;
          state.hiddenTimer = 0;
          showMessage(state.wanted === 0 ? 'Clean. The heat is off.' : `Heat dropping: ${state.wanted} star${state.wanted === 1 ? '' : 's'} left.`, 3);
        }
      } else {
        state.hiddenTimer = 0;
      }
    }
    return events;
  }

  function updateRivals(dt) {
    const p = state.player;
    let events = 0;
    for (const rival of state.rivals) {
      const d = dist(rival.x, rival.y, p.x, p.y);
      rival.attackTimer -= dt;
      if (d < 220) {
        const a = angleTo(rival.x, rival.y, p.x, p.y);
        rival.angle = a;
        rival.x += Math.cos(a) * rival.speed * dt;
        rival.y += Math.sin(a) * rival.speed * dt;
      }
      if (d < 42 && rival.attackTimer <= 0) {
        rival.attackTimer = 0.9;
        events |= hurtPlayer(9);
      }
      for (const b of city.buildings) resolveCircleRect(rival, 12, b);
    }
    return events;
  }

  function zoneAt(x, y) {
    return state.zones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) || null;
  }

  function updateMissions(dt) {
    const p = state.player;
    let events = 0;
    const mission = state.mission;
    if (mission) {
      mission.timer -= dt;
      if (mission.timer <= 0) {
        return failMission(`Too slow. ${mission.def.name} failed.`);
      }
      if (mission.phase === 'pickup') {
        if (dist(p.x, p.y, mission.def.pickup.x, mission.def.pickup.y) < 56) {
          mission.phase = 'drop';
          mission.carrying = true;
          spawnParticles(p.x, p.y, '#f2c94c', 18, 200);
          showMessage(`Package picked up. Deliver to ${mission.def.drop.label}.`, 4);
          events |= EVENT_PICKUP;
        }
      } else if (mission.phase === 'drop') {
        if (dist(p.x, p.y, mission.def.drop.x, mission.def.drop.y) < 56) {
          events |= completeMission();
        }
      } else if (mission.phase === 'turf') {
        const zone = state.zones.find((z) => z.id === mission.def.turf);
        const inside = zone && p.x >= zone.x && p.x <= zone.x + zone.w && p.y >= zone.y && p.y <= zone.y + zone.h;
        if (inside) {
          mission.progress = (mission.progress || 0) + dt / TURF.captureSeconds;
          if (mission.progress >= 1) {
            zone.owner = 'player';
            events |= EVENT_CAPTURE | completeMission();
          }
        }
      }
    }
    const dispatch = state.dispatch;
    if (dispatch) {
      dispatch.timer -= dt;
      if (dispatch.timer <= 0) {
        state.dispatch = null;
        showMessage('Dispatch job expired. The client found another courier.', 4);
        events |= EVENT_FAIL;
      } else if (dispatch.phase === 'pickup' && dist(p.x, p.y, dispatch.pickup.x, dispatch.pickup.y) < 56) {
        dispatch.phase = 'drop';
        spawnParticles(p.x, p.y, '#f2c94c', 14, 180);
        showMessage(`Parcel collected. Deliver to ${dispatch.drop.label} for $${dispatch.pay}.`, 4);
        events |= EVENT_PICKUP;
      } else if (dispatch.phase === 'drop' && dist(p.x, p.y, dispatch.drop.x, dispatch.drop.y) < 56) {
        state.money += dispatch.pay;
        state.dispatch = null;
        spawnParticles(p.x, p.y, '#f2c94c', 22, 200);
        showMessage(`Dispatch done. +$${dispatch.pay}.`, 4);
        events |= EVENT_CASH;
      }
    }
    return events;
  }

  function updateTurf(dt) {
    const p = state.player;
    let events = 0;
    if (!state.mission || state.mission.phase !== 'turf') {
      const zone = zoneAt(p.x, p.y);
      if (zone && zone.owner !== 'player') {
        if (!state.capture || state.capture.zoneId !== zone.id) state.capture = { zoneId: zone.id, progress: 0 };
        state.capture.progress += dt / TURF.captureSeconds;
        if (state.capture.progress >= 1) {
          zone.owner = 'player';
          state.capture = null;
          spawnParticles(p.x, p.y, '#4fae62', 24, 200);
          showMessage(`${zone.name} is yours now. Rent pays $${TURF.rentPay} every ${TURF.rentSeconds}s.`, 4);
          events |= EVENT_CAPTURE;
        }
      } else if (state.capture) {
        state.capture = null;
      }
    }
    for (const zone of state.zones) {
      if (zone.owner !== 'player') continue;
      const centre = { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
      if (dist(p.x, p.y, centre.x, centre.y) > 650) {
        state.reclaimTimers[zone.id] = (state.reclaimTimers[zone.id] || 0) + dt;
        if (state.reclaimTimers[zone.id] > 60) {
          zone.owner = 'rival';
          state.reclaimTimers[zone.id] = 0;
          showMessage(`The rival crew retook ${zone.name} while you were away.`, 4);
        }
      } else {
        state.reclaimTimers[zone.id] = 0;
      }
    }
    state.rentTimer -= dt;
    if (state.rentTimer <= 0) {
      state.rentTimer = TURF.rentSeconds;
      const owned = state.zones.filter((z) => z.owner === 'player').length;
      if (owned > 0) {
        state.money += owned * TURF.rentPay;
        showMessage(`Turf rent: +$${owned * TURF.rentPay} from ${owned} zone${owned === 1 ? '' : 's'}.`, 3);
      }
    }
    return events;
  }

  function updateParticles(dt) {
    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.96;
      particle.vy *= 0.96;
      particle.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const skid of state.skids) skid.life -= dt;
    state.skids = state.skids.filter((s) => s.life > 0);
    if (state.messageTimer > 0) state.messageTimer -= dt;
  }

  function step(dt, input, actions) {
    if (state.gameOver) return EVENT_OVER;
    state.time += dt;
    let events = 0;
    events |= updatePlayer(dt, input, actions);
    updateTraffic(dt);
    updatePeds(dt);
    events |= updatePolice(dt);
    events |= updateRivals(dt);
    events |= updateMissions(dt);
    events |= updateTurf(dt);
    updateParticles(dt);
    return events;
  }

  function clockMinutes() {
    const span = CLOCK.endMinutes - CLOCK.startMinutes;
    return CLOCK.startMinutes + Math.min(1, state.time / CLOCK.spanSeconds) * span;
  }

  function saveData() {
    return {
      money: state.money,
      missionIndex: state.missionIndex,
      zones: state.zones.map((z) => ({ id: z.id, owner: z.owner })),
    };
  }

  function loadData(data) {
    if (!data) return;
    if (typeof data.money === 'number') state.money = data.money;
    if (typeof data.missionIndex === 'number') state.missionIndex = clamp(data.missionIndex, 0, MISSIONS.length);
    if (Array.isArray(data.zones)) {
      for (const saved of data.zones) {
        const zone = state.zones.find((z) => z.id === saved.id);
        if (zone && ['player', 'rival', 'neutral'].includes(saved.owner)) zone.owner = saved.owner;
      }
    }
  }

  reset();
  return {
    state,
    city,
    reset,
    step,
    startMission,
    createDispatch,
    clockMinutes,
    saveData,
    loadData,
    zoneAt,
    onRoad,
    nearestRoadX,
    nearestRoadY,
    showMessage,
    addWanted,
  };
}
