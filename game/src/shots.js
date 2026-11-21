// The screenshot scenes behind ?shot=start|play|turf|end. Each one plays the real
// rules forward from a fresh world, steered by a road-following autopilot (drive
// to the nearest road, along it, then to the target), so every frame is what real
// play looks like and the same seed always gives the same frame.
import { ROADS_H, ROADS_V, STEP } from './config.js';
import { EVENT_MISSION_DONE, EVENT_OVER } from './world.js';
import { SCREEN_MISSION, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** Build a road-only route: to the nearest vertical road, along it, then to the target.
 *  Every waypoint sits on a road centre line, so the car never cuts a corner
 *  through a block of buildings or the container yard. */
function roadRoute(fromX, fromY, toX, toY) {
  const roadX = ROADS_V.reduce((best, v) => (Math.abs(v - fromX) < Math.abs(best - fromX) ? v : best), ROADS_V[0]);
  const fromRoadY = ROADS_H.reduce((best, h) => (Math.abs(h - fromY) < Math.abs(best - h) ? h : best), ROADS_H[0]);
  const roadY = ROADS_H.reduce((best, h) => (Math.abs(h - toY) < Math.abs(best - h) ? h : best), ROADS_H[0]);
  const points = [];
  if (Math.abs(fromX - roadX) > 30) points.push({ x: roadX, y: fromRoadY });
  points.push({ x: roadX, y: roadY });
  points.push({ x: toX, y: roadY });
  points.push({ x: toX, y: toY });
  return points;
}

/** A fake input object the autopilot drives: keys are set from a waypoint list. */
function createPilot() {
  const held = new Set();
  let steps = 0;
  let lastX = 0;
  let lastY = 0;
  let reverseSteps = 0;
  return {
    held,
    isDown(...codes) {
      return codes.some((code) => held.has(code));
    },
    takePressed() {
      return new Set();
    },
    steerTo(state, tx, ty) {
      const p = state.player;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const distance = Math.hypot(dx, dy);
      held.clear();
      if (distance < 30) return true;
      // Stuck against a wall or a corner: back out for a second, then retry.
      steps += 1;
      if (steps % 120 === 0) {
        const moved = Math.hypot(p.x - lastX, p.y - lastY);
        if (moved < 20 && Math.abs(p.speed) < 40 && !p.onFoot) reverseSteps = 60;
        lastX = p.x;
        lastY = p.y;
      }
      const targetAngle = Math.atan2(dy, dx);
      let diff = targetAngle - p.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (reverseSteps > 0) {
        reverseSteps -= 1;
        held.add('KeyS');
        if (diff > 0.12) held.add('KeyD');
        else if (diff < -0.12) held.add('KeyA');
        return false;
      }
      if (p.onFoot) {
        if (dx > 20) held.add('KeyD');
        else if (dx < -20) held.add('KeyA');
        if (dy > 20) held.add('KeyS');
        else if (dy < -20) held.add('KeyW');
        held.add('ShiftLeft');
        return false;
      }
      // Driving: always forward, steering toward the waypoint. The car's low
      // speed steering floor lets it turn around from a crawl, so there is no
      // need to reverse to turn; reversing is only for getting unwedged, which
      // the stuck detector below handles. Brake early into every corner so the
      // car arrives slow enough to make the turn instead of overshooting it.
      if (distance < 350 && p.speed > 120) held.add('KeyS');
      else held.add('KeyW');
      if (diff > 0.12) held.add('KeyA');
      else if (diff < -0.12) held.add('KeyD');
      return false;
    },
  };
}

/** Follow a waypoint list, one step at a time; returns true when the last is reached. */
function followRoute(pilot, state, route) {
  if (route.length === 0) return true;
  if (pilot.steerTo(state, route[0].x, route[0].y)) route.shift();
  return route.length === 0;
}

/** Put the player in the nearest parked car and drive the route to the target. */
function driveMission(world, seconds, missionIndex) {
  const state = world.state;
  const pilot = createPilot();
  world.startMission(missionIndex);
  // Step into the nearest parked car first.
  let entered = false;
  for (let i = 0; i < 10 * 60 && !entered; i += 1) {
    const car = state.cars.find((c) => c.parked && Math.hypot(c.x - state.player.x, c.y - state.player.y) < 78);
    if (car) {
      state.player.x = car.x;
      state.player.y = car.y;
      world.step(STEP, pilot, new Set(['enterCar']));
      entered = !state.player.onFoot;
    } else {
      const nearest = state.cars.filter((c) => c.parked)
        .sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y))[0];
      pilot.steerTo(state, nearest.x, nearest.y);
      world.step(STEP, pilot, new Set());
    }
  }
  let route = null;
  let lastPhase = null;
  let done = false;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const mission = state.mission;
    if (!mission) break; // Failed or expired: not done.
    if (mission.phase !== lastPhase) {
      lastPhase = mission.phase;
      const target = mission.phase === 'pickup' ? mission.def.pickup : mission.def.drop;
      route = roadRoute(state.player.x, state.player.y, target.x, target.y);
    }
    followRoute(pilot, state, route);
    const events = world.step(STEP, pilot, new Set());
    if (events & EVENT_OVER) break;
    if (events & EVENT_MISSION_DONE) { done = true; break; }
  }
  return done;
}

/**
 * Set `world` to the named scene (start, play, turf or end) and return the screen
 * to draw over it, plus any panel details.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === 'play') {
    // A chase in progress: mission 1 under way, two stars, patrol cars closing in.
    driveMission(world, 26, 0);
    world.addWanted(2);
    return { screen: SCREEN_PLAY, extra: null };
  }
  if (name === 'turf') {
    // Mid-claim at Rust Wharf: on foot, rivals closing in, capture bar half full.
    world.startMission(3);
    state.player.x = 1750;
    state.player.y = 200;
    state.player.onFoot = true;
    state.player.car = null;
    const pilot = createPilot();
    for (let i = 0; i < 8 * 60; i += 1) {
      // Stand and fight: punch whenever a rival is close.
      const near = state.rivals.some((r) => Math.hypot(r.x - state.player.x, r.y - state.player.y) < 60);
      const actions = new Set();
      if (near) {
        const rival = state.rivals.find((r) => Math.hypot(r.x - state.player.x, r.y - state.player.y) < 60);
        state.player.angle = Math.atan2(rival.y - state.player.y, rival.x - state.player.x);
        actions.add('punch');
      }
      world.step(STEP, pilot, actions);
    }
    return { screen: SCREEN_PLAY, extra: null };
  }
  if (name === 'end') {
    // Mission 1 driven to completion, end to end, by the autopilot.
    const done = driveMission(world, 150, 0);
    return {
      screen: done ? SCREEN_MISSION : SCREEN_PLAY,
      extra: done ? { missionDone: true, missionName: 'First Light Run', pay: 120 } : null,
    };
  }
  // Start: the title screen over a city that has already woken for five seconds.
  const pilot = createPilot();
  for (let i = 0; i < 5 * 60; i += 1) {
    pilot.steerTo(state, 1140, 1020);
    world.step(STEP, pilot, new Set());
  }
  return { screen: SCREEN_TITLE, extra: null };
}
