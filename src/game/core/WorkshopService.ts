/**
 * The workshops (ورش) on the street: a sign, a painted pad and a bobbing wrench at each one. Drive in slowly and the
 * workshop menu opens: pay to repair the body, buy upgrades for the vehicle you are driving. All the rules (prices,
 * effects, repair maths) live in logic/workshop.ts; this file is the scene props, the zone check and the popup.
 */
import * as THREE from 'three';
import { sheet, type Sheet } from '../ui/Sheet';
import { streetNameSign } from '../world/Egypt';
import { VEHICLES, type VehicleId } from '../logic/vehicles';
import {
  MAX_LEVEL,
  buyUpgrade,
  catalogFor,
  inWorkshop,
  payRepair,
  priceOf,
  repairCost,
  workshopSpots,
  REPAIR_RATE,
  type WorkshopSpot
} from '../logic/workshop';
import { addWallet, setTuning, tuningOf, wallet } from '../missions/Levels';

export interface WorkshopHost {
  group: THREE.Group;
  /** the car's position, signed speed (m/s) and whether the player is driving it */
  state: () => { x: number; z: number; speed: number; inCar: boolean };
  vehicle: () => VehicleId;
  damage: () => number;
  setDamage: (pct: number) => void;
  /** stop the vehicle dead while the menu is open */
  halt: () => void;
  status: (text: string) => void;
  /** money spent on repairs (a taxi shift counts it against its net) */
  repairPaid: (cost: number) => void;
}

const egp = (v: number) => `${Math.round(v)} ج`;
const SHOW_DIST = 320;

function wrenchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ff9f1a';
  x.beginPath();
  x.arc(64, 64, 58, 0, Math.PI * 2);
  x.fill();
  x.lineWidth = 7;
  x.strokeStyle = '#ffffff';
  x.stroke();
  x.translate(64, 64);
  x.rotate(-Math.PI / 4);
  x.strokeStyle = '#1b1204';
  x.lineCap = 'round';
  x.lineWidth = 17;
  x.beginPath();
  x.moveTo(0, 40);
  x.lineTo(0, -8);
  x.stroke();
  x.lineWidth = 15;
  x.beginPath();
  x.arc(0, -22, 19, Math.PI * 0.85, Math.PI * 2.15, false);
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class WorkshopService {
  private root = new THREE.Group();
  private built = false;
  private icons: { s: THREE.Sprite; spot: WorkshopSpot; base: number }[] = [];
  private pads: THREE.Mesh[] = [];
  private modal: Sheet | null = null;
  /** which workshop has been used and not yet left, so the menu doesn't pop up again right after closing it */
  private latch: string | null = null;
  private t = 0;
  private hinted = new Set<string>();
  private note = '';

  constructor(private host: WorkshopHost) {}

  get open() {
    return !!this.modal;
  }

  private build() {
    if (this.built) return;
    this.built = true;
    const tex = wrenchTexture();
    const mat = new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false });
    const padMat = new THREE.MeshBasicMaterial({
      color: 0xff9f1a,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const padGeo = new THREE.PlaneGeometry(1, 1);
    padGeo.rotateX(-Math.PI / 2);
    for (const s of workshopSpots()) {
      const sign = streetNameSign('ورشة', s.shop.name.replace(/^ورشة /, ''));
      sign.position.set(s.px, 0, s.pz);
      this.root.add(sign);
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.set(s.x, 0.06, s.z);
      pad.rotation.y = s.yaw;
      pad.scale.set(7.5, 1, 11);
      this.root.add(pad);
      this.pads.push(pad);
      const icon = new THREE.Sprite(mat);
      icon.scale.set(2.4, 2.4, 1);
      icon.position.set(s.px + (s.x - s.px) * 0.15, 5.6, s.pz + (s.z - s.pz) * 0.15);
      this.root.add(icon);
      this.icons.push({ s: icon, spot: s, base: 5.6 });
    }
    this.host.group.add(this.root);
  }

  start() {
    this.build();
    this.root.visible = true;
  }

  stop() {
    this.close();
    this.root.visible = false;
  }

  update(dt: number) {
    if (!this.built || !this.root.visible) return;
    this.t += dt;
    const car = this.host.state();
    for (const i of this.icons) {
      const d = Math.hypot(i.spot.x - car.x, i.spot.z - car.z);
      i.s.visible = d < SHOW_DIST;
      if (i.s.visible) i.s.position.y = i.base + Math.sin(this.t * 2.4) * 0.3;
    }
    if (this.modal) {
      this.host.halt();
      return;
    }
    if (!car.inCar) return;
    let nearest: WorkshopSpot | null = null;
    for (const s of workshopSpots()) {
      const d = Math.hypot(car.x - s.x, car.z - s.z);
      if (d < 55 && !this.hinted.has(s.shop.id)) {
        this.hinted.add(s.shop.id);
        this.host.status(`🔧 ${s.shop.name} قدامك — هدّي ودخّل العربية جوّه الدايرة البرتقالي.`);
      }
      if (d > 110) this.hinted.delete(s.shop.id);
      if (inWorkshop(car, s)) nearest = s;
      else if (this.latch === s.shop.id && d > 30) this.latch = null;
    }
    if (nearest && this.latch !== nearest.shop.id) {
      this.latch = nearest.shop.id;
      this.note = '';
      this.openFor(nearest);
    }
  }

  close() {
    this.modal?.close();
    this.modal = null;
  }

  private openFor(spot: WorkshopSpot) {
    const render = (s: Sheet) => s.set(this.html(spot));
    this.modal = sheet(
      'workshop-sheet',
      '',
      (card, s) => {
        card.querySelector('[data-fix]')?.addEventListener('click', () => {
          this.fix();
          render(s);
        });
        card.querySelectorAll<HTMLElement>('[data-buy]').forEach((b) =>
          b.addEventListener('click', () => {
            this.buy(b.dataset.buy as never);
            render(s);
          })
        );
      },
      () => {
        this.modal = null;
      }
    );
    render(this.modal);
  }

  private fix() {
    const v = this.host.vehicle();
    const dmg = this.host.damage();
    if (dmg <= 0) {
      this.note = 'العربية زي الفل، مفيش فيها حاجة تتصلّح.';
      return;
    }
    if (REPAIR_RATE[v] <= 0) {
      this.host.setDamage(0);
      this.note = 'اتصلّحت ببلاش — الإدارة بتتحمّل تكلفة الدورية ✅';
      return;
    }
    const r = payRepair(v, dmg, wallet());
    if (r.fixed <= 0) {
      this.note = 'الرصيد مش مكفّي حتى لأول تصليحة. اشتغل كام مشوار وارجع يا ريّس.';
      return;
    }
    addWallet(-r.cost);
    this.host.repairPaid(r.cost);
    this.host.setDamage(Math.max(0, dmg - r.fixed));
    this.note =
      r.fixed >= dmg
        ? `تمام يا ريّس! العربية بقت جديدة — دفعت ${egp(r.cost)} ✅`
        : `صلّحنا ${r.fixed}% بس على قد الرصيد (${egp(r.cost)}).`;
  }

  private buy(id: 'engine' | 'accel' | 'brakes' | 'armor' | 'comfort' | 'special') {
    const v = this.host.vehicle();
    const t = tuningOf(v);
    const res = buyUpgrade(v, t, id, wallet());
    if (!res.ok) {
      this.note = res.reason === 'max' ? 'ده أعلى مستوى خلاص 💪' : 'الرصيد مش مكفّي، يلا اشتغل شوية وارجع.';
      return;
    }
    addWallet(-res.cost);
    setTuning(v, res.tuning);
    const info = catalogFor(v).find((u) => u.id === id)!;
    this.note = `اتركّب ${info.name} — مستوى ${res.tuning[id]} (دفعت ${egp(res.cost)}) ✅`;
  }

  private html(spot: WorkshopSpot): string {
    const v = this.host.vehicle();
    const dmg = this.host.damage();
    const t = tuningOf(v);
    const cash = wallet();
    const free = REPAIR_RATE[v] <= 0;
    const cost = repairCost(v, dmg);
    const rows = catalogFor(v)
      .map((u) => {
        const lv = t[u.id];
        const price = priceOf(v, u.id, lv);
        const pips = '●'.repeat(lv) + '○'.repeat(MAX_LEVEL - lv);
        const btn =
          price === null
            ? '<button type="button" disabled>أعلى مستوى</button>'
            : `<button type="button" data-buy="${u.id}" ${cash < price ? 'class="poor"' : ''}>${egp(price)}</button>`;
        return `<li><i>${u.icon}</i><span class="w-name"><b>${u.name}</b><small>${u.blurb}</small><em>${pips}</em></span>${btn}</li>`;
      })
      .join('');
    const fixBtn =
      dmg <= 0
        ? '<span class="w-ok">العربية زي الفل ✅</span>'
        : `<button type="button" data-fix ${!free && cash < 1 ? 'class="poor"' : ''}>${free ? 'صلّح ببلاش' : `صلّح كله — ${egp(cost)}`}</button>`;
    return `
      <h2>🔧 ${spot.shop.name}</h2>
      <p class="tx-sub">${VEHICLES[v].name} · الرصيد <b>${egp(cash)}</b></p>
      <div class="w-fix">
        <div class="w-hp"><span>الضرر ${Math.round(dmg)}%</span><i><u style="width:${Math.min(100, dmg)}%"></u></i></div>
        ${fixBtn}
      </div>
      ${this.note ? `<p class="w-note">${this.note}</p>` : ''}
      <ul class="w-list">${rows}</ul>
      <div class="tx-actions"><button type="button" data-close>تمام، كمّل شغل</button></div>`;
  }
}
