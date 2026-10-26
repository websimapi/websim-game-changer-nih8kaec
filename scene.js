import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const PINK = 0xff3d8b, CYAN = 0x2de2e6, GOLD = 0xffd23f, PURPLE = 0x6a2cff;

let renderer, scene, camera, composer, bloom, clock;
const actors = {};          // id -> { group, head, mouth, armR, pos, facing, talk }
const podiums = [];         // { panel, ctx, tex, dome, band, light, cone }
let screen, wheel, confetti, samLight, washLights = [];
let speaking = null;
let twistT = 0;
let shot = { pos: new THREE.Vector3(0, 5, 16), target: new THREE.Vector3(0.5, 3, 0) };
const camPos = new THREE.Vector3(0, 9, 26), camTarget = new THREE.Vector3(0, 4, 0);

const CONTESTANT_SPOTS = [
  { x: 0.9, z: 0.9 }, { x: 3.5, z: 0.2 }, { x: 6.1, z: -0.7 },
];
const SAM_SPOT = { x: -5.0, z: 0.7 };

/* ---------- helpers ---------- */
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
const glow = (color, intensity = 2) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
function canvasTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { c, ctx: c.getContext('2d'), tex };
}
function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/);
  const lines = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

/* ---------- characters ---------- */
function makePerson(look) {
  const g = new THREE.Group();
  const skin = std(look.skin, { roughness: 0.7 });
  const shirt = std(look.shirt, { roughness: 0.85 });
  const hair = std(look.hair, { roughness: 0.9 });
  const dark = std(0x111111, { roughness: 0.4 });

  const torso = mesh(new THREE.CapsuleGeometry(0.3, 0.55, 6, 16), shirt, 0, 1.22, 0, g);
  torso.scale.set(1.3, 1, 0.85);
  if (look.blazer) {
    mesh(new THREE.BoxGeometry(0.16, 0.42, 0.05), std(0xf2f2f2), 0, 1.38, 0.24, g);
    mesh(new THREE.BoxGeometry(0.05, 0.36, 0.04), std(0x8a1030), 0, 1.36, 0.27, g);
  }
  mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.16, 12), skin, 0, 1.62, 0, g);

  const head = new THREE.Group();
  head.position.set(0, 1.86, 0);
  g.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.24, 32, 24), skin, 0, 0, 0, head);
  skull.scale.set(0.92, 1.05, 0.95);
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.03, 12, 8), std(0xffffff, { roughness: 0.3 }), s * 0.085, 0.03, 0.2, head);
    mesh(new THREE.SphereGeometry(0.018, 10, 8), dark, s * 0.085, 0.03, 0.225, head);
    const brow = mesh(new THREE.BoxGeometry(0.08, 0.018, 0.02), hair, s * 0.085, 0.09, 0.215, head);
    brow.rotation.z = s * -0.12;
    mesh(new THREE.SphereGeometry(0.05, 10, 8), skin, s * 0.215, 0, 0, head); // ears
  }
  mesh(new THREE.SphereGeometry(0.035, 12, 8), skin, 0, -0.02, 0.235, head);
  if (look.glasses) {
    for (const s of [-1, 1]) {
      const r = mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 20), dark, s * 0.085, 0.03, 0.235, head);
    }
  }

  // hair
  if (look.hairStyle === 'curly') {
    const geo = new THREE.SphereGeometry(0.085, 10, 8);
    for (let i = 0; i < 46; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.55;
      const r = 0.24;
      const x = Math.sin(ph) * Math.cos(th) * r, z = Math.sin(ph) * Math.sin(th) * r - 0.03, y = Math.cos(ph) * r + 0.03;
      if (z > 0.13 && y < 0.17) continue; // keep the face clear
      const b = mesh(geo, hair, x, y, z, head);
      b.scale.setScalar(0.8 + Math.random() * 0.6);
    }
  } else {
    const cap = look.hairStyle === 'buzz' ? 0.46 : look.hairStyle === 'mop' ? 0.56 : 0.5;
    const r = look.hairStyle === 'buzz' ? 0.247 : 0.262;
    const h = mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI * cap), hair, 0, 0.02, -0.02, head);
    h.rotation.x = -0.35;
    h.scale.set(0.95, 1.05, 1);
    if (look.hairStyle === 'mop') {
      const bang = mesh(new THREE.SphereGeometry(0.16, 16, 10), hair, 0.03, 0.15, 0.13, head);
      bang.scale.set(1.25, 0.45, 0.7);
      bang.rotation.z = -0.2;
    }
  }
  if (look.beard) {
    const b = mesh(new THREE.SphereGeometry(0.25, 28, 16, 0, Math.PI, Math.PI * 0.5, Math.PI * 0.42), hair, 0, 0.0, 0.0, head);
    b.scale.set(0.93, 1.08, 1.0);
  }
  const mouth = mesh(new THREE.BoxGeometry(0.085, 0.022, 0.02), std(0x3a0d12), 0, -0.1, 0.235, head);

  // arms reach forward to the podium
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.42, 1.48, 0);
    g.add(pivot);
    mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.62, 12), shirt, 0, -0.31, 0, pivot);
    mesh(new THREE.SphereGeometry(0.075, 12, 10), skin, 0, -0.65, 0, pivot);
    pivot.rotation.x = -1.0;
    pivot.rotation.z = s * 0.12;
    arms.push(pivot);
  }
  return { group: g, head, mouth, armR: arms[1], armL: arms[0] };
}

function placeActor(id, actor, spot, faceTo) {
  const ang = Math.atan2(faceTo.x - spot.x, faceTo.z - spot.z);
  actor.group.rotation.y = ang;
  actor.facing = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
  actor.group.position.set(spot.x - actor.facing.x * 0.5, 0.25, spot.z - actor.facing.z * 0.5);
  actor.base = new THREE.Vector3(spot.x, 0, spot.z);
  actor.talk = 0; actor.buzz = 0; actor.phase = Math.random() * 10;
  actors[id] = actor;
  scene.add(actor.group);
}

/* ---------- podiums ---------- */
function makePodium(spot, faceTo, color) {
  const g = new THREE.Group();
  g.position.set(spot.x, 0, spot.z);
  g.rotation.y = Math.atan2(faceTo.x - spot.x, faceTo.z - spot.z);
  scene.add(g);
  const body = mesh(new THREE.CylinderGeometry(0.58, 0.68, 1.1, 6), std(0x1a1238, { roughness: 0.35, metalness: 0.5 }), 0, 0.55, 0, g);
  body.rotation.y = Math.PI / 6;
  const top = mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.06, 6), std(0x0d0a1c, { roughness: 0.2, metalness: 0.7 }), 0, 1.12, 0, g);
  top.rotation.y = Math.PI / 6;
  const bandMat = glow(color, 2.2);
  const band = mesh(new THREE.CylinderGeometry(0.645, 0.645, 0.03, 6, 1, true), bandMat, 0, 1.08, 0, g);
  band.rotation.y = Math.PI / 6;
  const base = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.04, 6, 1, true), glow(color, 1.6), 0, 0.03, 0, g);
  base.rotation.y = Math.PI / 6;

  const { ctx, tex } = canvasTex(320, 200);
  const panel = mesh(new THREE.PlaneGeometry(0.62, 0.39), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0, 0.68, 0.545, g);
  panel.rotation.x = -0.09;

  // buzzer
  mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.05, 24), std(0x111111, { metalness: 0.6, roughness: 0.3 }), 0, 1.17, 0.2, g);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0xc8102e, emissive: 0xff1030, emissiveIntensity: 0.15, roughness: 0.25 });
  const dome = mesh(new THREE.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, 0, 1.19, 0.2, g);

  // floor shadow
  const sh = mesh(new THREE.CircleGeometry(1.0, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }), 0, 0.262, 0, g);
  sh.rotation.x = -Math.PI / 2;
  g.position.y = 0.25;
  return { group: g, ctx, tex, dome, band: bandMat, color };
}

function drawPanel(p, name, score, active) {
  const { ctx } = p;
  const W = 320, H = 200;
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#120d2c'); g.addColorStop(1, '#05040f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = hex(p.color); ctx.lineWidth = active ? 10 : 5;
  ctx.strokeRect(5, 5, W - 10, H - 10);
  ctx.fillStyle = hex(p.color);
  ctx.textAlign = 'center';
  ctx.font = '30px Bungee';
  ctx.fillText(name.toUpperCase(), W / 2, 52);
  ctx.fillStyle = '#ffffff';
  ctx.font = '92px Bungee';
  ctx.shadowColor = hex(p.color); ctx.shadowBlur = 18;
  ctx.fillText(String(score), W / 2, 162);
  ctx.shadowBlur = 0;
  p.tex.needsUpdate = true;
}

/* ---------- set pieces ---------- */
function buildStage() {
  const floor = mesh(new THREE.PlaneGeometry(80, 80), std(0x07051a, { roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // raised round stage with a tiled, glossy top
  const { c, ctx, tex } = canvasTex(1024, 1024);
  ctx.fillStyle = '#150d33'; ctx.fillRect(0, 0, 1024, 1024);
  ctx.translate(512, 512);
  for (let r = 0; r < 12; r++) {
    for (let a = 0; a < 24; a++) {
      ctx.beginPath();
      const r0 = r * 42, r1 = r0 + 40, a0 = (a / 24) * Math.PI * 2, a1 = a0 + Math.PI * 2 / 24 - 0.01;
      ctx.arc(0, 0, r1, a0, a1); ctx.arc(0, 0, r0, a1, a0, true); ctx.closePath();
      ctx.fillStyle = (r + a) % 2 ? '#1c1242' : '#120b2b';
      ctx.fill();
    }
  }
  const stage = mesh(new THREE.CylinderGeometry(9, 9.3, 0.25, 96), [
    std(0x0e0a22, { roughness: 0.4, metalness: 0.5 }),
    std(0xffffff, { map: tex, roughness: 0.18, metalness: 0.55 }),
    std(0x0e0a22),
  ], 0, 0.125, 0);
  scene.add(stage);
  const edge = mesh(new THREE.TorusGeometry(9.18, 0.035, 8, 160), glow(PINK, 3), 0, 0.2, 0);
  edge.rotation.x = Math.PI / 2;
  scene.add(edge);
  const inner = mesh(new THREE.TorusGeometry(4.2, 0.02, 8, 120), glow(CYAN, 2), 0, 0.255, 1.5);
  inner.rotation.x = Math.PI / 2;
  scene.add(inner);
  // center star
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.45 : 1.1, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const star = mesh(new THREE.ShapeGeometry(starShape), glow(GOLD, 1.3), 0, 0.256, 3.2);
  star.rotation.x = -Math.PI / 2;
  scene.add(star);

  // curved back wall with LED strips
  const wall = mesh(new THREE.CylinderGeometry(15, 15, 16, 64, 1, true, Math.PI - 1.25, 2.5), std(0x120a2a, { side: THREE.BackSide, roughness: 0.85 }), 0, 8, 1);
  scene.add(wall);
  const stripGeo = new THREE.BoxGeometry(0.08, 14, 0.08);
  for (let i = 0; i <= 22; i++) {
    const a = Math.PI - 1.2 + (i / 22) * 2.4;
    const x = Math.sin(a) * 14.7, z = Math.cos(a) * 14.7 + 1;
    if (Math.abs(x) < 5.4) continue; // behind the screen
    const s = mesh(stripGeo, glow(i % 2 ? PINK : CYAN, 1.8), x, 7, z);
    scene.add(s);
    washLights.push(s);
  }
  // stepped risers behind stage
  for (let i = 0; i < 3; i++) {
    const r = mesh(new THREE.BoxGeometry(22 - i * 3, 0.5, 1.2), std(0x1a1238, { roughness: 0.5, metalness: 0.3 }), 0, 0.25 + i * 0.5, -9.5 - i * 1.2);
    scene.add(r);
    const lip = mesh(new THREE.BoxGeometry(22 - i * 3, 0.03, 0.03), glow(i % 2 ? PINK : GOLD, 2), 0, 0.5 + i * 0.5, -8.9 - i * 1.2);
    scene.add(lip);
  }
}

function buildScreen() {
  const { c, ctx, tex } = canvasTex(1280, 720);
  const s = mesh(new THREE.PlaneGeometry(10, 5.625), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0, 4.9, -8.2);
  scene.add(s);
  const frame = mesh(new THREE.BoxGeometry(10.5, 6.1, 0.3), std(0x05040c, { metalness: 0.8, roughness: 0.3 }), 0, 4.9, -8.4);
  scene.add(frame);
  const trim = mesh(new THREE.BoxGeometry(10.6, 0.06, 0.06), glow(GOLD, 2.5), 0, 1.84, -8.2);
  scene.add(trim);
  screen = { ctx, tex, data: {} };

  // neon logo sign
  const n = canvasTex(1400, 360);
  n.ctx.textAlign = 'center';
  n.ctx.textBaseline = 'middle';
  n.ctx.font = 'italic 190px Bungee';
  n.ctx.save();
  n.ctx.translate(700, 185);
  n.ctx.transform(1, 0, -0.12, 1, 0, 0);
  n.ctx.lineWidth = 16; n.ctx.strokeStyle = '#ff3d8b';
  n.ctx.shadowColor = '#ff3d8b'; n.ctx.shadowBlur = 30;
  n.ctx.strokeText('GAME CHANGER', 0, 0);
  n.ctx.shadowColor = '#ffd23f'; n.ctx.shadowBlur = 20;
  n.ctx.fillStyle = '#ffe680';
  n.ctx.fillText('GAME CHANGER', 0, 0);
  n.ctx.restore();
  const sign = mesh(new THREE.PlaneGeometry(11, 2.83), new THREE.MeshBasicMaterial({ map: n.tex, transparent: true, toneMapped: false, depthWrite: false }), 0, 9.3, -8.1);
  scene.add(sign);
  screen.sign = sign;
}

export function setScreen(data) {
  screen.data = { ...screen.data, ...data };
  drawScreen();
}

function drawScreen(t = 0) {
  const { ctx, data } = screen;
  const W = 1280, H = 720;
  const twist = data.mode === 'twist';
  const g = ctx.createLinearGradient(0, 0, W, H);
  if (twist) { g.addColorStop(0, '#3a0010'); g.addColorStop(1, '#120005'); }
  else { g.addColorStop(0, '#1e0f4a'); g.addColorStop(1, '#0a0620'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // diamond pattern
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = twist ? '#ff2040' : '#ffd23f';
  for (let y = 0; y < H + 80; y += 80) for (let x = (y / 80) % 2 ? 40 : 0; x < W + 80; x += 80) {
    ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x + 20, y); ctx.lineTo(x, y + 20); ctx.lineTo(x - 20, y); ctx.fill();
  }
  ctx.restore();
  ctx.textAlign = 'center';
  if (data.mode === 'logo') {
    ctx.font = 'italic 150px Bungee';
    ctx.fillStyle = '#ffd23f';
    ctx.shadowColor = '#ff3d8b'; ctx.shadowBlur = 0;
    ctx.fillText('GAME', W / 2 + 10, 320); ctx.fillText('CHANGER', W / 2 - 10, 470);
    ctx.font = '600 34px Inter';
    ctx.fillStyle = '#ffffffcc';
    ctx.fillText(data.body || '', W / 2, 590);
  } else {
    ctx.font = '40px Bungee';
    ctx.fillStyle = twist ? '#ff4060' : '#2de2e6';
    ctx.fillText((data.kicker || '').toUpperCase(), W / 2, 110);
    ctx.font = (twist ? '100px' : '82px') + ' Bungee';
    ctx.fillStyle = '#ffd23f';
    const tl = wrap(ctx, (data.title || '').toUpperCase(), W - 140).slice(0, 2);
    tl.forEach((l, i) => ctx.fillText(l, W / 2, 220 + i * 90));
    ctx.font = '600 46px Inter';
    ctx.fillStyle = '#ffffff';
    const bl = wrap(ctx, data.body || '', W - 180).slice(0, 5);
    const by = 220 + tl.length * 90 + 50;
    bl.forEach((l, i) => ctx.fillText(l, W / 2, by + i * 58));
  }
  if (data.timer != null) {
    ctx.fillStyle = '#ffffff22'; ctx.fillRect(140, H - 40, W - 280, 14);
    ctx.fillStyle = '#ff3d8b'; ctx.fillRect(140, H - 40, (W - 280) * data.timer, 14);
  }
  screen.tex.needsUpdate = true;
}

function buildRig() {
  const truss = std(0x2a2a35, { metalness: 0.9, roughness: 0.35 });
  const y = 11;
  for (const z of [-5, 6]) scene.add(mesh(new THREE.BoxGeometry(22, 0.25, 0.25), truss, 0, y, z));
  for (const x of [-10, 0, 10]) scene.add(mesh(new THREE.BoxGeometry(0.25, 0.25, 11), truss, x, y, 0.5));

  // light gradient for beams
  const gt = canvasTex(4, 128);
  const gr = gt.ctx.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#000000');
  gt.ctx.fillStyle = gr; gt.ctx.fillRect(0, 0, 4, 128);

  const makeLamp = (lx, lz, target, color, intensity, beamOpacity = 0.07) => {
    const pos = new THREE.Vector3(lx, y - 0.4, lz);
    const can = mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.6, 16), std(0x111111, { metalness: 0.8 }), pos.x, pos.y, pos.z);
    can.lookAt(target); can.rotateX(Math.PI / 2);
    scene.add(can);
    const sl = new THREE.SpotLight(color, intensity, 40, 0.32, 0.6, 1);
    sl.position.copy(pos); sl.target.position.copy(target);
    scene.add(sl, sl.target);
    const len = pos.distanceTo(target);
    const geo = new THREE.ConeGeometry(Math.tan(0.3) * len, len, 32, 1, true);
    geo.translate(0, -len / 2, 0);
    const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, alphaMap: gt.tex, transparent: true, opacity: beamOpacity, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    beam.position.copy(pos);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), target.clone().sub(pos).normalize());
    scene.add(beam);
    const lens = mesh(new THREE.CircleGeometry(0.2, 16), new THREE.MeshBasicMaterial({ color, toneMapped: false }), 0, 0, 0);
    lens.position.copy(pos).add(target.clone().sub(pos).normalize().multiplyScalar(0.32));
    lens.lookAt(target);
    scene.add(lens);
    return { sl, beam, base: intensity, color: new THREE.Color(color) };
  };
  return makeLamp;
}

function buildProps() {
  // Sam's mystery prop table
  const t = new THREE.Group();
  t.position.set(-7.2, 0.25, -3.2);
  t.rotation.y = 0.5;
  scene.add(t);
  mesh(new THREE.BoxGeometry(2.4, 0.9, 1.1), std(0x6d0f2a, { roughness: 0.95 }), 0, 0.45, 0, t);
  mesh(new THREE.BoxGeometry(2.5, 0.05, 1.2), std(0x8a1435, { roughness: 0.95 }), 0, 0.92, 0, t);
  // trophy
  const gold = std(GOLD, { metalness: 1, roughness: 0.25 });
  mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.08, 16), gold, -0.8, 0.98, 0, t);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), gold, -0.8, 1.1, 0, t);
  mesh(new THREE.CylinderGeometry(0.17, 0.06, 0.26, 20), gold, -0.8, 1.32, 0, t);
  // rubber chicken
  const chick = std(0xffd400, { roughness: 0.5 });
  const cb = mesh(new THREE.CapsuleGeometry(0.06, 0.45, 4, 10), chick, -0.15, 1.0, 0.1, t);
  cb.rotation.z = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.07, 12, 10), chick, 0.17, 1.02, 0.1, t);
  mesh(new THREE.BoxGeometry(0.02, 0.06, 0.08), std(0xe0201c), 0.18, 1.1, 0.1, t);
  mesh(new THREE.ConeGeometry(0.025, 0.08, 8), std(0xff8a00), 0.25, 1.02, 0.1, t).rotation.z = -Math.PI / 2;
  // pie
  mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.07, 24), std(0xc58a3c), 0.55, 0.98, -0.2, t);
  mesh(new THREE.SphereGeometry(0.19, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xfff6ea, { roughness: 0.9 }), 0.55, 1.01, -0.2, t).scale.y = 0.4;
  // mystery box
  const q = canvasTex(128, 128);
  q.ctx.fillStyle = '#2de2e6'; q.ctx.fillRect(0, 0, 128, 128);
  q.ctx.fillStyle = '#0b0820'; q.ctx.font = '100px Bungee'; q.ctx.textAlign = 'center'; q.ctx.fillText('?', 64, 108);
  const box = mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), std(0xffffff, { map: q.tex }), 0.95, 1.16, 0.15, t);
  box.rotation.y = 0.4;
  // briefcase
  mesh(new THREE.BoxGeometry(0.5, 0.35, 0.12), std(0x3d2414, { roughness: 0.6 }), 0.2, 1.12, -0.35, t);

  // Rulette wheel
  const w = new THREE.Group();
  w.position.set(7.8, 0.25, -3.6);
  w.rotation.y = -0.55;
  scene.add(w);
  mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 10), std(0x333344, { metalness: 0.8 }), 0, 1.3, -0.15, w);
  mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.12, 24), std(0x1a1238, { metalness: 0.5 }), 0, 0.06, -0.15, w);
  const wt = canvasTex(512, 512);
  const cols = ['#ff3d8b', '#2de2e6', '#ffd23f', '#6a2cff', '#ff7a1a', '#1fd17a'];
  const labels = ['SING', 'MIME', 'POINTS', 'SWAP', '???', 'NO'];
  for (let i = 0; i < 12; i++) {
    wt.ctx.beginPath(); wt.ctx.moveTo(256, 256);
    wt.ctx.arc(256, 256, 250, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2);
    wt.ctx.fillStyle = cols[i % 6]; wt.ctx.fill();
    wt.ctx.save(); wt.ctx.translate(256, 256); wt.ctx.rotate(((i + 0.5) / 12) * Math.PI * 2);
    wt.ctx.fillStyle = '#0b0820'; wt.ctx.font = '26px Bungee'; wt.ctx.textAlign = 'right';
    wt.ctx.fillText(labels[i % 6], 235, 9); wt.ctx.restore();
  }
  wt.ctx.beginPath(); wt.ctx.arc(256, 256, 40, 0, Math.PI * 2); wt.ctx.fillStyle = '#0b0820'; wt.ctx.fill();
  wheel = mesh(new THREE.CircleGeometry(1.15, 64), new THREE.MeshStandardMaterial({ map: wt.tex, roughness: 0.4, emissive: 0xffffff, emissiveMap: wt.tex, emissiveIntensity: 0.25 }), 0, 2.6, 0, w);
  const rim = mesh(new THREE.TorusGeometry(1.17, 0.05, 8, 64), std(GOLD, { metalness: 1, roughness: 0.3 }), 0, 2.6, 0, w);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    mesh(new THREE.SphereGeometry(0.035, 8, 6), glow(0xffffff, 3), Math.cos(a) * 1.17, 2.6 + Math.sin(a) * 1.17, 0.05, w);
  }
  mesh(new THREE.ConeGeometry(0.1, 0.25, 3), std(0xffffff), 0, 3.85, 0.05, w).rotation.z = Math.PI;

  // studio cameras — the crew is always part of the show
  for (const [x, z, ry] of [[-8.5, 7.5, -1.0], [9, 7, 0.8], [1, 12.5, 0.05]]) {
    const cg = new THREE.Group();
    cg.position.set(x, 0, z); cg.rotation.y = Math.PI + ry;
    scene.add(cg);
    const metal = std(0x22222a, { metalness: 0.7, roughness: 0.4 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), metal, Math.cos(a) * 0.35, 0.75, Math.sin(a) * 0.35, cg);
      leg.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
    }
    mesh(new THREE.BoxGeometry(0.45, 0.45, 0.8), metal, 0, 1.75, 0, cg);
    mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.4, 16), std(0x0a0a0f, { metalness: 0.5 }), 0, 1.75, 0.55, cg).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.04, 8, 6), glow(0xff1030, 4), 0.15, 2.02, 0.3, cg);
    mesh(new THREE.BoxGeometry(0.06, 0.06, 0.8), metal, 0.2, 1.6, -0.7, cg).rotation.x = 0.4;
  }
}

function buildSamPodium(faceTo) {
  const g = new THREE.Group();
  g.position.set(SAM_SPOT.x, 0.25, SAM_SPOT.z);
  g.rotation.y = Math.atan2(faceTo.x - SAM_SPOT.x, faceTo.z - SAM_SPOT.z);
  scene.add(g);
  mesh(new THREE.BoxGeometry(1.15, 1.15, 0.6), std(0x0d0a1c, { roughness: 0.3, metalness: 0.6 }), 0, 0.575, 0, g);
  const topP = mesh(new THREE.BoxGeometry(1.3, 0.07, 0.75), std(GOLD, { metalness: 1, roughness: 0.3 }), 0, 1.18, 0.02, g);
  topP.rotation.x = 0.12;
  mesh(new THREE.BoxGeometry(1.17, 0.03, 0.62), glow(GOLD, 2), 0, 0.04, 0, g);
  const l = canvasTex(256, 256);
  l.ctx.fillStyle = '#0b0820'; l.ctx.fillRect(0, 0, 256, 256);
  l.ctx.textAlign = 'center';
  l.ctx.font = 'italic 64px Bungee'; l.ctx.fillStyle = '#ffd23f';
  l.ctx.shadowColor = '#ff3d8b'; l.ctx.shadowBlur = 0;
  l.ctx.fillStyle = '#ff3d8b'; l.ctx.fillText('GAME', 132, 116); l.ctx.fillText('CHANGER', 132, 186);
  l.ctx.fillStyle = '#ffd23f'; l.ctx.fillText('GAME', 128, 112); l.ctx.fillText('CHANGER', 128, 182);
  mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: l.tex, toneMapped: false }), 0, 0.6, 0.305, g);
  // Sam's cue cards
  const cards = mesh(new THREE.BoxGeometry(0.3, 0.03, 0.2), std(0xf5f0e0), 0.2, 1.24, 0.05, g);
  cards.rotation.set(0.12, 0.3, 0);
  const sh = mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.45, depthWrite: false }), 0, 0.012, -0.2, g);
  sh.rotation.x = -Math.PI / 2;
}

/* ---------- confetti ---------- */
function buildConfetti() {
  const N = 500;
  const geo = new THREE.PlaneGeometry(0.08, 0.14);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
  const im = new THREE.InstancedMesh(geo, mat, N);
  const palette = [PINK, CYAN, GOLD, 0xffffff, PURPLE].map((c) => new THREE.Color(c));
  const parts = [];
  for (let i = 0; i < N; i++) {
    im.setColorAt(i, palette[i % palette.length]);
    parts.push({ p: new THREE.Vector3(0, -50, 0), v: new THREE.Vector3(), r: new THREE.Euler(), s: Math.random() * 4 + 1 });
  }
  im.frustumCulled = false;
  scene.add(im);
  confetti = { im, parts, on: false, dummy: new THREE.Object3D() };
}
export function burstConfetti() {
  for (const q of confetti.parts) {
    q.p.set((Math.random() - 0.5) * 18, 10 + Math.random() * 6, (Math.random() - 0.5) * 10);
    q.v.set((Math.random() - 0.5) * 1.5, -Math.random() * 1.5 - 0.8, (Math.random() - 0.5) * 1.5);
  }
  confetti.on = true;
}

/* ---------- public API ---------- */
export async function initScene(canvas, cast, sam) {
  await Promise.all([document.fonts.load('80px Bungee'), document.fonts.load('600 40px Inter')]).catch(() => {});
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05030f);
  scene.fog = new THREE.Fog(0x05030f, 22, 48);
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0x6a5cff, 0x1a0820, 0.55));
  const key = new THREE.DirectionalLight(0xffeedd, 0.5);
  key.position.set(2, 8, 10);
  scene.add(key);

  buildStage();
  buildScreen();
  const lamp = buildRig();
  buildProps();

  const contestantFace = new THREE.Vector3(-2.5, 0, 9);
  const samFace = new THREE.Vector3(3.5, 0, 7.5);
  cast.forEach((c, i) => {
    const spot = CONTESTANT_SPOTS[i];
    const col = new THREE.Color(c.color).getHex();
    const p = makePodium(spot, contestantFace, col);
    p.lamp = lamp(spot.x + 0.5, spot.z + 3, new THREE.Vector3(spot.x, 1.2, spot.z - 0.3), col, 60);
    p.name = c.short; p.score = 0;
    drawPanel(p, c.short, 0, false);
    podiums.push(p);
    const a = makePerson(c.look);
    placeActor(c.id, a, spot, contestantFace);
    a.podium = p;
  });
  buildSamPodium(samFace);
  const s = makePerson(sam.look);
  placeActor('sam', s, SAM_SPOT, samFace);
  s.group.scale.setScalar(1.03);
  samLight = lamp(SAM_SPOT.x - 0.5, SAM_SPOT.z + 3, new THREE.Vector3(SAM_SPOT.x, 1.3, SAM_SPOT.z - 0.3), 0xfff1d6, 70);
  // wash over the screen + a center beam
  lamp(-4, -4, new THREE.Vector3(0, 0.3, 2.5), PURPLE, 35, 0.05);
  lamp(4, -4, new THREE.Vector3(1.5, 0.3, 3), PINK, 30, 0.05);

  buildConfetti();

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.75, 0.55, 0.72);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  setScreen({ mode: 'logo', body: 'The show where the game changes every episode' });
  resize();
  addEventListener('resize', resize);
  renderer.setAnimationLoop(tick);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 0.8 ? 58 : 45;
  camera.updateProjectionMatrix();
  setShot(currentShot, true);
}

let currentShot = 'wide';
export function setShot(name, keep) {
  currentShot = name;
  const portrait = camera.aspect < 0.8;
  const pull = Math.min(2.4, Math.max(1, 1.45 / camera.aspect));
  const a = actors[name];
  if (a) {
    const head = a.base.clone().setY(2.05);
    const side = new THREE.Vector3(a.facing.z, 0, -a.facing.x).multiplyScalar(name === 'sam' ? -0.6 : 0.6);
    const dist = portrait ? 3.6 : 3.0;
    shot.pos.copy(head).add(a.facing.clone().multiplyScalar(dist)).add(side).setY(2.2);
    shot.target.copy(head).add(new THREE.Vector3(0, portrait ? -0.25 : -0.1, 0));
  } else if (name === 'screen') {
    shot.pos.set(0, 4.4, portrait ? 7 : 4); shot.target.set(0, 4.9, -8.2);
  } else if (name === 'players') {
    shot.pos.set(-1, 3, 8.5 * Math.min(pull, 1.6)); shot.target.set(3.6, 1.6, 0);
  } else if (name === 'twist') {
    shot.pos.set(-1.5, 1.2, 9 * Math.min(pull, 1.5)); shot.target.set(0, 5.5, -6);
  } else if (name === 'intro') {
    shot.pos.set(0, 9, 26); shot.target.set(0, 4, 0);
  } else {
    shot.pos.set(0.4, 4.6, 14.5 * pull); shot.target.set(0.6, 3.1, 0);
  }
  if (keep === 'snap') { camPos.copy(shot.pos); camTarget.copy(shot.target); }
}

export function setSpeaker(id) { speaking = id; }
export function setActivePodium(i) {
  podiums.forEach((p, j) => drawPanel(p, p.name, p.score, j === i));
  podiums.forEach((p, j) => (p.lamp.sl.intensity = p.lamp.base * (i == null || i === j ? 1 : 0.35)));
}
export function setScore(i, score) {
  const p = podiums[i];
  p.score = score;
  drawPanel(p, p.name, score, false);
}
export function buzz(i, id) {
  const p = podiums[i];
  p.buzzT = 1;
  if (actors[id]) actors[id].buzz = 1;
}
export function twistFx() { twistT = 1; }
export function setTimer(v) { screen.data.timer = v; drawScreen(); }

/* ---------- loop ---------- */
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // camera with a little handheld drift
  const k = 1 - Math.pow(0.04, dt);
  camPos.lerp(shot.pos, k);
  camTarget.lerp(shot.target, k);
  camera.position.copy(camPos).add(new THREE.Vector3(Math.sin(t * 0.5) * 0.05, Math.sin(t * 0.7) * 0.04, 0));
  if (twistT > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * 0.12 * twistT, (Math.random() - 0.5) * 0.12 * twistT, 0));
  camera.lookAt(camTarget);

  for (const [id, a] of Object.entries(actors)) {
    const talking = speaking === id;
    a.talk += ((talking ? 1 : 0) - a.talk) * Math.min(1, dt * 8);
    const flap = talking ? (Math.sin(t * 17 + a.phase) * 0.5 + 0.5) * (Math.sin(t * 5.3) * 0.5 + 0.7) : 0;
    a.mouth.scale.y = 1 + flap * 3.5;
    a.head.rotation.y = Math.sin(t * 0.6 + a.phase) * 0.12 + a.talk * Math.sin(t * 2.1) * 0.15;
    a.head.rotation.x = Math.sin(t * 0.9 + a.phase) * 0.04 + a.talk * Math.sin(t * 3.3) * 0.06;
    a.head.position.y = 1.86 + Math.sin(t * 1.4 + a.phase) * 0.008;
    a.armL.rotation.x = -1.0 + a.talk * Math.sin(t * 3 + 1) * 0.35;
    if (a.buzz > 0) {
      a.buzz = Math.max(0, a.buzz - dt * 2.2);
      const b = a.buzz;
      a.armR.rotation.x = -1.0 - Math.sin(b * Math.PI) * 1.1;
      a.group.rotation.z = Math.sin(b * Math.PI) * 0.03;
    } else {
      a.armR.rotation.x = -1.0 + a.talk * Math.sin(t * 2.6) * 0.4;
    }
  }

  podiums.forEach((p) => {
    p.buzzT = Math.max(0, (p.buzzT || 0) - dt * 0.6);
    p.dome.material.emissiveIntensity = 0.15 + p.buzzT * 6 * (Math.sin(t * 30) > -0.3 ? 1 : 0.4);
    p.band.emissiveIntensity = 2.2 + p.buzzT * 4;
  });

  washLights.forEach((s, i) => (s.material.emissiveIntensity = 1.2 + Math.sin(t * 2 + i * 0.6) * 0.8));
  if (wheel) wheel.rotation.z += dt * (0.15 + twistT * 14);

  if (twistT > 0) {
    twistT = Math.max(0, twistT - dt * 0.35);
    const on = Math.sin(t * 22) > 0;
    washLights.forEach((s) => s.material.emissive.setHex(on ? 0xff1030 : 0xffffff));
    scene.background.setHex(on ? 0x1a0208 : 0x05030f);
    if (twistT === 0) {
      washLights.forEach((s, i) => s.material.emissive.setHex(i % 2 ? PINK : CYAN));
      scene.background.setHex(0x05030f);
    }
  }
  screen.sign.material.opacity = 0.85 + Math.sin(t * 3) * 0.1 + (Math.random() < 0.01 ? -0.5 : 0);

  if (confetti.on) {
    const { im, parts, dummy } = confetti;
    parts.forEach((q, i) => {
      q.p.addScaledVector(q.v, dt * 2);
      q.p.x += Math.sin(t * q.s + i) * dt * 0.6;
      if (q.p.y < 0.3) q.v.set(0, 0, 0);
      dummy.position.copy(q.p);
      dummy.rotation.set(t * q.s, t * q.s * 0.7, i);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
  }

  composer.render();
}
