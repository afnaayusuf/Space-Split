import * as THREE from 'three';
import type { Crate, Settings } from '../model/types';
import { M, type Palette } from './models';

/**
 * What is inside the crates, drawn with instancing: every gasket of one size
 * is one copy of a single ring shape, every cardboard layer one copy of a
 * single box, so twenty thousand gaskets are a few dozen draw calls.
 *
 * Detail: `layers` draws each gasket on its own cardboard; past a few
 * thousand gaskets (and for the X-ray of a whole load) `stacks` draws each
 * stack as one ring through its cardboard, which looks the same at a glance.
 */

/** Gaskets in one crate drawn one by one, at most. */
const MAX_RINGS = 3000;

/** Ring and board shapes, shared by everything on the stage: built once, kept until the stage goes. */
export class ShapeCache {
  private rings = new Map<string, THREE.BufferGeometry>();
  readonly box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0); // stands on y = 0
  readonly sheet = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 1, 0); // a top face, 1 m up

  /**
   * A ring of the given diameters (mm, rounded to 2 mm), 1 m deep, standing
   * on y = 0. Fewer sides for small rings, and fewer again for the X-ray of a
   * whole load, where each ring is a few pixels across.
   */
  ring(od: number, bore: number, coarse = false): { geometry: THREE.BufferGeometry; scale: number } {
    if (coarse) {
      // one ring 1 m across per bore-to-OD ratio (in 2 % steps), scaled to size: a whole load's X-ray is a few dozen shapes
      const ratio = bore > 2 ? Math.min(0.98, Math.round((bore / od) * 50) / 50) : 0;
      return { geometry: this.make(`u${ratio}`, 0.5, ratio * 0.5, 12), scale: M(od) };
    }
    const o = Math.max(2, Math.round(od / 2) * 2);
    const b = bore > 2 ? Math.min(o - 2, Math.round(bore / 2) * 2) : 0;
    return { geometry: this.make(`${o}/${b}`, M(o / 2), M(b / 2), Math.max(10, Math.min(32, Math.round(o / 45)))), scale: 1 };
  }

  private make(key: string, ro: number, ri: number, segs: number): THREE.BufferGeometry {
    let g = this.rings.get(key);
    if (!g) {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, ro, 0, Math.PI * 2, false);
      if (ri > 0) {
        const hole = new THREE.Path();
        hole.absarc(0, 0, ri, 0, Math.PI * 2, true);
        shape.holes.push(hole);
      }
      g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: segs }).rotateX(-Math.PI / 2);
      g.deleteAttribute('uv');
      this.rings.set(key, g);
    }
    return g;
  }

  dispose() {
    for (const g of this.rings.values()) g.dispose();
    this.rings.clear();
    this.box.dispose();
    this.sheet.dispose();
  }
}

export interface SquareProxy extends THREE.Object3D {
  userData: { index: number; home: THREE.Vector3; side: number; h: number; pieces: number; tier: number; at?: THREE.Vector3; tag?: THREE.Sprite };
}

/** Collects instances by shape: per instance its matrix, its owner and its colour. */
class Batches {
  private map = new Map<THREE.BufferGeometry, { base: number[]; owner: number[]; color: number[] }>();
  private col = new THREE.Color();
  add(geometry: THREE.BufferGeometry, owner: number, m: ArrayLike<number>, hex: string) {
    let b = this.map.get(geometry);
    if (!b) this.map.set(geometry, (b = { base: [], owner: [], color: [] }));
    for (let i = 0; i < 16; i++) b.base.push(m[i]);
    b.owner.push(owner);
    this.col.set(hex);
    b.color.push(this.col.r, this.col.g, this.col.b);
  }
  /** One instanced mesh per shape, sharing one material. */
  build(): { mesh: THREE.InstancedMesh; base: Float32Array; owner: Uint32Array }[] {
    const material = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    return [...this.map].map(([geometry, b]) => {
      const mesh = new THREE.InstancedMesh(geometry, material, b.owner.length);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(b.color), 3);
      mesh.frustumCulled = false; // instances spread past the shape's own bounds
      mesh.userData.shared = true; // the geometry belongs to the cache
      return { mesh, base: new Float32Array(b.base), owner: new Uint32Array(b.owner) };
    });
  }
}

// column-major matrix: scale (sx, sy, sz), then move to (x, y, z)
const mat = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1];

/**
 * Walks one crate: a proxy per square (where it stands, centred in the crate),
 * and for each square its cardboard and its gaskets, relative to the square.
 */
function walk(
  c: Crate,
  s: Settings,
  colorOf: (line: string) => string,
  p: Palette,
  shapes: ShapeCache,
  detail: 'layers' | 'stacks',
  lite: boolean,
  add: (geometry: THREE.BufferGeometry, square: SquareProxy, m: number[], hex: string) => void,
): SquareProxy[] {
  const { L, W, H } = c.outer;
  const board = lite ? shapes.sheet : shapes.box;
  return c.groups.map((pg, index) => {
    const g = pg.group;
    const sq = new THREE.Object3D() as SquareProxy;
    const bd = c.board ?? s.board;
    sq.position.set(M(-L / 2 + bd + pg.x + g.side / 2), M(-H / 2 + (c.skid ?? s.skid) + pg.z), M(W / 2 - bd - pg.y - g.side / 2));
    const scx = pg.x + g.side / 2;
    const scy = pg.y + g.side / 2;
    const tier = c.groups.filter((q) => q.z < pg.z - 1e-6 && Math.abs(q.x + q.group.side / 2 - scx) < 1 && Math.abs(q.y + q.group.side / 2 - scy) < 1).length;
    sq.userData = { index, home: sq.position.clone(), side: g.side, h: g.h, pieces: g.piles.reduce((a, q) => a + q.n, 0), tier };

    // the cardboard: a board under every layer, or for the X-ray just its top face
    const side = M(g.side);
    const tops: number[] = [];
    let y = 0;
    for (let k = 0; k < g.layers.length; k++) {
      if (lite) add(board, sq, mat(side, M(y + s.sheet), side, 0, 0, 0), p.board);
      else add(board, sq, mat(side, M(s.sheet), side, 0, M(y), 0), p.board);
      tops.push(y + s.sheet);
      y += g.layers[k];
    }
    // the gaskets
    for (const q of g.piles) {
      const { geometry: geo, scale: k1 } = shapes.ring(q.od, q.bore, lite);
      const hex = colorOf(q.line);
      if (detail === 'layers') for (let k = 0; k < q.n; k++) add(geo, sq, mat(k1, M(q.thk), k1, M(q.x), M(tops[k]), M(-q.y)), hex);
      else add(geo, sq, mat(k1, M(tops[q.n - 1] + q.thk - tops[0]), k1, M(q.x), M(tops[0]), M(-q.y)), hex);
    }
    return sq;
  });
}

/** One crate's contents, in the crate's own frame (centred, length along x, width along −z). Squares can be moved, then `sync()`. */
export class Contents extends THREE.Group {
  /** One per square, in packing order. */
  readonly squares: SquareProxy[];
  readonly detail: 'layers' | 'stacks';
  private meshes: { mesh: THREE.InstancedMesh; base: Float32Array; owner: Uint32Array }[];

  constructor(c: Crate, s: Settings, colorOf: (line: string) => string, p: Palette, shapes: ShapeCache) {
    super();
    const rings = c.groups.reduce((a, pg) => a + pg.group.piles.reduce((b, q) => b + q.n, 0), 0);
    this.detail = rings > MAX_RINGS ? 'stacks' : 'layers';
    const batches = new Batches();
    this.squares = walk(c, s, colorOf, p, shapes, this.detail, false, (geo, sq, m, hex) => batches.add(geo, sq.userData.index, m, hex));
    this.meshes = batches.build();
    for (const m of this.meshes) this.add(m.mesh);
    this.sync();
  }

  /** Moves every instance with its square. Squares only move, so this adds each square's position to its instances. */
  sync() {
    for (const { mesh, base, owner } of this.meshes) {
      const out = mesh.instanceMatrix.array as Float32Array;
      out.set(base);
      for (let i = 0; i < owner.length; i++) {
        const sq = this.squares[owner[i]].position;
        const o = i * 16;
        out[o + 12] += sq.x;
        out[o + 13] += sq.y;
        out[o + 14] += sq.z;
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const { mesh } of this.meshes) mesh.dispose();
    (this.meshes[0]?.mesh.material as THREE.Material | undefined)?.dispose();
  }
}

/**
 * The X-ray of a whole load: every crate's stacks in one set of instanced
 * meshes, in the vehicle's frame, so a full trailer is a few dozen draw
 * calls. Instances are ordered by loading step, so showing the load up to a
 * step is just drawing the first so many; a crate can be hidden (its stacks
 * lifted out) by collapsing its instances.
 */
export class LoadXray extends THREE.Group {
  private meshes: { mesh: THREE.InstancedMesh; base: Float32Array; owner: Uint32Array; upTo: number[] }[];
  private steps: number[];
  private hidden = new Set<number>();

  /** `crates` in loading order, each with where it stands and whether it is turned. */
  constructor(crates: { crate: Crate; at: THREE.Vector3; turned: boolean; step: number }[], s: Settings, colorOf: (line: string) => string, p: Palette, shapes: ShapeCache) {
    super();
    const order = [...crates].sort((a, b) => a.step - b.step);
    this.steps = order.map((o) => o.step);
    const batches = new Batches();
    const world = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    order.forEach((o, n) => {
      const crateM = new THREE.Matrix4().makeRotationY(o.turned ? Math.PI / 2 : 0).setPosition(o.at);
      walk(o.crate, s, colorOf, p, shapes, 'stacks', true, (geo, sq, m, hex) => {
        local.fromArray(m);
        local.elements[12] += sq.position.x;
        local.elements[13] += sq.position.y;
        local.elements[14] += sq.position.z;
        world.multiplyMatrices(crateM, local);
        batches.add(geo, n, world.elements, hex);
      });
    });
    this.meshes = batches.build().map((m) => {
      // how many instances belong to crates loaded up to each step (owners are already in loading order)
      const upTo = order.map((_, n) => {
        let k = 0;
        while (k < m.owner.length && m.owner[k] <= n) k++;
        return k;
      });
      (m.mesh.instanceMatrix.array as Float32Array).set(m.base);
      this.add(m.mesh);
      return { ...m, upTo };
    });
  }

  /** Draws the crates loaded up to step n. */
  setStep(n: number) {
    const last = this.steps.filter((x) => x <= n).length - 1;
    for (const m of this.meshes) m.mesh.count = last < 0 ? 0 : m.upTo[last];
  }

  /** Hides one crate's stacks (they are lifted out), or brings them back. */
  setHidden(index: number, hide: boolean) {
    if (hide === this.hidden.has(index)) return;
    if (hide) this.hidden.add(index);
    else this.hidden.delete(index);
    for (const { mesh, base, owner } of this.meshes) {
      const out = mesh.instanceMatrix.array as Float32Array;
      let touched = false;
      for (let i = 0; i < owner.length; i++) {
        if (owner[i] !== index) continue;
        touched = true;
        if (hide) out.fill(0, i * 16, i * 16 + 16);
        else out.set(base.subarray(i * 16, i * 16 + 16), i * 16);
      }
      if (touched) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const { mesh } of this.meshes) mesh.dispose();
    (this.meshes[0]?.mesh.material as THREE.Material | undefined)?.dispose();
  }
}
