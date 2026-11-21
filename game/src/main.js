// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. Screens: title, play, paused, mission result, game over.
//
// ?seed=N fixes the traffic and pedestrian pattern. ?shot=start|play|turf|end
// (with &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot. Progress (money, turf, missions
// open) saves to localStorage whenever a job pays out and loads at boot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BUSTED, EVENT_CAPTURE, EVENT_CASH, EVENT_FAIL, EVENT_HURT,
  EVENT_MISSION_DONE, EVENT_OVER, EVENT_PICKUP, EVENT_PUNCH, EVENT_WANTED_UP,
  createWorld,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER_CAR, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_MISSION, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261121;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, world);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.saveData()));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function saveText(saved) {
  if (!saved) return 'A new shift starts with $40 in your pocket.';
  return `Welcome back: $${saved.money} in your pocket, ${saved.missionIndex} of 5 missions done.`;
}

function runShot(name) {
  const scene = stageShot(name, world);
  // Paint synchronously, many times: the smooth camera settles on the staged
  // scene (a teleported player starts with the camera far behind) without
  // waiting on the display's frame rate, then the shot is ready.
  for (let i = 0; i < 50; i += 1) {
    renderer.draw(world.state, scene.screen, scene.extra, world.clockMinutes());
  }
  window.__shotReady = true;
}

function runGame() {
  const input = createInput(window);
  const saved = readSave();
  if (saved) world.loadData(saved);
  let screen = SCREEN_TITLE;
  let missionPanel = null;
  let pendingMission = null;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startShift() {
    world.reset();
    const keep = readSave();
    if (keep) world.loadData(keep);
    missionPanel = null;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing Cinder Quay.');
  }

  function endShift() {
    screen = SCREEN_OVER;
    writeSave();
    announce(`Shift over. $${world.state.money} in your pocket.`);
  }

  function handleEvents(events) {
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_CASH) audio.cash();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_HURT) audio.hurt();
    if (events & EVENT_CAPTURE) audio.capture();
    if (events & EVENT_FAIL) audio.fail();
    if (events & EVENT_WANTED_UP) announce('The patrol is on you now.');
    if (events & EVENT_BUSTED) announce('Busted. The patrol took $50.');
    if (events & EVENT_MISSION_DONE) {
      writeSave();
      missionPanel = {
        missionDone: true,
        missionName: pendingMission ? pendingMission.name : 'Job complete',
        pay: pendingMission ? pendingMission.pay : 0,
      };
      screen = SCREEN_MISSION;
    }
    if (events & EVENT_OVER) endShift();
  }

  function handleActions() {
    const actions = input.takePressed();
    // Gameplay actions are for the world step below: hand them back.
    if (actions.has(ACTION_ENTER_CAR)) input.injectAction(ACTION_ENTER_CAR);
    if (actions.has('punch')) input.injectAction('punch');
    if (actions.has('dispatch')) input.injectAction('dispatch');
    if (actions.has(ACTION_MUTE)) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
      return;
    }
    if (screen === SCREEN_TITLE && actions.has(ACTION_CONFIRM)) {
      startShift();
      return;
    }
    if (screen === SCREEN_PLAY && actions.has(ACTION_CONFIRM)) {
      // Enter takes the next story mission while free roaming.
      if (!world.state.mission && world.state.missionIndex < 5) {
        world.startMission(world.state.missionIndex);
        audio.unlock();
      }
      return;
    }
    if (screen === SCREEN_PLAY && actions.has(ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    if (screen === SCREEN_PAUSED && (actions.has(ACTION_PAUSE) || actions.has(ACTION_CONFIRM))) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return;
    }
    if (screen === SCREEN_MISSION && actions.has(ACTION_CONFIRM)) {
      missionPanel = null;
      screen = SCREEN_PLAY;
      return;
    }
    if (screen === SCREEN_OVER && actions.has(ACTION_CONFIRM)) {
      startShift();
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The title screen sits over a city already moving: traffic and pedestrians
      // run, but the player cannot be hurt and no mission runs.
      world.step(STEP, input, new Set());
      return;
    }
    const actions = input.takePressed();
    const mission = world.state.mission;
    pendingMission = mission ? { name: mission.def.name, pay: mission.pay } : null;
    const events = world.step(STEP, input, actions);
    handleEvents(events);
    if (screen === SCREEN_PLAY && world.state.mission === null && missionPanel) {
      screen = SCREEN_MISSION;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    audio.update(STEP, world.state.player.speed, world.state.wanted, screen === SCREEN_PLAY);
    renderer.draw(world.state, screen, screen === SCREEN_TITLE ? { saveText: saveText(saved) } : missionPanel, world.clockMinutes());
  }

  // The mission panel needs the name and pay of the job that just ended: the
  // world clears the mission on completion, so pendingMission remembers it.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('pointerdown', () => audio.unlock());

  // A small debug hook for play-testing: state and the input, nothing else.
  window.__cinder = {
    state: world.state,
    world,
    input,
    startMission(index) {
      return world.startMission(index);
    },
    save() {
      writeSave();
      return world.saveData();
    },
  };

  announce('Cinder Quay. Press Enter to start your shift.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
