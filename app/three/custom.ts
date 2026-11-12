import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Palette } from './models';

/** Reads an uploaded glTF / GLB model. Throws a plain message when it cannot be read. */
export async function parseModel(data: ArrayBuffer): Promise<THREE.Group> {
  try {
    const gltf = await new GLTFLoader().parseAsync(data, '');
    let meshes = 0;
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    if (!meshes) throw new Error('no meshes');
    return gltf.scene;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/draco|KHR_draco/i.test(msg)) throw new Error('This model is Draco-compressed. Export it again without Draco compression.');
    throw new Error('That file is not a glTF / GLB model WaveForce can read.');
  }
}

/** The theme's material for one of the model's: by what its name says, else by how dark it is. */
function themed(orig: THREE.Material, p: Palette): THREE.Material {
  const name = orig.name.toLowerCase();
  const col = (orig as THREE.MeshStandardMaterial).color;
  const lum = col ? 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b : 0.5;
  let hex = p.paint;
  if (/glass|wind|screen|lamp|light/.test(name)) {
    hex = p.glass;
  } else if (/tire|tyre|wheel|rubber/.test(name)) hex = p.tyre;
  else if (/rim|chrome|hub|alloy|mirror/.test(name)) hex = p.cover;
  else if (/black|dark|chassis|frame|grill|bumper|under/.test(name) || lum < 0.12) hex = p.dark;
  return new THREE.MeshLambertMaterial({ color: hex, side: orig.side, transparent: orig.transparent, opacity: orig.opacity });
}

/**
 * Where to cut a model that is a whole truck, trailer and all: the tractor
 * ends at the widest gap in what touches the ground behind the cab. Returns
 * the x (in the model's turned frame) at which to clip, or null for a tractor
 * on its own. The ground contact is read from the lowest 15 % of the model.
 */
function tractorCut(obj: THREE.Object3D): number | null {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  if (size.x < size.z * 2.2) return null; // not long enough to hold a trailer
  const floor = box.min.y + size.y * 0.15;
  const bins = new Array<number>(64).fill(0);
  const v = new THREE.Vector3();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (v.y <= floor) bins[Math.min(63, Math.floor(((v.x - box.min.x) / size.x) * 64))]++;
    }
  });
  // the longest empty run in the ground contact that starts after the first third
  let best: [number, number] | null = null;
  let start = -1;
  for (let i = 0; i <= 64; i++) {
    const empty = i < 64 && bins[i] === 0;
    if (empty && start < 0) start = i;
    if (!empty && start >= 0) {
      if (start > 10 && (!best || i - start > best[1] - best[0])) best = [start, i];
      start = -1;
    }
  }
  if (!best || best[1] - best[0] < 4) return null;
  return box.min.x + ((best[0] + 1) / 64) * size.x;
}

const TRAILER = /trailer|container|cargo|box\b|semi[-_ ]?body/i;

/**
 * Drops the parts a model names as its trailer, box or container, and
 * returns where the tractor ends (the dropped part's front, in the frame
 * given), or null when nothing was named. Anything behind that line is cut
 * off by the caller, so the trailer's own wheels go too.
 */
function dropTrailer(obj: THREE.Object3D): number | null {
  obj.updateMatrixWorld(true);
  let front: number | null = null;
  const v = new THREE.Vector3();
  const noteFront = (m: THREE.Mesh, start: number, count: number) => {
    const pos = m.geometry.getAttribute('position');
    const idx = m.geometry.index;
    let min = Infinity;
    for (let i = start; i < start + count; i++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
      min = Math.min(min, v.x);
    }
    if (Number.isFinite(min)) front = front === null ? min : Math.min(front, min);
  };
  const gone: THREE.Object3D[] = [];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) {
      if (TRAILER.test(o.name)) gone.push(o);
      return;
    }
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (TRAILER.test(o.name) || (mats.length === 1 && TRAILER.test(mats[0].name))) {
      const n = m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count;
      noteFront(m, 0, n);
      gone.push(o);
    } else if (mats.length > 1 && m.geometry.groups.length > 1) {
      // one mesh, several materials: keep the groups that are not the trailer
      const keep = m.geometry.groups.filter((g) => {
        const trailer = TRAILER.test(mats[g.materialIndex ?? 0]?.name ?? '');
        if (trailer) noteFront(m, g.start, g.count === Infinity ? (m.geometry.index?.count ?? 0) - g.start : g.count);
        return !trailer;
      });
      if (keep.length !== m.geometry.groups.length) {
        const geo = m.geometry.clone();
        geo.clearGroups();
        for (const g of keep) geo.addGroup(g.start, g.count, g.materialIndex);
        m.geometry = geo;
      }
    }
  });
  for (const o of gone) o.removeFromParent();
  return front;
}

/**
 * The uploaded tractor dressed for the scene: turned by quarter turns so it
 * faces forward (−x is the nose), the trailer dropped or cut off when the
 * model has one, every material swapped for the theme's, scaled to a 2.55 m
 * width, standing on the ground with its rear over the kingpin.
 */
export function dressTruck(model: THREE.Object3D, p: Palette, turn: number, kingpinX: number): THREE.Group {
  const inner = model.clone(true);
  inner.rotation.y = (turn * Math.PI) / 2;
  // a named trailer: the tractor ends a little ahead of where the trailer began (its kingpin sits under the trailer's front)
  const named = dropTrailer(inner);
  const cut = named !== null ? named + 0.001 : tractorCut(inner);
  const clip = cut === null ? null : [new THREE.Plane(new THREE.Vector3(-1, 0, 0), cut)];
  inner.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const dress = (x: THREE.Material) => {
      const t = themed(x, p);
      if (clip) t.clippingPlanes = clip;
      return t;
    };
    m.material = Array.isArray(m.material) ? m.material.map(dress) : dress(m.material);
  });
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  if (cut !== null) box.max.x = Math.min(box.max.x, cut);
  const size = box.getSize(new THREE.Vector3());
  // the tractor is about 2.5 m wide; a model that still reads far longer than that is scaled by its width anyway
  const scale = 2.55 / Math.max(1e-6, size.z);
  inner.scale.setScalar(scale);
  if (clip) clip[0].constant = cut! * scale;
  inner.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(inner);
  const rear = cut === null ? after.max.x : cut * scale;
  // the kingpin sits about 0.9 m ahead of where the trailer's front was, so that line goes 0.9 m behind ours
  const back = named !== null ? 0.9 : 1.0;
  inner.position.set(kingpinX + back - rear, -after.min.y, -(after.min.z + after.max.z) / 2);
  if (clip) clip[0].constant = kingpinX + back;
  const holder = new THREE.Group();
  holder.add(inner);
  return holder;
}
