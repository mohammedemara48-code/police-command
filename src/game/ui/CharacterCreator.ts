/** "Your officer" screen: body, skin, hair, uniform, weapon with a rotating 3D preview. */
import * as THREE from 'three';
import { models } from '../core/Models';
import { character, setCharacter } from '../entities/Character';
import {
  SKINS,
  HAIRS,
  UNIFORMS,
  WEAPONS,
  modelFor,
  recolorFor,
  type Character,
  type WeaponId
} from '../logic/character';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function openCreator(root: HTMLElement, opts: { first: boolean; done: () => void }) {
  let c: Character = { ...character() };
  root.innerHTML = `<div class="start-screen"><div class="start-card glass menu-card creator" role="dialog" aria-label="شخصيتك">
    <h2>${opts.first ? '👮 اعمل ظابطك قبل أول دورية' : '👮 شخصيتي'}</h2>
    <div class="cc-stage"><canvas class="cc-canvas" aria-label="معاينة الشخصية — اسحب للف"></canvas><span class="cc-hint">↔ اسحب للف</span></div>
    <div class="cc-opts"></div>
    <div class="menu-col"><button class="btn menu-big" data-cc="save">${opts.first ? '✔ يلا على الدورية' : '✔ احفظ'}</button>
    ${opts.first ? '' : '<button class="btn ghost" data-cc="back">رجوع</button>'}</div></div></div>`;
  const canvas = root.querySelector('.cc-canvas') as HTMLCanvasElement;
  const optsEl = root.querySelector('.cc-opts') as HTMLElement;

  // tiny standalone preview renderer (disposed on close)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x30343c, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fb0ff, 1.4);
  rim.position.set(-3, 2, -3);
  scene.add(rim);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 40),
    new THREE.MeshStandardMaterial({ color: 0x1d2633, roughness: 0.9 })
  );
  disc.rotation.x = -Math.PI / 2;
  scene.add(disc);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  cam.position.set(0, 1.25, 4.1);
  cam.lookAt(0, 0.92, 0);
  const holder = new THREE.Group();
  scene.add(holder);
  let avatar = new THREE.Group();
  holder.add(avatar);
  const dress = () => {
    holder.remove(avatar);
    avatar = new THREE.Group();
    holder.add(avatar);
    models.dress(avatar, modelFor(c), { height: 1.8, recolor: recolorFor(c) });
  };
  dress();

  let rotY = 0.5,
    vel = 0.6,
    drag = false,
    lastX = 0,
    alive = true,
    last = performance.now();
  canvas.addEventListener('pointerdown', (e) => {
    drag = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const d = (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
    rotY += d;
    vel = d * 30;
  });
  const up = () => {
    drag = false;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  const loop = () => {
    if (!alive) return;
    const now = performance.now(),
      dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!drag) {
      vel += (0.6 - vel) * Math.min(1, dt * 2);
      rotY += vel * dt;
    }
    holder.rotation.y = rotY;
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const chip = (group: string, val: string | number, label: string, on: boolean, swatch?: number) =>
    `<button class="cc-chip${on ? ' on' : ''}" data-g="${group}" data-v="${val}" aria-pressed="${on}">${swatch !== undefined ? `<i style="background:${hex(swatch)}"></i>` : ''}${label}</button>`;
  const render = () => {
    optsEl.innerHTML = `
      <div class="cc-row"><b>الشخصية</b>${chip('body', 'male', 'راجل', c.body === 'male')}${chip('body', 'female', 'ست', c.body === 'female')}</div>
      <div class="cc-row"><b>لون البشرة</b>${SKINS.map((s, i) => chip('skin', i, '', c.skin === i, s)).join('')}</div>
      ${c.body === 'female' ? `<div class="cc-row"><b>الشعر</b>${HAIRS.map((s, i) => chip('hair', i, '', c.hair === i, s)).join('')}</div>` : ''}
      <div class="cc-row"><b>الزي</b>${UNIFORMS.map((u, i) => chip('uniform', i, u.name, c.uniform === i, u.top)).join('')}</div>
      <div class="cc-row"><b>السلاح</b>${(Object.keys(WEAPONS) as WeaponId[]).map((k) => chip('weapon', k, `${WEAPONS[k].name}<small>${WEAPONS[k].desc}</small>`, c.weapon === k)).join('')}</div>`;
    optsEl.querySelectorAll<HTMLButtonElement>('.cc-chip').forEach((b) =>
      b.addEventListener('click', () => {
        const g = b.dataset.g as keyof Character,
          v = b.dataset.v!;
        c = { ...c, [g]: g === 'body' || g === 'weapon' ? v : Number(v) } as Character;
        if (g !== 'weapon') dress();
        render();
      })
    );
  };
  render();

  const close = () => {
    alive = false;
    renderer.dispose();
    renderer.forceContextLoss();
  };
  root.querySelector('[data-cc="save"]')!.addEventListener('click', () => {
    setCharacter(c);
    close();
    opts.done();
  });
  root.querySelector('[data-cc="back"]')?.addEventListener('click', () => {
    close();
    opts.done();
  });
}
