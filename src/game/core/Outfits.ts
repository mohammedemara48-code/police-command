/**
 * Procedural Cairo clothes on the MakeHuman (CC0) people: a skinned galabeya / abaya that swings with the legs,
 * a headscarf over the hair, a skull cap, a cane in the hand, a school bag, a vendor's tray on the head.
 * Everything is built from the person's own bones in bind pose, so it fits every body and height.
 */
import * as THREE from 'three';
import type { Outfit } from '../logic/outfits';

const mats = new Map<string, THREE.MeshStandardMaterial>();
function cloth(color: number, rough = 0.92, side: THREE.Side = THREE.FrontSide) {
  const key = `${color}:${rough}:${side}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, side });
    m.name = 'Outfit';
    mats.set(key, m);
  }
  return m;
}

const tints = new Map<string, THREE.Material>();
/** A shared recoloured copy of a model material (people with the same skin / shirt share one). */
function tinted(m: THREE.Mesh, hex: number) {
  const src = m.material as THREE.MeshStandardMaterial;
  const key = `${src.uuid}:${hex}`;
  let t = tints.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!t) {
    t = src.clone();
    t.color.setHex(hex);
    tints.set(key, t);
  }
  m.material = t;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Dress a freshly cloned (bind-pose) MakeHuman model. */
export function wear(model: THREE.Object3D, o: Outfit, shadows: boolean) {
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const bone = (n: string) => model.getObjectByName(n) as THREE.Bone | undefined;
  const at = (n: string) => {
    const b = bone(n);
    return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv) : null;
  };
  let body: THREE.SkinnedMesh | null = null;
  model.traverse((c) => {
    const m = c as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const n = (m.material as THREE.Material).name;
    if (!body || n === 'Top') body = m;
    if (n === 'Skin') tinted(m, o.skin);
    if (n === 'Hair') {
      if (o.hijab !== null || o.cap !== null) m.visible = false;
      else tinted(m, o.hair);
    }
    if (n === 'Top') {
      // under a robe the suit reads as a plain long-sleeved shirt of the same cloth
      if (o.robe !== null) m.material = cloth(o.robe, 0.9);
      else tinted(m, o.top);
    }
  });
  const hip = at('pelvis'),
    sp1 = at('spine_01'),
    chest = at('spine_03'),
    neck = at('neck_01'),
    head = at('head'),
    thL = at('thigh_l'),
    thR = at('thigh_r'),
    caL = at('calf_l'),
    foL = at('foot_l'),
    uaL = at('upperarm_l'),
    uaR = at('upperarm_r');
  if (!hip || !sp1 || !chest || !neck || !head || !thL || !thR || !caL || !foL || !uaL || !uaR || !body) return;
  // the body's bounds in the model's own (unscaled) space, like the bone positions
  const box = new THREE.Box3().setFromObject(model).applyMatrix4(inv);
  const H = box.max.y - box.min.y;
  const shoulder = Math.abs(uaL.x - uaR.x) / 2;

  const rigid = (mesh: THREE.Mesh, pos: THREE.Vector3, parent: string) => {
    const b = bone(parent);
    if (!b) return;
    mesh.position.copy(pos);
    model.add(mesh);
    mesh.updateMatrixWorld(true);
    b.attach(mesh);
    mesh.castShadow = shadows;
  };

  if (o.robe !== null) robe(body, o.robe, shadows, o.hijab !== null);

  // long sleeves for women who cover (the MakeHuman women wear short sleeves)
  if (o.hijab !== null && o.female) {
    const m = cloth(o.robe ?? o.top, 0.9);
    for (const side of ['l', 'r']) {
      const seg: [string, string, number, number][] = [
        ['upperarm_' + side, 'lowerarm_' + side, 0.037, 0.031],
        ['lowerarm_' + side, 'hand_' + side, 0.031, 0.025]
      ];
      for (const [a, b, r0, r1] of seg) {
        const pa = at(a),
          pb = at(b);
        if (!pa || !pb) continue;
        const dir = pb.clone().sub(pa);
        const len = dir.length();
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(H * r1, H * r0, len * 1.04, 10, 1, true), m);
        tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        rigid(tube, pa.clone().add(pb).multiplyScalar(0.5), a);
      }
    }
  }

  const hc = new THREE.Vector3(head.x, head.y + H * 0.048, head.z + H * 0.006);
  const hr = H * 0.066;
  if (o.hijab !== null) {
    const m = cloth(o.hijab, 0.88, THREE.DoubleSide);
    // a fitted scarf, not a hood: close over the crown and forehead, round the cheeks and under the chin with the face
    // left open, then down the neck onto the shoulders
    const r0 = hr * 1.04;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(r0, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), m);
    rigid(crown, hc.clone(), 'head');
    // the face opening is centred on +z (phi = pi/2), about 110 degrees wide
    const open = Math.PI * 0.62;
    const sides = new THREE.Mesh(
      new THREE.SphereGeometry(r0, 20, 10, Math.PI / 2 + open / 2, Math.PI * 2 - open, Math.PI * 0.3, Math.PI * 0.52),
      m
    );
    sides.scale.set(0.98, 1.12, 1);
    rigid(sides, hc.clone().add(new THREE.Vector3(0, -hr * 0.06, 0)), 'head');
    // under the chin: a band closing the opening at the bottom
    const chin = new THREE.Mesh(
      new THREE.SphereGeometry(r0 * 0.98, 18, 4, 0, Math.PI * 2, Math.PI * 0.8, Math.PI * 0.2),
      m
    );
    chin.scale.set(0.9, 1.1, 0.95);
    rigid(chin, hc.clone().add(new THREE.Vector3(0, -hr * 0.12, 0)), 'head');
    // the drape over neck and shoulders, narrow at the neck
    const dTop = head.y - H * 0.012,
      dBot = chest.y + H * 0.045;
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(hr * 0.72, shoulder * 0.92, dTop - dBot, 18, 1, true), m);
    drape.scale.z = 0.78;
    rigid(drape, new THREE.Vector3(head.x, (dTop + dBot) / 2, head.z - H * 0.006), 'spine_03');
  } else if (o.cap !== null) {
    const capM = new THREE.Mesh(
      new THREE.SphereGeometry(hr * 1.04, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.36),
      cloth(o.cap, 0.95)
    );
    rigid(capM, hc.clone().add(new THREE.Vector3(0, hr * 0.06, -hr * 0.05)), 'head');
  }
  if (o.tray) {
    const tray = new THREE.Group();
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(hr * 3.2, hr * 3.2, H * 0.012, 18), cloth(0x8a6a44, 0.85));
    tray.add(wood);
    // round baladi loaves
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.CylinderGeometry(hr * 0.9, hr * 0.9, H * 0.01, 12), cloth(0xc89a5c, 0.95));
      l.position.set(Math.cos(a) * hr * 1.9, H * 0.01, Math.sin(a) * hr * 1.9);
      tray.add(l);
    }
    tray.position.set(hc.x, hc.y + hr * 1.1, hc.z);
    model.add(tray);
    tray.updateMatrixWorld(true);
    bone('head')?.attach(tray);
  }
  if (o.backpack !== null) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(shoulder * 1.15, H * 0.2, H * 0.08), cloth(o.backpack, 0.7));
    rigid(bag, new THREE.Vector3(chest.x, chest.y - H * 0.03, chest.z - H * 0.085), 'spine_03');
    const strap = cloth(0x1a1a1a, 0.7);
    for (const s of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(H * 0.018, H * 0.16, H * 0.012), strap);
      rigid(st, new THREE.Vector3(chest.x + s * shoulder * 0.45, chest.y + H * 0.01, chest.z + H * 0.06), 'spine_03');
    }
  }
  if (o.cane) {
    const hand = at('hand_r');
    if (hand) {
      // stick from the hand to the ground, slightly forward
      const len = hand.y - box.min.y + H * 0.02;
      const cane = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.007, H * 0.009, len, 6), cloth(0x4a3020, 0.6));
      rigid(cane, new THREE.Vector3(hand.x, hand.y - len / 2 + H * 0.02, hand.z + H * 0.03), 'hand_r');
      const crook = new THREE.Mesh(new THREE.TorusGeometry(H * 0.022, H * 0.007, 5, 10, Math.PI), cloth(0x4a3020, 0.6));
      crook.rotation.y = Math.PI / 2;
      rigid(crook, new THREE.Vector3(hand.x, hand.y + H * 0.02, hand.z + H * 0.008), 'hand_r');
    }
  }
  // a child's head is a larger share of the body
  if (o.kid) bone('head')?.scale.setScalar(1.22);
}

/** A long robe skinned to the spine, pelvis and legs, so the skirt swings with each step. Built in bind pose. */
function robe(body: THREE.SkinnedMesh, color: number, shadows: boolean, long: boolean) {
  const bones = body.skeleton.bones;
  const idx = (n: string) => bones.findIndex((b) => b.name === n);
  const B = {
    chest: idx('spine_03'),
    waist: idx('spine_01'),
    pelvis: idx('pelvis'),
    neck: idx('neck_01'),
    thL: idx('thigh_l'),
    thR: idx('thigh_r'),
    caL: idx('calf_l'),
    caR: idx('calf_r'),
    foL: idx('foot_l'),
    uaL: idx('upperarm_l'),
    uaR: idx('upperarm_r')
  };
  if (Object.values(B).some((v) => v < 0)) return;
  // bone positions in the body mesh's own space, in bind pose
  const bindInv = body.bindMatrixInverse;
  const at = (i: number) =>
    new THREE.Vector3()
      .applyMatrix4(new THREE.Matrix4().copy(body.skeleton.boneInverses[i]!).invert())
      .applyMatrix4(bindInv);
  const hip = at(B.pelvis),
    chest = at(B.chest),
    waist = at(B.waist),
    neck = at(B.neck),
    thL = at(B.thL),
    thR = at(B.thR),
    knee = at(B.caL),
    foot = at(B.foL),
    uaL = at(B.uaL),
    uaR = at(B.uaR);
  body.geometry.computeBoundingBox();
  const bb = body.geometry.boundingBox!;
  const H = bb.max.y - bb.min.y;
  const leftSign = Math.sign(thL.x - thR.x) || 1;
  const sh = Math.max(Math.abs(uaL.x - uaR.x) / 2, H * 0.08);
  const cx = hip.x,
    cz = hip.z;
  const d = {
    top: neck.y - H * 0.015,
    chestY: chest.y,
    waistY: waist.y,
    hipY: hip.y,
    kneeY: knee.y,
    hemY: foot.y + H * (long ? 0.012 : 0.035)
  };
  // ring heights and half-widths (x) / half-depths (z), top to hem
  const rings: [number, number, number][] = [
    [d.top, sh * 0.42, H * 0.045],
    [d.chestY + H * 0.05, sh * 0.98, H * 0.09],
    [d.chestY - H * 0.02, sh * 0.98, H * 0.1],
    [d.waistY, sh * 0.95, H * 0.1],
    [d.hipY, sh * 1.0, H * 0.1],
    [d.hipY - H * 0.08, sh * 1.04, H * 0.105],
    [(d.hipY + d.kneeY) / 2 - H * 0.02, sh * 1.06, H * 0.11],
    [d.kneeY, sh * 1.08, H * 0.115],
    [(d.kneeY + d.hemY) / 2, sh * 1.12, H * 0.12],
    [d.hemY, sh * 1.18, H * 0.128]
  ];
  const seg = 24;
  const pos: number[] = [];
  const sIdx: number[] = [];
  const sW: number[] = [];
  const index: number[] = [];
  for (let r = 0; r < rings.length; r++) {
    const [y, rx, rz] = rings[r]!;
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const x = Math.sin(a) * rx,
        z = Math.cos(a) * rz;
      pos.push(cx + x, y, cz + z);
      // weights
      const lat = Math.abs(Math.sin(a));
      const left = Math.sign(x) === leftSign;
      const th = left ? B.thL : B.thR,
        ca = left ? B.caL : B.caR;
      let wSpine = 0,
        wPel = 0,
        wTh = 0,
        wCa = 0;
      let spineBone = B.waist;
      if (y >= d.hipY) {
        const t = smooth(d.hipY, d.chestY, y);
        if (y > d.waistY) spineBone = B.chest;
        wSpine = t;
        wPel = 1 - t;
      } else {
        const down = smooth(d.hipY, d.kneeY, y);
        const legW = down * (0.35 + 0.55 * smooth(0.05, 0.75, lat));
        const shin = smooth(d.kneeY, d.hemY, y) * 0.45;
        wCa = legW * shin;
        wTh = legW - wCa;
        wPel = 1 - legW;
      }
      sIdx.push(spineBone, B.pelvis, th, ca);
      sW.push(wSpine, wPel, wTh, wCa);
    }
  }
  for (let r = 0; r < rings.length - 1; r++)
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s,
        b = a + seg + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(geo, cloth(color, 0.9, THREE.DoubleSide));
  mesh.name = 'robe';
  mesh.frustumCulled = false;
  mesh.castShadow = shadows;
  body.parent!.add(mesh);
  mesh.position.copy(body.position);
  mesh.quaternion.copy(body.quaternion);
  mesh.scale.copy(body.scale);
  mesh.bind(body.skeleton, body.bindMatrix);
}
