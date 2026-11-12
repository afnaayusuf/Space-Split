import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Crate, Placement, Settings, Vehicle } from '../model/types';

// Scene units are metres; the plan is in millimetres.
export const M = (mm: number) => mm / 1000;

export interface Palette {
  paint: string; // tractor and trailer bodywork
  glass: string;
  dark: string; // bumper, chassis, hubs
  tyre: string;
  cover: string; // aero wheel covers
  floor: string;
  frame: string;
  edge: string;
  accent: string;
  mint: string;
  board: string; // cardboard
}

export const LIGHT: Palette = {
  paint: '#eceff2',
  glass: '#141b25',
  dark: '#2a3038',
  tyre: '#1e2227',
  cover: '#f3f5f7',
  floor: '#d3d9df',
  frame: '#a9b5c1',
  edge: '#7a8b9e',
  accent: '#1a8cff',
  mint: '#2bc79b',
  board: '#d9cdb3',
};

export const DARK: Palette = {
  ...LIGHT,
  paint: '#d3d8de',
  cover: '#dde2e7',
  floor: '#3a414b',
  frame: '#5d6b7a',
  edge: '#9fb3c8',
  board: '#bdb196',
};

/** Crate colours, one per crate layout: white and blues. */
export const CRATE_COLORS = ['#ffffff', '#2b8bff', '#d6e8ff', '#7cb7ff', '#eef2f6', '#1268d6', '#a9d0ff', '#5c9dff'];

/** Matte, so the even lighting draws the form without highlights. */
const mat = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

// ------------------------------------------------------------------ running gear

function wheel(p: Palette, r: number, w: number, covered: boolean): THREE.Group {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 36), mat(p.tyre));
  tyre.rotation.x = Math.PI / 2;
  // a flat aero cover, as on an electric tractor, or an open rim
  const fr = r * (covered ? 0.8 : 0.56);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(fr, fr, w + 0.03, 36), mat(covered ? p.cover : p.dark));
  face.rotation.x = Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.14, r * 0.14, w + 0.05, 16), mat(p.dark));
  hub.rotation.x = Math.PI / 2;
  g.add(tyre, face, hub);
  return g;
}

/** A pair of wheels on an axle at x (along the vehicle), centres a track apart. */
function axle(p: Palette, x: number, track: number, r = 0.5, dual = true, covered = true): THREE.Group {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const wh = wheel(p, r, dual ? 0.56 : 0.32, covered);
    wh.position.set(x, r, (side * track) / 2);
    g.add(wh);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, track, 10), mat(p.dark));
  beam.rotation.x = Math.PI / 2;
  beam.position.set(x, r, 0);
  g.add(beam);
  return g;
}

// ------------------------------------------------------------------ cabs

/** Side profile of a long-nosed electric tractor cab: u from the nose (m), y up (m). */
function semiCab(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.15, 0.5);
  s.lineTo(0.15, 1.3);
  s.quadraticCurveTo(0.2, 1.95, 0.55, 2.3); // the nose slopes up into the windscreen
  s.lineTo(1.6, 3.55); // the windscreen, raked back
  s.quadraticCurveTo(1.85, 3.85, 2.35, 3.88); // and curving into the roof
  s.lineTo(3.05, 3.9);
  s.quadraticCurveTo(3.35, 3.9, 3.4, 3.6);
  s.lineTo(3.4, 1.15);
  s.lineTo(0.95, 1.15);
  s.lineTo(0.5, 0.5);
  s.closePath();
  return s;
}

/** A cab-over cab for a rigid truck. */
function rigidCab(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.15, 0.5);
  s.lineTo(0.15, 1.2);
  s.quadraticCurveTo(0.2, 1.9, 0.45, 2.2);
  s.lineTo(0.95, 3.3);
  s.quadraticCurveTo(1.15, 3.55, 1.6, 3.58);
  s.lineTo(2.3, 3.6);
  s.quadraticCurveTo(2.55, 3.6, 2.6, 3.35);
  s.lineTo(2.6, 1.15);
  s.lineTo(0.9, 1.15);
  s.lineTo(0.5, 0.5);
  s.closePath();
  return s;
}

/** Points along a straight run then a quadratic curve of the profile, for the glass to follow. */
function sample(a: [number, number], b: [number, number], ctrl: [number, number], end: [number, number], n = 7): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const k = (1 - t) * (1 - t);
    const m = 2 * (1 - t) * t;
    const q = t * t;
    pts.push([k * b[0] + m * ctrl[0] + q * end[0], k * b[1] + m * ctrl[1] + q * end[1]]);
  }
  return pts;
}

/** A thin shell along part of the profile, between two offsets outward of it: the windscreen sweeping up into the roof. */
function glassBand(pts: [number, number][], inner: number, outer: number, W: number): THREE.BufferGeometry {
  const n = pts.length;
  const normal = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  });
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo : s.moveTo).call(s, p[0] + normal[i][0] * outer, p[1] + normal[i][1] * outer));
  for (let i = n - 1; i >= 0; i--) s.lineTo(pts[i][0] + normal[i][0] * inner, pts[i][1] + normal[i][1] * inner);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false }).translate(0, 0, -W / 2);
}

/**
 * The cab: the side profile extruded across the width with rounded edges, the
 * windscreen as a dark shell following the raked face up into the roof, side
 * windows carrying the glass round the corners, a light bar and a dark bumper.
 * `screen` is the windscreen run of the profile (start, end, roof control
 * point, roof end), `win` the side window (centre u, centre y, length, height).
 */
function cab(p: Palette, shape: THREE.Shape, nose: number, W: number, screen: [[number, number], [number, number], [number, number], [number, number]], win: [number, number, number, number]): THREE.Group {
  const g = new THREE.Group();
  const depth = W - 0.3;
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.14, bevelSegments: 5, curveSegments: 14 });
  geo.translate(0, 0, -depth / 2);
  const body = new THREE.Mesh(geo, mat(p.paint));
  body.position.x = nose;
  g.add(body);

  const glass = mat(p.glass);
  const ws = new THREE.Mesh(glassBand(sample(...screen), 0.11, 0.17, W - 0.14), glass);
  ws.position.x = nose;
  g.add(ws);
  for (const side of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(win[2], win[3], 0.05), glass);
    sw.position.set(nose + win[0], win[1], side * (W / 2 - 0.01));
    g.add(sw);
  }
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, W * 0.8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  light.position.set(nose - 0.004, 1.3, 0);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, W * 0.96), mat(p.dark));
  bumper.position.set(nose + 0.32, 0.6, 0);
  g.add(light, bumper);
  return g;
}

// ------------------------------------------------------------------ the vehicle

/**
 * The vehicle, with the load space cut away so the crates show: x runs from
 * the front wall of the load space (0) to the doors, in metres. An uploaded
 * `tractor` (already dressed and placed) stands in for the built-in one.
 */
export function buildVehicle(v: Vehicle, p: Palette, tractor?: THREE.Object3D | null): { group: THREE.Group; deck: number } {
  const built = vehicleParts(v, p, tractor);
  return { group: flatten(built.group), deck: built.deck };
}

/**
 * Merges a model's solid parts into one mesh per material, so the ~70 parts
 * of a truck draw in a handful of calls. See-through panels, lines and
 * anything clipped (an uploaded tractor) are kept as they are.
 */
function flatten(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const sets = new Map<string, { material: THREE.Material; parts: THREE.BufferGeometry[] }>();
  const done: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const mat = m.material as THREE.Material & { color?: THREE.Color };
    if (mat.transparent || mat.clippingPlanes?.length || !mat.color || (mat.type !== 'MeshLambertMaterial' && mat.type !== 'MeshBasicMaterial')) return;
    const key = `${mat.type}/${mat.color!.getHexString()}/${mat.side}`;
    let set = sets.get(key);
    if (!set) sets.set(key, (set = { material: mat, parts: [] }));
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    set.parts.push(geo);
    done.push(m);
  });
  const kept = new Set([...sets.values()].map((x) => x.material));
  for (const m of done) {
    m.removeFromParent();
    m.geometry.dispose();
    if (!kept.has(m.material as THREE.Material)) (m.material as THREE.Material).dispose();
  }
  for (const { material, parts } of sets.values()) {
    const merged = new THREE.Mesh(mergeGeometries(parts, false), material);
    parts.forEach((x) => x.dispose());
    root.add(merged);
  }
  return root;
}

function vehicleParts(v: Vehicle, p: Palette, tractor?: THREE.Object3D | null): { group: THREE.Group; deck: number } {
  const g = new THREE.Group();
  const L = M(v.L);
  const W = M(v.W);
  const H = M(v.H);
  // small trucks (Ace, pickups, 407) sit lower on smaller wheels, and their cab is drawn to scale
  const k = v.kind === 'rigid' ? Math.min(1, Math.max(0.55, (W + 0.1) / 2.5)) : 1;
  const deck = v.kind === 'rigid' ? 0.4 + 0.75 * k : 1.3;
  const track = Math.min(W, 2.5) - 0.35;
  const white = mat(p.paint);

  // the deck
  const floor = new THREE.Mesh(new THREE.BoxGeometry(L, 0.08, W + 0.06), mat(p.floor));
  floor.position.set(L / 2, deck - 0.04, 0);
  g.add(floor);
  const planks: number[] = [];
  for (let x = 0.4; x < L; x += 0.4) planks.push(x, deck + 0.002, -W / 2, x, deck + 0.002, W / 2);
  const plankGeo = new THREE.BufferGeometry();
  plankGeo.setAttribute('position', new THREE.Float32BufferAttribute(planks, 3));
  g.add(new THREE.LineSegments(plankGeo, new THREE.LineBasicMaterial({ color: p.frame, transparent: true, opacity: 0.35 })));

  // the load space as a cut-away: faint glass sides and front, no roof, a thin white frame with ribs
  const glass = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
  const panel = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glass);
    m.position.set(x, y, z);
    m.renderOrder = 2;
    g.add(m);
  };
  panel(L, H, 0.02, L / 2, deck + H / 2, W / 2 + 0.03);
  panel(L, H, 0.02, L / 2, deck + H / 2, -W / 2 - 0.03);
  panel(0.03, H, W + 0.06, -0.015, deck + H / 2, 0);
  const frame: number[] = [];
  const seg = (a: number[], b: number[]) => frame.push(...a, ...b);
  const z0 = -W / 2 - 0.03;
  const z1 = W / 2 + 0.03;
  const yT = deck + H;
  for (const z of [z0, z1]) {
    seg([0, yT, z], [L, yT, z]);
    const ribs = Math.max(1, Math.round(L / 1.2));
    for (let k = 0; k <= ribs; k++) seg([(k * L) / ribs, deck, z], [(k * L) / ribs, yT, z]);
  }
  seg([0, yT, z0], [0, yT, z1]);
  seg([L, yT, z0], [L, yT, z1]);
  const frameGeo = new THREE.BufferGeometry();
  frameGeo.setAttribute('position', new THREE.Float32BufferAttribute(frame, 3));
  g.add(new THREE.LineSegments(frameGeo, new THREE.LineBasicMaterial({ color: p.frame, transparent: true, opacity: 0.75 })));
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, H, 0.1), white);
    post.position.set(L, deck + H / 2, side * (W / 2 + 0.03));
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.1, H, 0.1), white);
    front.position.set(0, deck + H / 2, side * (W / 2 + 0.03));
    const top = new THREE.Mesh(new THREE.BoxGeometry(L, 0.08, 0.08), white);
    top.position.set(L / 2, yT, side * (W / 2 + 0.03));
    g.add(post, front, top);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, W + 0.16), white);
  header.position.set(L, yT, 0);
  g.add(header);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(L, 0.14, W), white);
  skirt.position.set(L / 2, deck - 0.15, 0);
  g.add(skirt);

  // chassis beams under the deck
  const chassisX0 = v.kind === 'rigid' ? M(v.front.x) - 1.3 * k : 0;
  const chassisLen = L - chassisX0;
  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(chassisLen, 0.22, 0.12), mat(p.dark));
    beam.position.set(chassisX0 + chassisLen / 2, deck - 0.25, side * 0.55);
    g.add(beam);
  }

  if (v.kind === 'semi' || v.kind === 'container') {
    // the trailer: axles round the rear bearing point, aero side skirts, landing legs
    const rx = M(v.rear.x);
    const n = v.kind === 'semi' ? 3 : 2;
    for (let i = 0; i < n; i++) g.add(axle(p, rx + (i - (n - 1) / 2) * 1.31, track));
    const sx0 = 2.2;
    const sx1 = rx - 2.1;
    if (sx1 - sx0 > 1)
      for (const side of [-1, 1]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(sx1 - sx0, deck - 0.6, 0.05), white);
        s.position.set((sx0 + sx1) / 2, (deck - 0.15 + 0.45) / 2, side * (W / 2 - 0.06));
        g.add(s);
      }
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, deck - 0.3, 0.12), mat(p.dark));
      leg.position.set(M(v.front.x) + 1.6, (deck - 0.3) / 2 + 0.05, side * 0.9);
      g.add(leg);
    }

    if (tractor) {
      g.add(tractor);
      return { group: g, deck };
    }
    // the tractor: nose well ahead of the kingpin, steer axle under the nose, drive axles under the kingpin
    const kx = M(v.front.x);
    const nose = kx - 5.65;
    const t = new THREE.Group();
    for (const side of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.24, 0.12), mat(p.dark));
      beam.position.set(kx - 2.2, 0.95, side * 0.5);
      t.add(beam);
    }
    t.add(axle(p, nose + 1.45, track, 0.5, false), axle(p, kx - 0.65, track), axle(p, kx + 0.65, track));
    const fifth = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 24), mat(p.dark));
    fifth.position.set(kx, deck - 0.36, 0);
    t.add(fifth);
    t.add(cab(p, semiCab(), nose, 2.5, [[0.55, 2.3], [1.6, 3.55], [1.85, 3.85], [2.35, 3.88]], [2.35, 3.0, 1.4, 0.8]));
    // fairings between the cab and the drive wheels
    const fx0 = nose + 3.4;
    const fx1 = kx - 1.3;
    if (fx1 - fx0 > 0.3)
      for (const side of [-1, 1]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(fx1 - fx0, 0.62, 0.06), white);
        f.position.set((fx0 + fx1) / 2, 0.8, side * 1.13);
        t.add(f);
      }
    g.add(t);
  } else {
    // rigid truck: the cab on the same chassis, front axle under it; one rear axle on the small ones, two from 24 ft
    const r = 0.5 * k;
    const nose = M(v.front.x) - 1.35 * k;
    g.add(axle(p, M(v.front.x), track, r, false));
    if (v.L >= 7000) g.add(axle(p, M(v.rear.x) - 0.65, track, r), axle(p, M(v.rear.x) + 0.65, track, r));
    else g.add(axle(p, M(v.rear.x), track, r, k > 0.8));
    const c = cab(p, rigidCab(), 0, 2.45, [[0.45, 2.2], [0.95, 3.3], [1.15, 3.55], [1.6, 3.58]], [1.9, 2.75, 1.2, 0.8]);
    c.scale.setScalar(k);
    c.position.x = nose;
    g.add(c);
  }
  return { group: g, deck };
}

/** A soft shadow on the ground under whatever stands on it: a gradient, not a light. */
export function contactShadow(L: number, W: number, opacity: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d')!;
  const grd = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(L, W).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false }));
  m.renderOrder = -1;
  return m;
}

// ------------------------------------------------------------------ crates

/** The crate number painted on the lid: one small texture per number and ink, kept for the page's life. */
const numbers = new Map<string, THREE.CanvasTexture>();
export function numberTexture(no: number, dark: boolean): THREE.CanvasTexture {
  const key = `${no}/${dark ? 1 : 0}`;
  let t = numbers.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = dark ? '#ffffff' : '#11161d';
  x.font = '600 66px Urbanist, Inter, system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(String(no), 64, 68);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  numbers.set(key, t);
  return t;
}

export interface CrateMesh {
  group: THREE.Group;
  body: THREE.Mesh;
  edges: THREE.LineSegments;
  label: THREE.Mesh;
}

/** A closed crate of the given outer size (as placed), centred on its group's origin. */
export function buildCrate(no: number, L: number, W: number, H: number, color: string, p: Palette): CrateMesh {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(M(L), M(H), M(W));
  const body = new THREE.Mesh(geo, mat(color, { transparent: true, opacity: 1 }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: p.edge, transparent: true, opacity: 0.9 }));
  const dark = ['#2b8bff', '#1268d6', '#5c9dff'].includes(color);
  const size = Math.min(M(L), M(W)) * 0.5;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: numberTexture(no, dark), transparent: true, depthWrite: false }));
  label.rotation.x = -Math.PI / 2;
  label.position.y = M(H) / 2 + 0.003;
  g.add(body, edges, label);
  return { group: g, body, edges, label };
}

/** The tag that floats over a square when the crate is pulled apart: its packing order and how many gaskets it carries. */
export function squareTag(no: number, pieces: number, accent: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = 'rgba(255,255,255,0.92)';
  x.beginPath();
  x.roundRect(8, 8, 240, 112, 28);
  x.fill();
  x.fillStyle = accent;
  x.font = '600 64px Urbanist, Inter, system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(String(no), 70, 64);
  x.fillStyle = '#11161d';
  x.font = '500 30px Urbanist, Inter, system-ui, sans-serif';
  x.textAlign = 'left';
  x.fillText(`${pieces} pcs`, 118, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  sp.scale.set(0.5, 0.25, 1);
  sp.renderOrder = 20;
  return sp;
}

/** An open crate for the crate view: skid base and floor, four see-through sides, no lid. */
export function buildOpenCrate(c: Crate, s: Settings, p: Palette): THREE.Group {
  const g = new THREE.Group();
  const L = M(c.outer.L);
  const W = M(c.outer.W);
  const H = M(c.outer.H);
  const wood = mat('#d8c7a3');
  const skid = c.skid ?? s.skid;
  const base = new THREE.Mesh(new THREE.BoxGeometry(L, M(Math.max(skid, c.board ?? s.board)), W), wood);
  base.position.y = -H / 2 + M(Math.max(skid, c.board ?? s.board)) / 2;
  g.add(base);
  const side = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
  const b = M(c.board ?? s.board);
  const wallH = H - M(skid);
  const y = -H / 2 + M(skid) + wallH / 2;
  const walls: [number, number, number, number][] = [
    [L, b, 0, W / 2 - b / 2],
    [L, b, 0, -W / 2 + b / 2],
    [b, W, L / 2 - b / 2, 0],
    [b, W, -L / 2 + b / 2, 0],
  ];
  for (const [w, d, x, z] of walls) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), side);
    m.position.set(x, y, z);
    m.renderOrder = 2;
    g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, wallH, d)), new THREE.LineBasicMaterial({ color: p.edge, transparent: true, opacity: 0.7 }));
    e.position.copy(m.position);
    g.add(e);
  }
  return g;
}

/** Centre of a placement in the scene, given the vehicle and the deck height. */
export function placeAt(p: Placement, v: Vehicle, deck: number): THREE.Vector3 {
  return new THREE.Vector3(M(p.x + p.L / 2), deck + M(p.z + p.H / 2), M(v.W / 2 - (p.y + p.W / 2)));
}
