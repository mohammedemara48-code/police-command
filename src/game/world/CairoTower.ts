/**
 * Cairo Tower (Borg El-Qahira), Gezira island: 187 m, roof 160 m, observation deck 143 m (Wikipedia, "Cairo Tower").
 * A concrete lotus-stem lattice, a flared crown, a glazed observation / restaurant drum and a thin spire.
 * The lattice is a see-through diamond pattern on a lathed shell around a dark core; proportions are read off photographs.
 */
import * as THREE from 'three';
import { Q } from '../config/Quality';
import { surface } from './Environment';
import { hazed } from './Haze';

const H = { podium: 8, latticeTop: 139, crownTop: 142, drumTop: 153.5, roofTop: 160, tip: 187 };

function latticeTexture() {
  const cw = 96,
    ch = 160;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.strokeStyle = '#d6c4a2';
  g.lineCap = 'butt';
  g.lineWidth = 17;
  // two families of diagonals, drawn into the neighbouring tiles as well so the pattern repeats seamlessly
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      const ox = dx * cw,
        oy = dy * ch;
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(ox + cw, oy + ch);
      g.moveTo(ox + cw, oy);
      g.lineTo(ox, oy + ch);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Q.shadows ? 4 : 1;
  return t;
}

function drumTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#243240';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#b9a98a';
  for (let i = 0; i <= 256; i += 16) g.fillRect(i - 1.5, 0, 3, 64);
  g.fillRect(0, 30, 256, 4);
  g.fillStyle = 'rgba(255,214,150,0.35)';
  for (let i = 0; i < 256; i += 16) g.fillRect(i + 3, 36, 10, 24);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCairoTower(x: number, z: number) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.userData.city = true;
  const radial = Q.hdri ? 48 : 28;

  // shell profile: radius by height (lotus stem: slim at mid-height, flaring into the crown)
  const prof: THREE.Vector2[] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = H.podium + (H.latticeTop - H.podium) * t;
    const r = 10.6 - 1.3 * Math.sin(t * Math.PI * 0.9) + 3.1 * Math.pow(t, 9);
    prof.push(new THREE.Vector2(r, y));
  }
  const shell = new THREE.LatheGeometry(prof, radial);
  const tex = latticeTexture();
  tex.repeat.set(14, (H.latticeTop - H.podium) / 9.6 / 1.0);
  const lattice = new THREE.Mesh(
    shell,
    hazed(
      new THREE.MeshStandardMaterial({
        map: tex,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        color: 0xe8dcc2,
        roughness: 0.9,
        emissive: 0x4a3a22,
        emissiveIntensity: 0.28
      }),
      0.45
    )
  );
  root.add(lattice);

  // dark core behind the lattice gives the openings depth
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(7.4, 8.2, H.latticeTop - H.podium, 20, 1, true),
    hazed(
      new THREE.MeshStandardMaterial({ color: 0x4a4034, roughness: 1, side: THREE.BackSide, emissive: 0x1a140c }),
      0.45
    )
  );
  core.position.y = (H.latticeTop + H.podium) / 2;
  root.add(core);
  // floor plates inside, seen through the lattice
  const plateMat = hazed(new THREE.MeshStandardMaterial({ color: 0x8c8272, roughness: 1 }), 0.45);
  for (let y = 20; y < H.latticeTop; y += 14) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(9.2, 9.2, 0.5, 20), plateMat);
    p.position.y = y;
    root.add(p);
  }

  const stone = surface('concrete', 0xd9cdb4);
  stone.userData.uvSize = 4;
  // podium with a ring of steps
  const podium = new THREE.Mesh(new THREE.CylinderGeometry(15.5, 17, H.podium, 36), stone);
  podium.position.y = H.podium / 2;
  podium.castShadow = podium.receiveShadow = Q.shadows;
  root.add(podium);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 0.5, 36), surface('paving', 0xe0d6c4));
  plinth.position.y = 0.25;
  root.add(plinth);

  // crown ring, glazed drum, roof and spire
  const concrete = hazed(
    new THREE.MeshStandardMaterial({ color: 0xd2c3a3, roughness: 0.9, emissive: 0x2a2014, emissiveIntensity: 0.2 }),
    0.45
  );
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(13.6, 13.0, H.crownTop - H.latticeTop + 1, radial), concrete);
  crown.position.y = (H.latticeTop + H.crownTop + 1) / 2 - 0.5;
  root.add(crown);
  const dt = drumTexture();
  dt.repeat.set(5, 1);
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(12.2, 12.2, H.drumTop - H.crownTop, radial, 1, true),
    hazed(
      new THREE.MeshStandardMaterial({
        map: dt,
        roughness: 0.25,
        metalness: 0.5,
        emissive: 0xffcf8a,
        emissiveMap: dt,
        emissiveIntensity: 0.22
      }),
      0.35
    )
  );
  drum.position.y = (H.crownTop + H.drumTop) / 2;
  root.add(drum);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 13, H.roofTop - H.drumTop, radial), concrete);
  roof.position.y = (H.drumTop + H.roofTop) / 2;
  root.add(roof);
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.9, H.tip - H.roofTop, 8),
    hazed(new THREE.MeshStandardMaterial({ color: 0x8c8c88, roughness: 0.6, metalness: 0.5 }), 0.45)
  );
  mast.position.y = (H.roofTop + H.tip) / 2;
  root.add(mast);
  // aviation light on the tip
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff3a30, emissive: 0xff2010, emissiveIntensity: 2 })
  );
  beacon.position.y = H.tip;
  root.add(beacon);
  return root;
}
