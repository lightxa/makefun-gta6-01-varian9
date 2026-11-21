// Drawing only: the world state and the current screen in, pixels out. A smooth
// camera follows the player across the 2600x1900 city; the canvas shows a
// 1280x720 window of it, scaled to the browser window. Dawn light is a warm
// gradient laid over the ground, buildings are coloured blocks with name boards,
// and the HUD carries money, health, wanted stars, the objective, the clock,
// speed and a live minimap.
import { FONT, MISSIONS, PALETTE, ROADS_H, ROADS_V, ROAD_W, WORLD, ZONES } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_MISSION = 'mission';

const VIEW = { width: 1280, height: 720 };
const MINIMAP = { x: 1060, y: 16, w: 204, h: 150 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createRenderer(canvas, world) {
  const context = canvas.getContext('2d');
  const camera = { x: 0, y: 0 };
  const fonts = new Map();
  let viewScale = 1;
  let viewX = 0;
  let viewY = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    viewScale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    viewX = (canvas.width - VIEW.width * viewScale) / 2;
    viewY = (canvas.height - VIEW.height * viewScale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function plainText(value, x, y, size, color, align, baseline) {
    if (!fonts.has('p' + size)) fonts.set('p' + size, `${size}px ${FONT}`);
    context.font = fonts.get('p' + size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function updateCamera(state) {
    const targetX = clamp(state.player.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
    const targetY = clamp(state.player.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
    camera.x += (targetX - camera.x) * 0.08;
    camera.y += (targetY - camera.y) * 0.08;
  }

  function drawGround() {
    const gradient = context.createLinearGradient(0, 0, 0, VIEW.height);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.45, PALETTE.skyBottom);
    gradient.addColorStop(0.46, PALETTE.ground);
    gradient.addColorStop(1, '#b98d5e');
    context.fillStyle = gradient;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    // Water along the east edge, with the pier.
    context.fillStyle = PALETTE.water;
    context.fillRect(2440 - camera.x, 0, VIEW.width, VIEW.height);
    context.fillStyle = '#8a6a4a';
    context.fillRect(2380 - camera.x, 240, 70, 160);
    context.fillStyle = '#6b4f36';
    for (let i = 0; i < 6; i += 1) context.fillRect(2380 - camera.x, 248 + i * 26, 70, 4);
  }

  function drawRoads() {
    context.fillStyle = PALETTE.sidewalk;
    for (const v of ROADS_V) context.fillRect(v - ROAD_W / 2 - 10 - camera.x, 0, ROAD_W + 20, VIEW.height);
    for (const h of ROADS_H) context.fillRect(0, h - ROAD_W / 2 - 10 - camera.y, VIEW.width, ROAD_W + 20);
    context.fillStyle = PALETTE.road;
    for (const v of ROADS_V) context.fillRect(v - ROAD_W / 2 - camera.x, 0, ROAD_W, VIEW.height);
    for (const h of ROADS_H) context.fillRect(0, h - ROAD_W / 2 - camera.y, VIEW.width, ROAD_W);
    // Centre dashes.
    context.fillStyle = PALETTE.marking;
    for (const v of ROADS_V) {
      for (let y = 0; y < WORLD.height; y += 56) {
        context.fillRect(v - 3 - camera.x, y - camera.y, 6, 28);
      }
    }
    for (const h of ROADS_H) {
      for (let x = 0; x < WORLD.width; x += 56) {
        context.fillRect(x - camera.x, h - 3 - camera.y, 28, 6);
      }
    }
    // Rail lines through the rail yard (north-east).
    context.strokeStyle = '#5a5148';
    context.lineWidth = 3;
    for (const y of [180, 210]) {
      context.beginPath();
      context.moveTo(1660 - camera.x, y - camera.y);
      context.lineTo(2400 - camera.x, y - camera.y);
      context.stroke();
    }
  }

  function drawCity(state) {
    // Turf zone tints on the ground.
    for (const zone of state.zones) {
      context.fillStyle = zone.owner === 'player' ? 'rgba(79, 174, 98, 0.20)'
        : zone.owner === 'rival' ? 'rgba(194, 59, 94, 0.20)' : 'rgba(242, 201, 76, 0.10)';
      context.fillRect(zone.x - camera.x, zone.y - camera.y, zone.w, zone.h);
      context.strokeStyle = zone.owner === 'player' ? '#4fae62' : zone.owner === 'rival' ? '#c23b5e' : '#f2c94c';
      context.lineWidth = 2;
      context.setLineDash([8, 6]);
      context.strokeRect(zone.x - camera.x, zone.y - camera.y, zone.w, zone.h);
      context.setLineDash([]);
      plainText(zone.name.toUpperCase(), zone.x + 10 - camera.x, zone.y + 24 - camera.y, 15, zone.owner === 'rival' ? '#ffd3de' : '#fff6e8', 'left');
    }
    // Containers in the yard.
    for (const c of world.city.containers) {
      context.fillStyle = c.color;
      context.fillRect(c.x - camera.x, c.y - camera.y, c.w, c.h);
      context.strokeStyle = 'rgba(0,0,0,0.25)';
      context.lineWidth = 2;
      context.strokeRect(c.x - camera.x, c.y - camera.y, c.w, c.h);
    }
    // Buildings with name boards.
    for (const b of world.city.buildings) {
      context.fillStyle = b.color;
      context.fillRect(b.x - camera.x, b.y - camera.y, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x + 6 - camera.x, b.y + 6 - camera.y, b.w - 12, b.h - 12);
      context.fillStyle = 'rgba(255, 246, 232, 0.85)';
      context.fillRect(b.x + 8 - camera.x, b.y + 8 - camera.y, Math.min(b.w - 16, 14 + b.name.length * 7), 18);
      context.fillStyle = '#241a20';
      plainText(b.name, b.x + 12 - camera.x, b.y + 22 - camera.y, 12, '#241a20', 'left');
    }
  }

  function drawCar(car) {
    context.save();
    context.translate(car.x - camera.x, car.y - camera.y);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(-24, -13, 48, 26);
    context.fillStyle = car.color;
    context.fillRect(-23, -12, 46, 24);
    context.fillStyle = '#cfe8f5';
    context.fillRect(-6, -10, 12, 20);
    context.fillStyle = '#ffe9a8';
    context.fillRect(20, -10, 3, 6);
    context.fillRect(20, 4, 3, 6);
    if (car.police) {
      context.fillStyle = '#ffffff';
      context.fillRect(-14, -12, 10, 4);
      context.fillStyle = '#ff3b30';
      context.fillRect(-14, -12, 5, 4);
      context.fillStyle = '#2b6bff';
      context.fillRect(-9, -12, 5, 4);
      plainText('POLICE', -8, -18, 10, '#ffffff', 'center');
    }
    context.restore();
  }

  function drawPerson(x, y, angle, color, radius) {
    context.save();
    context.translate(x - camera.x, y - camera.y);
    context.rotate(angle);
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.arc(2, 3, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = color;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#241a20';
    context.beginPath();
    context.arc(5, 0, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawMarkers(state) {
    const p = state.player;
    const target = currentTarget(state);
    if (target) {
      const pulse = 1 + Math.sin(state.time * 5) * 0.15;
      context.strokeStyle = '#f2c94c';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(target.x - camera.x, target.y - camera.y, 26 * pulse, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = '#f2c94c';
      context.beginPath();
      context.moveTo(target.x - camera.x, target.y - camera.y - 34);
      context.lineTo(target.x - 8 - camera.x, target.y - camera.y - 48);
      context.lineTo(target.x + 8 - camera.x, target.y - camera.y - 48);
      context.closePath();
      context.fill();
      plainText(target.label, target.x - camera.x, target.y - camera.y - 54, 14, '#fff6e8', 'center');
      // A guide line from the player to the target, faint.
      context.strokeStyle = 'rgba(242, 201, 76, 0.35)';
      context.lineWidth = 2;
      context.setLineDash([10, 10]);
      context.beginPath();
      context.moveTo(p.x - camera.x, p.y - camera.y);
      context.lineTo(target.x - camera.x, target.y - camera.y);
      context.stroke();
      context.setLineDash([]);
    }
    if (state.capture) {
      const zone = state.zones.find((z) => z.id === state.capture.zoneId);
      if (zone) {
        const cx = zone.x + zone.w / 2 - camera.x;
        const cy = zone.y + zone.h / 2 - camera.y;
        context.fillStyle = 'rgba(24,18,28,0.8)';
        context.fillRect(cx - 130, cy - 60, 260, 44);
        context.fillStyle = '#4fae62';
        context.fillRect(cx - 122, cy - 52, 244 * state.capture.progress, 14);
        plainText(`Claiming ${zone.name} ${Math.floor(state.capture.progress * 100)}%`, cx, cy - 26, 16, '#fff6e8', 'center');
      }
    }
    if (state.mission && state.mission.phase === 'turf') {
      const zone = state.zones.find((z) => z.id === state.mission.def.turf);
      if (zone) {
        const cx = zone.x + zone.w / 2 - camera.x;
        const cy = zone.y + zone.h / 2 - camera.y;
        context.fillStyle = 'rgba(24,18,28,0.8)';
        context.fillRect(cx - 130, cy - 60, 260, 44);
        context.fillStyle = '#c23b5e';
        context.fillRect(cx - 122, cy - 52, 244 * (state.mission.progress || 0), 14);
        plainText(`Taking ${zone.name} ${Math.floor((state.mission.progress || 0) * 100)}%`, cx, cy - 26, 16, '#fff6e8', 'center');
      }
    }
  }

  /** The current navigation target: mission pickup/drop, dispatch point, or none. */
  function currentTarget(state) {
    if (state.mission) {
      const m = state.mission;
      if (m.phase === 'pickup') return { x: m.def.pickup.x, y: m.def.pickup.y, label: m.def.pickup.label };
      if (m.phase === 'drop') return { x: m.def.drop.x, y: m.def.drop.y, label: m.def.drop.label };
      if (m.phase === 'turf') return { x: m.def.pickup.x, y: m.def.pickup.y, label: m.def.pickup.label };
    }
    if (state.dispatch) {
      const d = state.dispatch;
      return d.phase === 'pickup'
        ? { x: d.pickup.x, y: d.pickup.y, label: d.pickup.label }
        : { x: d.drop.x, y: d.drop.y, label: d.drop.label };
    }
    return null;
  }

  function drawWorld(state) {
    drawGround();
    drawRoads();
    drawCity(state);
    // Skid marks.
    context.strokeStyle = 'rgba(20,16,20,0.45)';
    context.lineWidth = 4;
    for (const skid of state.skids) {
      context.beginPath();
      context.moveTo(skid.x - camera.x - Math.cos(skid.angle) * 10, skid.y - camera.y - Math.sin(skid.angle) * 10);
      context.lineTo(skid.x - camera.x + Math.cos(skid.angle) * 10, skid.y - camera.y + Math.sin(skid.angle) * 10);
      context.stroke();
    }
    for (const car of state.cars) drawCar(car);
    for (const cop of state.police) drawCar(cop);
    for (const ped of state.peds) drawPerson(ped.x, ped.y, ped.angle, ped.color, 9);
    for (const rival of state.rivals) drawPerson(rival.x, rival.y, rival.angle, '#c23b5e', 12);
    for (const pt of state.particles) {
      context.globalAlpha = Math.max(0, pt.life / pt.max);
      context.fillStyle = pt.color;
      context.beginPath();
      context.arc(pt.x - camera.x, pt.y - camera.y, pt.size, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }
    const p = state.player;
    if (p.onFoot) {
      drawPerson(p.x, p.y, p.angle, PALETTE.player, 13);
      if (p.punchTimer > 0.25) {
        context.strokeStyle = '#ffffff';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(p.x + Math.cos(p.angle) * 30 - camera.x, p.y + Math.sin(p.angle) * 30 - camera.y, 12, 0, Math.PI * 2);
        context.stroke();
      }
    }
    drawMarkers(state);
  }

  function drawMinimap(state) {
    const m = MINIMAP;
    const sx = m.w / WORLD.width;
    const sy = m.h / WORLD.height;
    context.fillStyle = 'rgba(24,18,28,0.82)';
    context.fillRect(m.x - 6, m.y - 6, m.w + 12, m.h + 26);
    context.fillStyle = '#3a3340';
    context.fillRect(m.x, m.y, m.w, m.h);
    context.strokeStyle = '#6a6270';
    context.lineWidth = 1;
    for (const v of ROADS_V) {
      context.beginPath();
      context.moveTo(m.x + v * sx, m.y);
      context.lineTo(m.x + v * sx, m.y + m.h);
      context.stroke();
    }
    for (const h of ROADS_H) {
      context.beginPath();
      context.moveTo(m.x, m.y + h * sy);
      context.lineTo(m.x + m.w, m.y + h * sy);
      context.stroke();
    }
    for (const zone of state.zones) {
      context.fillStyle = zone.owner === 'player' ? '#4fae62' : zone.owner === 'rival' ? '#c23b5e' : '#8a7a4a';
      context.fillRect(m.x + zone.x * sx, m.y + zone.y * sy, Math.max(3, zone.w * sx), Math.max(3, zone.h * sy));
    }
    const target = currentTarget(state);
    if (target) {
      context.fillStyle = '#f2c94c';
      context.beginPath();
      context.arc(m.x + target.x * sx, m.y + target.y * sy, 5, 0, Math.PI * 2);
      context.fill();
    }
    for (const cop of state.police) {
      context.fillStyle = '#5b8cff';
      context.beginPath();
      context.arc(m.x + cop.x * sx, m.y + cop.y * sy, 3, 0, Math.PI * 2);
      context.fill();
    }
    const p = state.player;
    context.save();
    context.translate(m.x + p.x * sx, m.y + p.y * sy);
    context.rotate(p.angle);
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -5);
    context.lineTo(-5, 5);
    context.closePath();
    context.fill();
    context.restore();
    plainText('CINDER QUAY', m.x + m.w / 2, m.y + m.h + 16, 11, '#e8cfa8', 'center');
  }

  function objectiveText(state) {
    if (state.mission) {
      const m = state.mission;
      const where = m.phase === 'pickup' ? `Pick up at ${m.def.pickup.label}`
        : m.phase === 'drop' ? `Deliver to ${m.def.drop.label}`
        : `Hold ${m.def.pickup.label} until it is yours`;
      return `${m.def.name}  •  ${where}  •  ${Math.ceil(m.timer)}s  •  $${m.pay}`;
    }
    if (state.dispatch) {
      const d = state.dispatch;
      const where = d.phase === 'pickup' ? `Collect at ${d.pickup.label}` : `Deliver to ${d.drop.label}`;
      return `Dispatch  •  ${where}  •  ${Math.ceil(d.timer)}s  •  $${d.pay}`;
    }
    if (state.missionIndex >= MISSIONS.length) return 'All story missions done. Free roam: J for dispatch, stand in a rival zone to claim turf.';
    return `Next: ${MISSIONS[state.missionIndex].name}  •  Press Enter to start  •  J for a dispatch job`;
  }

  function drawHud(state, clockMinutes) {
    context.textBaseline = 'top';
    // Money and health, top-left.
    context.fillStyle = PALETTE.panel;
    context.fillRect(12, 12, 300, 96);
    text(`$${state.money}`, 24, 22, 30, PALETTE.gold, 'left', 'top');
    plainText('CASH', 24, 58, 13, PALETTE.muted, 'left', 'top');
    context.fillStyle = '#3a2a30';
    context.fillRect(24, 82, 180, 12);
    context.fillStyle = state.health > 40 ? '#4fae62' : '#e0483e';
    context.fillRect(24, 82, 180 * (state.health / 100), 12);
    plainText(`HEALTH ${Math.ceil(state.health)}`, 212, 80, 13, PALETTE.text, 'left', 'top');
    // Wanted stars, top-centre.
    const stars = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    text(stars, VIEW.width / 2, 18, 30, state.wanted > 0 ? '#ff5b4d' : '#8b93a3', 'center', 'top');
    plainText(state.wanted > 0 ? 'WANTED' : 'CLEAN', VIEW.width / 2, 52, 13, PALETTE.muted, 'center', 'top');
    // Clock, under the money panel on the left.
    const hours = Math.floor(clockMinutes / 60);
    const minutes = Math.floor(clockMinutes % 60);
    const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    plainText(`DAWN  ${clock}`, 24, 124, 14, PALETTE.text, 'left', 'top');
    if (!state.player.onFoot) {
      const kmh = Math.round(Math.abs(state.player.speed) * 0.32);
      text(`${kmh}`, 1180, 620, 44, PALETTE.text, 'right', 'top');
      plainText('km/h', 1190, 636, 14, PALETTE.muted, 'left', 'top');
    }
    // Objective bar, bottom.
    context.fillStyle = PALETTE.panel;
    context.fillRect(12, VIEW.height - 52, VIEW.width - 24, 40);
    plainText(objectiveText(state), 24, VIEW.height - 40, 17, PALETTE.text, 'left', 'top');
    // Message toast.
    if (state.messageTimer > 0 && state.message) {
      context.fillStyle = 'rgba(24,18,28,0.85)';
      const w = Math.min(760, 40 + state.message.length * 8);
      context.fillRect((VIEW.width - w) / 2, 96, w, 36);
      plainText(state.message, VIEW.width / 2, 106, 16, PALETTE.text, 'center', 'top');
    }
    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 32 + 70;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(24, 18, 28, 0.88)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent || PALETTE.gold;
    context.lineWidth = 3;
    context.strokeRect(x, y, width, height);
    text(title, VIEW.width / 2, y + 62, 44, PALETTE.text, 'center', 'top');
    for (let i = 0; i < lines.length; i += 1) {
      plainText(lines[i], VIEW.width / 2, y + 128 + i * 32, 18, PALETTE.muted, 'center', 'top');
    }
    text(prompt, VIEW.width / 2, y + height - 46, 20, PALETTE.gold, 'center', 'top');
  }

  const TITLE_LINES = [
    'A dawn-shift courier dragged into the harbour underworld.',
    'Drive, steal, run jobs, claim turf, outrun the patrol.',
    'WASD / arrows move and drive  •  Shift run  •  E enter a car',
    'F punch  •  J dispatch job  •  Space handbrake  •  Esc pause  •  M mute',
    '',
  ];

  /** Paint one frame: the city through the camera, then the HUD or a panel. */
  function draw(state, screen, extra, clockMinutes) {
    updateCamera(state);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#1a1420';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(viewScale, 0, 0, viewScale, viewX, viewY);
    drawWorld(state);
    if (screen === SCREEN_TITLE) {
      const lines = TITLE_LINES.slice();
      lines[4] = extra && extra.saveText ? extra.saveText : 'A new shift starts with $40 in your pocket.';
      drawPanel('CINDER QUAY', lines, 'Press Enter to start your shift', PALETTE.gold);
      return;
    }
    drawHud(state, clockMinutes);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The harbour waits for no one, but it will wait for you.', 'Missions, turf and money are saved when you finish a job.'], 'Press Esc or P to keep driving', PALETTE.gold);
    } else if (screen === SCREEN_MISSION) {
      const done = extra && extra.missionDone;
      drawPanel(
        done ? 'Mission Complete' : 'Mission Failed',
        done ? [`${extra.missionName} paid $${extra.pay}.`, `Total cash: $${state.money}.`, `Missions finished: ${state.missionIndex} of ${MISSIONS.length}.`] : [extra && extra.failReason ? extra.failReason : 'The job slipped away.', 'The harbour forgets quickly. Take the next one.'],
        'Press Enter to continue',
        done ? '#4fae62' : '#e0483e',
      );
    } else if (screen === SCREEN_OVER) {
      drawPanel('Busted Flat', [`The shift ends with $${state.money} in your pocket.`, `Missions finished: ${state.missionIndex} of ${MISSIONS.length}.`], 'Press Enter to start a new shift', '#e0483e');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
