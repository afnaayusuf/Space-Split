import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Crate, Load, Settings } from '../model/types';
import { Contents, LoadXray, ShapeCache, type SquareProxy } from './contents';
import { dressTruck } from './custom';
import { buildCrate, buildOpenCrate, buildVehicle, contactShadow, CRATE_COLORS, DARK, LIGHT, M, placeAt, squareTag, type CrateMesh, type Palette } from './models';

export type ViewName = '3d' | 'side' | 'top' | 'rear';

interface Shown {
  id: string;
  step: number;
  mesh: CrateMesh;
  home: THREE.Vector3;
  full: Contents | null; // every square on its own, lifted out when the crate is picked
  out: boolean;
  turned: boolean;
  crate: Crate;
}

interface Tween {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t0: number;
  ms: number;
  done?: () => void;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
/** Order tags are drawn on crates with up to this many squares; more would hide one another. */
const TAGGED = 40;
/** Pixels drawn per CSS pixel, at most: sharp on a laptop, a quarter of the work of 3× on a phone. */
const MAX_DPR = 1.5;

/**
 * One WebGL context for the whole page. Only one 3D view is on screen at a
 * time, so each view borrows it rather than opening (and later throwing away)
 * a context of its own, which is slow and holds GPU memory.
 */
let shared: THREE.WebGLRenderer | null = null;
let borrowed = false;
function takeRenderer(): { renderer: THREE.WebGLRenderer; own: boolean } {
  if (shared && !borrowed) {
    borrowed = true;
    return { renderer: shared, own: false };
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.localClippingEnabled = true; // an uploaded truck model is clipped to its tractor
  if (!shared) {
    shared = renderer;
    borrowed = true;
    return { renderer, own: false };
  }
  return { renderer, own: true };
}

/**
 * The 3D view. One per canvas: either a vehicle with its load (`showLoad`) or
 * one open crate with its stacks (`showCrate`). Lit evenly, with no cast
 * shadows or highlights, so it reads like a drawing.
 *
 * It draws only when something changes — the camera moves, a crate is picked,
 * an animation runs — and is idle otherwise.
 */
export class Stage {
  private renderer: THREE.WebGLRenderer;
  private ownRenderer: boolean;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 1200);
  private controls: OrbitControls;
  private root = new THREE.Group();
  private shapes = new ShapeCache();
  private shown: Shown[] = [];
  private cogMarks = new THREE.Group();
  private shadow: THREE.Mesh | null = null;
  private frame = 0;
  private fly: { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; fov0: number; fov1: number; t0: number; ms: number } | null = null;
  private drop: { obj: THREE.Object3D; home: THREE.Vector3; t0: number } | null = null;
  private tweens: Tween[] = [];
  /** Instanced contents that move while tweens run, and need their instances moved with them. */
  private live = new Set<Contents>();
  /** The whole load's X-ray, one set of instanced meshes; built when first asked for. */
  private xrayMesh: LoadXray | null = null;
  private holder: THREE.Group | null = null;
  private deckL = 0;
  private size = new THREE.Vector3(14, 4, 3);
  private centre = new THREE.Vector3(0, 2, 0);
  private view: ViewName = '3d';
  private palette: Palette = LIGHT;
  private dark = false;
  private xray = false;
  private selected: string | null = null;
  private step = Infinity;
  /** The open crate's contents and its squares' tags, and how far apart they are pulled. */
  private open: Contents | null = null;
  private tags: THREE.Sprite[] = [];
  private explode = 0;
  private ro: ResizeObserver;
  private down = { x: 0, y: 0 };
  private disposed = false;
  private settings: Settings | null = null;
  private colorOf: (line: string) => string = () => '#9aa';
  private cogOn = true;
  private onDown = (e: PointerEvent) => (this.down = { x: e.clientX, y: e.clientY });
  private onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) return;
    this.onPick(this.pick(e.clientX, e.clientY));
  };

  constructor(
    private host: HTMLElement,
    private onPick: (crate: string | null) => void = () => undefined,
  ) {
    ({ renderer: this.renderer, own: this.ownRenderer } = takeRenderer());
    const el = this.renderer.domElement;
    host.appendChild(el);
    el.className = 'stage-canvas';
    // for measuring: triangles and draw calls of the last frame
    (el as HTMLCanvasElement & { stats?: () => object }).stats = () => ({
      tris: this.renderer.info.render.triangles,
      calls: this.renderer.info.render.calls,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      frames: this.frames,
    });
    // for measuring: milliseconds per frame, drawing n frames back to back while the camera turns
    (el as HTMLCanvasElement & { bench?: (n: number) => number }).bench = (n: number) => {
      const gl = this.renderer.getContext();
      const px = new Uint8Array(4);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        this.camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.02);
        this.camera.lookAt(this.controls.target);
        this.renderer.render(this.scene, this.camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // wait for the GPU
      }
      return (performance.now() - t0) / n;
    };

    // even light: sky and ground, ambient, a soft key so the faces differ a little — white reads white, no glare
    // (matte surfaces return light ÷ π, so a white top needs the intensities to add up to about π)
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#c9d0d8', 1.6));
    this.scene.add(new THREE.AmbientLight('#ffffff', 1.3));
    const key = new THREE.DirectionalLight('#ffffff', 0.9);
    key.position.set(-4, 10, 6);
    const fill = new THREE.DirectionalLight('#ffffff', 0.35);
    fill.position.set(6, 4, -5);
    this.scene.add(key, fill, this.root);

    this.controls = new OrbitControls(this.camera, el);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 400;
    this.controls.addEventListener('start', () => (this.fly = null));
    this.controls.addEventListener('change', () => this.invalidate());

    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  private frames = 0;

  /** Asks for one frame; frames keep coming only while something moves. */
  invalidate() {
    if (!this.frame && !this.disposed) this.frame = requestAnimationFrame(this.tick);
  }

  setTheme(dark: boolean) {
    this.dark = dark;
    this.palette = dark ? DARK : LIGHT;
    if (this.shadow) (this.shadow.material as THREE.MeshBasicMaterial).opacity = dark ? 0.3 : 0.14;
    this.invalidate();
  }

  // ---------------------------------------------------------------- content

  private clear() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (o instanceof Contents || o instanceof LoadXray) o.dispose();
      if (m.geometry && !m.userData.shared) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) {
        const map = (mat as THREE.MeshBasicMaterial).map;
        if (map && !map.userData.shared) map.dispose();
        mat.dispose();
      }
    });
    this.root.clear();
    this.shown = [];
    this.open = null;
    this.tags = [];
    this.live.clear();
    this.xrayMesh = null;
    this.holder = null;
    this.cogMarks = new THREE.Group();
    this.shadow = null;
    this.drop = null;
    this.tweens = [];
  }

  /** Moves an object to `to` over `ms`, replacing any move it was already making. */
  private tween(obj: THREE.Object3D, to: THREE.Vector3, ms: number, done?: () => void) {
    this.tweens = this.tweens.filter((t) => t.obj !== obj);
    this.tweens.push({ obj, from: obj.position.clone(), to, t0: performance.now(), ms, done });
    this.invalidate();
  }

  private ground(L: number, W: number, x: number) {
    this.shadow = contactShadow(L, W, this.dark ? 0.3 : 0.14);
    this.shadow.position.set(x, 0.004, 0);
    this.root.add(this.shadow);
  }

  /** A vehicle and its load. Crates are coloured by layout; `step` hides those not yet loaded. An uploaded `truck` replaces the built-in tractor. */
  showLoad(load: Load | null, vehicle: Load['vehicle'], crates: Map<string, Crate>, s: Settings, colorOf: (line: string) => string, truck: THREE.Object3D | null = null) {
    this.clear();
    const tractor = truck && vehicle.kind !== 'rigid' ? dressTruck(truck, this.palette, s.truckTurn, M(vehicle.front.x)) : null;
    const { group, deck } = buildVehicle(vehicle, this.palette, tractor);
    const L = M(vehicle.L);
    const holder = new THREE.Group();
    holder.position.x = -L / 2;
    holder.add(group);
    this.root.add(holder);
    this.holder = holder;
    const colors = new Map<string, string>();
    for (const c of crates.values()) if (!colors.has(c.name)) colors.set(c.name, CRATE_COLORS[colors.size % CRATE_COLORS.length]);

    for (const p of load?.placed ?? []) {
      const c = crates.get(p.crate);
      if (!c) continue;
      const mesh = buildCrate(c.no, p.L, p.W, p.H, colors.get(c.name)!, this.palette);
      const home = placeAt(p, vehicle, deck);
      mesh.group.position.copy(home);
      mesh.body.userData.crate = c.id;
      holder.add(mesh.group);
      this.shown.push({ id: c.id, step: p.step, mesh, home, full: null, out: false, turned: p.turned, crate: c });
    }
    this.buildCog(load, vehicle, deck);
    holder.add(this.cogMarks);
    this.cogMarks.visible = this.cogOn;
    const front = vehicle.kind === 'rigid' ? 3.5 : 6.5;
    this.ground(L + front + 3, M(vehicle.W) + 3, -front / 2 + 0.6);

    this.deckL = L;
    this.size.set(L + front + 1.5, M(vehicle.H) + deck + 1, Math.max(M(vehicle.W), 2.6));
    this.centre.set(-front / 2 + 0.5, (deck + M(vehicle.H)) / 2, 0);
    this.settings = s;
    this.colorOf = colorOf;
    this.applyXray();
    this.applySelection();
    this.setStep(this.step === Infinity ? Infinity : this.step, false);
    this.invalidate();
  }

  /** One crate, open, every cardboard layer with its gaskets, coloured by line; the squares can be pulled apart. */
  showCrate(c: Crate, s: Settings, colorOf: (line: string) => string) {
    this.clear();
    const g = new THREE.Group();
    const H = M(c.outer.H);
    g.position.y = H / 2;
    g.add(buildOpenCrate(c, s, this.palette));
    const contents = new Contents(c, s, colorOf, this.palette, this.shapes);
    g.add(contents);
    this.open = contents;
    this.live.add(contents);
    // the crate's centre of gravity: a pin through the load
    const blue = new THREE.MeshBasicMaterial({ color: this.palette.accent, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    const gx = M(c.cog.x);
    const gz = -M(c.cog.y);
    const gy = -H / 2 + M(c.cog.z);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10), blue);
    dot.position.set(gx, gy, gz);
    dot.renderOrder = 10;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, H + 0.25, 6), blue);
    stem.position.set(gx, 0.125, gz);
    stem.renderOrder = 10;
    g.add(dot, stem);
    // order tags only where they can be read: a crate of hundreds of small squares would be a wall of them
    if (contents.squares.length <= TAGGED)
      for (const sq of contents.squares) {
        const tag = squareTag(sq.userData.index + 1, sq.userData.pieces, this.palette.accent);
        this.tags.push(tag);
        g.add(tag);
      }
    this.root.add(g);
    this.ground(M(c.outer.L) * 2.2, M(c.outer.W) * 2.2, 0);
    this.frameCrate(c);
    this.layoutSquares();
    this.invalidate();
  }

  private frameCrate(c: Crate) {
    const H = M(c.outer.H);
    const tiers = Math.max(0, ...(this.open?.squares ?? []).map((s) => s.userData.tier));
    const lift = this.explode * (0.3 + 0.5 * tiers + 0.6);
    const spread = 1 + this.explode * 0.45;
    this.size.set(M(c.outer.L) * 1.6 * spread, H * 1.6 + lift, M(c.outer.W) * 1.6 * spread);
    this.centre.set(0, H * 0.4 + lift * 0.45, 0);
  }

  /** Pulls the squares of the open crate apart (0 = packed, 1 = fully apart) and floats a tag over each. */
  setExplode(f: number, c?: Crate) {
    const was = this.explode;
    this.explode = f;
    this.layoutSquares();
    if (c && Math.abs(was - f) > 1e-6) {
      this.frameCrate(c);
      this.setView(this.view);
    }
    this.invalidate();
  }

  private layoutSquares() {
    if (!this.open) return;
    const f = this.explode;
    this.open.squares.forEach((sq, i) => {
      const at = sq.userData.home.clone();
      at.x *= 1 + f * 0.45;
      at.z *= 1 + f * 0.45;
      at.y += f * (0.3 + 0.5 * sq.userData.tier);
      sq.userData.at = at;
      sq.position.copy(at);
      const tag = this.tags[i];
      if (tag) {
        tag.position.set(at.x, at.y + M(sq.userData.h) + 0.2, at.z);
        tag.visible = f > 0.01;
      }
    });
    this.open.sync();
  }

  private buildCog(load: Load | null, v: Load['vehicle'], deck: number) {
    if (!load || !load.placed.length) return;
    const x = M(load.cog.x);
    const z = M(v.W / 2 - load.cog.y);
    const y = deck + M(load.cog.z);
    // drawn last and through everything, so the pin shows inside a full load
    const blue = new THREE.MeshBasicMaterial({ color: this.palette.accent, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 12), blue);
    dot.position.set(x, y, z);
    dot.renderOrder = 10;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 12), new THREE.MeshBasicMaterial({ color: this.palette.accent, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false }));
    halo.position.copy(dot.position);
    halo.renderOrder = 9;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, y - deck + 0.6, 6), blue);
    stem.position.set(x, (y + deck - 0.6) / 2 + 0.3, z);
    stem.renderOrder = 10;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 32), new THREE.MeshBasicMaterial({ color: this.palette.accent, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, deck + 0.01, z);
    // the ideal point: a line across the deck
    const t = M(load.target);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, M(v.W)), new THREE.MeshBasicMaterial({ color: this.palette.mint }));
    line.position.set(t, deck + 0.006, 0);
    this.cogMarks.add(halo, dot, stem, ring, line);
  }

  setCog(on: boolean) {
    this.cogOn = on;
    this.cogMarks.visible = on;
    this.invalidate();
  }

  // ---------------------------------------------------------------- state

  /** Shows crates loaded up to step n (all when n is Infinity); the newest drops in. */
  setStep(n: number, animate = true) {
    const prev = this.step;
    this.step = n;
    for (const it of this.shown) {
      it.mesh.group.visible = it.step <= n;
      it.mesh.group.position.copy(it.home);
    }
    if (animate && n !== Infinity && n > prev) {
      const it = this.shown.find((x) => x.step === n);
      if (it) this.drop = { obj: it.mesh.group, home: it.home, t0: performance.now() };
    }
    this.xrayMesh?.setStep(n);
    this.invalidate();
  }

  setXray(on: boolean) {
    this.xray = on;
    this.applyXray();
    this.invalidate();
  }

  private applyXray() {
    if (this.xray && !this.xrayMesh && this.settings && this.holder && this.shown.length) {
      this.xrayMesh = new LoadXray(
        this.shown.map((it) => ({ crate: it.crate, at: it.home, turned: it.turned, step: it.step })),
        this.settings,
        this.colorOf,
        this.palette,
        this.shapes,
      );
      this.holder.add(this.xrayMesh);
      this.shown.forEach((it, i) => this.xrayMesh!.setHidden(this.xrayIndex(i), it.out));
    }
    if (this.xrayMesh) {
      this.xrayMesh.visible = this.xray;
      this.xrayMesh.setStep(this.step);
    }
    for (const it of this.shown) this.dressBody(it);
  }

  /** A crate's place in the X-ray, which orders crates by loading step. */
  private xrayIndex(i: number) {
    const step = this.shown[i].step;
    return this.shown.filter((x) => x.step < step).length;
  }

  /** The crate body: solid, or see-through when the load is X-rayed or the crate's stacks are lifted out; blue edges when picked. */
  private dressBody(it: Shown) {
    const on = it.id === this.selected;
    const clear = this.xray || (on && it.out);
    const mat = it.mesh.body.material as THREE.MeshLambertMaterial;
    mat.opacity = clear ? 0.12 : 1;
    mat.depthWrite = !clear;
    mat.emissive.set(on ? this.palette.accent : '#000000');
    mat.emissiveIntensity = on ? (clear ? 0.12 : 0.35) : 0;
    it.mesh.label.visible = !clear;
    (it.mesh.edges.material as THREE.LineBasicMaterial).color.set(on ? this.palette.accent : this.palette.edge);
  }

  /** Picks a crate: its stacks lift out and hover over it, and the camera closes in. `null` puts them back and returns to the set view. */
  select(id: string | null) {
    const was = this.selected;
    this.selected = id;
    this.applySelection();
    if (id !== was) {
      const it = id ? this.shown.find((s) => s.id === id) : null;
      if (it) this.flyToCrate(it);
      else if (was && this.shown.length) this.setView(this.view);
    }
    this.invalidate();
  }

  private applySelection() {
    for (const it of this.shown) {
      if (it.id === this.selected) this.liftOut(it);
      else if (it.out) this.putBack(it);
      this.dressBody(it);
    }
  }

  /** The picked crate's squares rise out of it, each with its order tag, and hang in the air above in their layout, a little spread. */
  private liftOut(it: Shown) {
    if (!this.settings || it.out) return;
    if (!it.full) {
      const full = new Contents(it.crate, this.settings, this.colorOf, this.palette, this.shapes);
      if (it.turned) full.rotation.y = Math.PI / 2;
      if (full.squares.length <= TAGGED)
        for (const sq of full.squares) {
          const tag = squareTag(sq.userData.index + 1, sq.userData.pieces, this.palette.accent);
          tag.scale.set(0.42, 0.21, 1);
          tag.position.copy(sq.position).y += M(sq.userData.h) + 0.1;
          tag.visible = false;
          sq.userData.tag = tag;
          full.add(tag);
        }
      it.mesh.group.add(full);
      it.full = full;
    }
    const full = it.full;
    it.out = true;
    full.visible = true;
    this.live.add(full);
    this.xrayMesh?.setHidden(this.xrayIndex(this.shown.indexOf(it)), true);
    const H = M(it.crate.outer.H);
    for (const sq of full.squares) {
      const home = sq.userData.home;
      const to = new THREE.Vector3(home.x * 1.2, home.y + H + 0.1 + sq.userData.tier * 0.3, home.z * 1.2);
      this.tween(sq, to, 700);
      const tag = sq.userData.tag;
      if (tag) {
        tag.visible = true;
        this.tween(tag, to.clone().setY(to.y + M(sq.userData.h) + 0.1), 700);
      }
    }
  }

  /** The squares settle back into the crate, then the crate closes. */
  private putBack(it: Shown) {
    const full = it.full;
    if (!full || !it.out) return;
    it.out = false;
    full.squares.forEach((sq: SquareProxy, i) => {
      if (sq.userData.tag) sq.userData.tag.visible = false;
      this.tween(sq, sq.userData.home.clone(), 550, i === full.squares.length - 1 ? () => {
        if (it.out) return;
        full.visible = false;
        this.live.delete(full);
        this.xrayMesh?.setHidden(this.xrayIndex(this.shown.indexOf(it)), false);
        this.invalidate();
      } : undefined);
    });
  }

  /** Closes in on a crate from the direction the camera is already looking, far enough to take the crate and its lifted stacks. */
  private flyToCrate(it: Shown) {
    const H = M(it.crate.outer.H);
    const tiers = Math.max(0, ...it.crate.groups.map((pg) => (pg.z > 1e-6 ? 1 : 0)));
    const target = it.home.clone();
    target.x -= this.deckL / 2;
    target.y += H * 0.7 + 0.3;
    const span = Math.max(M(it.crate.outer.L), M(it.crate.outer.W)) * 1.3 + H * (2 + tiers) + 0.6;
    const dist = (span / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.1;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.y < 0.3) dir.y = 0.3;
    dir.normalize();
    this.fly = { from: this.camera.position.clone(), to: target.clone().add(dir.multiplyScalar(dist)), fromT: this.controls.target.clone(), toT: target, fov0: this.camera.fov, fov1: this.camera.fov, t0: performance.now(), ms: 650 };
    this.invalidate();
  }

  private pick(cx: number, cy: number): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
    const hits = ray.intersectObjects(
      this.shown.filter((s) => s.mesh.group.visible).map((s) => s.mesh.body),
      false,
    );
    return (hits[0]?.object.userData.crate as string | undefined) ?? null;
  }

  // ---------------------------------------------------------------- camera

  /** Moves the camera to one of the set views of what is shown. */
  setView(v: ViewName, instant = false) {
    this.view = v;
    const c = this.centre.clone();
    const sx = this.size.x;
    const sy = this.size.y;
    const sz = this.size.z;
    const aspect = this.camera.aspect || 1.6;
    // the flat views use a long lens from far off, so they read like drawings
    const fov = v === '3d' ? 32 : 10;
    const fit = (span: number) => (span / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2))) * 1.1;
    let pos: THREE.Vector3;
    if (v === 'side') pos = c.clone().add(new THREE.Vector3(0, sy * 0.05, fit(Math.max(sx / aspect, sy)) + sz / 2));
    else if (v === 'top') pos = c.clone().add(new THREE.Vector3(0, fit(Math.max(sx / aspect, sz)) + sy, 0.004));
    else if (v === 'rear') pos = c.clone().add(new THREE.Vector3(sx / 2 + fit(Math.max(sz / aspect, sy) * 1.3), sy * 0.06, 0));
    else {
      const d = fit(Math.max(sx / aspect, sy)) * 1.02;
      pos = c.clone().add(new THREE.Vector3(d * 0.5, d * 0.44, d * 0.74));
    }
    if (instant) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(pos);
      this.controls.target.copy(c);
      this.fly = null;
      this.controls.update();
    } else this.fly = { from: this.camera.position.clone(), to: pos, fromT: this.controls.target.clone(), toT: c, fov0: this.camera.fov, fov1: fov, t0: performance.now(), ms: 700 };
    this.invalidate();
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  /** PNG of the current view. */
  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  /** One frame: step the animations, draw, and ask for another only while something is still moving. */
  private tick = () => {
    this.frame = 0;
    if (this.disposed) return;
    const now = performance.now();
    let moving = false;
    if (this.fly) {
      const t = Math.min(1, (now - this.fly.t0) / this.fly.ms);
      const k = ease(t);
      this.camera.position.lerpVectors(this.fly.from, this.fly.to, k);
      this.controls.target.lerpVectors(this.fly.fromT, this.fly.toT, k);
      // keep the framing steady while the lens changes: distance and field of view move together
      this.camera.fov = this.fly.fov0 + (this.fly.fov1 - this.fly.fov0) * k;
      this.camera.updateProjectionMatrix();
      if (t >= 1) this.fly = null;
      moving = true;
    }
    if (this.drop) {
      const t = Math.min(1, (now - this.drop.t0) / 420);
      const { obj, home } = this.drop;
      obj.position.copy(home);
      obj.position.y += (1 - ease(t)) * 0.9;
      obj.position.x += (1 - ease(t)) * 0.6;
      if (t >= 1) this.drop = null;
      moving = true;
    }
    if (this.tweens.length) {
      const left: Tween[] = [];
      for (const tw of this.tweens) {
        const t = Math.min(1, (now - tw.t0) / tw.ms);
        tw.obj.position.lerpVectors(tw.from, tw.to, ease(t));
        if (t >= 1) tw.done?.();
        else left.push(tw);
      }
      this.tweens = left;
      for (const c of this.live) if (c.visible) c.sync();
      moving = true;
    }
    // with damping the camera glides on after the mouse lets go: keep drawing until it stops
    if (this.controls.update()) moving = true;
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (moving || this.fly || this.drop || this.tweens.length) this.invalidate();
  };

  dispose() {
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.ro.disconnect();
    this.clear();
    this.shapes.dispose();
    this.controls.dispose();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointerup', this.onUp);
    el.remove();
    if (this.ownRenderer) this.renderer.dispose();
    else {
      // hand the shared context back clean: no leftover programs or buffers from this view
      this.renderer.renderLists.dispose();
      borrowed = false;
    }
  }
}
