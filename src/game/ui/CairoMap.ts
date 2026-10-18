/**
 * Canvas renderer for the Cairo map (see logic/cairoMap.ts): Nile in blue, streets with Arabic names, district labels,
 * the playable stretches of the avenue, the officer and the call markers. Drag to pan, pinch / wheel / buttons to zoom,
 * tap a district pin to pick it.
 */
import {
  BOUNDS,
  ISLANDS,
  LINES,
  NILE_EAST,
  NILE_WEST,
  PARKS,
  PLACES,
  PLATEAU,
  playAreas,
  URBAN,
  areaCentre,
  clampView,
  fitView,
  km,
  mapHeading,
  project,
  toKm,
  toScreen,
  zoomAt,
  gameToMap,
  type Km,
  type Line,
  type View
} from '../logic/cairoMap';
import type { District } from '../logic/districts';
import { net } from '../logic/roadnet';
import { toLonLat } from '../logic/cairo';

const C = {
  land: '#1b2430',
  urban: '#232e3d',
  desert: '#3b3526',
  park: '#25492f',
  water: '#2b78c2',
  waterEdge: '#5aa6e8',
  island: '#2c4a3b',
  minor: '#46566b',
  major: '#8fa3ba',
  ring: '#b0875a',
  bridge: '#cfd9e6',
  corniche: '#6f93b8',
  text: '#e8f1ff',
  halo: 'rgba(8,14,24,0.9)'
};

/** Soft glow under each playable district. */
const GLOW: Record<District, string> = {
  suburb: 'rgba(214,170,90,0.5)',
  downtown: 'rgba(150,160,255,0.45)',
  port: 'rgba(230,110,140,0.45)',
  corniche: 'rgba(90,200,200,0.45)'
};

/** Where each pin's name sits, so neighbouring pins never write over each other. */
const LABEL_AT: Record<District, [number, number]> = {
  suburb: [0, -17],
  downtown: [46, 4],
  port: [0, -17],
  corniche: [-40, 4]
};

/** A pin that replaces the district pins (taxi ranks): where it is, its colour and a small badge. */
export interface MapPin {
  id: string;
  name: string;
  x: number;
  z: number;
  color: string;
  badge?: string;
}

export interface MapState {
  /** when set, these are drawn and picked instead of the four districts */
  pins?: MapPin[];
  /** officer position on the avenue */
  player: { x: number; z: number; yaw: number };
  /** district of the active call */
  missionId: string | null;
  /** current objective on the avenue, if any */
  objective: { x: number; z: number } | null;
  /** district the player has picked in the list */
  picked: string | null;
  /** district the officer is in */
  here: string | null;
}

export class CairoMap {
  view: View;
  state: MapState = { player: { x: 0, z: 0, yaw: 0 }, missionId: null, objective: null, picked: null, here: null };
  onPick: ((id: string) => void) | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private fit: View;
  private pointers = new Map<number, { x: number; y: number }>();
  private moved = 0;
  private pinch = 0;
  private raf = 0;
  private ctx: CanvasRenderingContext2D;
  // geometry in km, projected once
  private geo = {
    east: km(NILE_EAST),
    west: km(NILE_WEST),
    islands: ISLANDS.map((s) => km(s.pts)),
    plateau: km(PLATEAU.pts),
    parks: PARKS.map((s) => km(s.pts)),
    urban: km(URBAN),
    lines: LINES.map((l) => ({ l, p: km(l.pts) })),
    infill: net()
      .edges.filter((e) => e.infill && !e.ring)
      .map((e) => e.pts.map((p) => project(toLonLat(p.x, p.z))))
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.fit = fitView(canvas.clientWidth || 300, canvas.clientHeight || 300);
    this.view = this.fit;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        this.view = zoomAt(this.view, this.w, this.h, e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.25 : 0.8);
        this.draw();
      },
      { passive: false }
    );
    this.resize();
  }

  resize() {
    const c = this.canvas;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = c.clientWidth || 300;
    this.h = c.clientHeight || 300;
    c.width = Math.round(this.w * this.dpr);
    c.height = Math.round(this.h * this.dpr);
    const wasFit = this.view.scale <= this.fit.scale * 1.001;
    this.fit = fitView(this.w, this.h);
    this.view = wasFit ? this.fit : clampView(this.view, this.w, this.h);
    this.draw();
  }

  get zoom() {
    return this.view.scale / this.fit.scale;
  }

  zoomBy(f: number) {
    this.view = zoomAt(this.view, this.w, this.h, this.w / 2, this.h / 2, f);
    this.draw();
  }

  /** Centre on a playable district at a street-level zoom. */
  focus(id: string, zoom = 6) {
    const pin = this.state.pins?.find((p) => p.id === id);
    const c = pin ? gameToMap(pin.x, pin.z) : areaCentre(id as District);
    this.view = clampView({ cx: c.x, cy: c.y, scale: this.fit.scale * zoom }, this.w, this.h);
    this.draw();
  }

  showAll() {
    this.view = this.fit;
    this.draw();
  }

  /** Redraw on the next frame (cheap to call often). */
  invalidate() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  // ---- input
  private down(e: PointerEvent) {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    this.moved = 0;
    if (this.pointers.size === 2) this.pinch = this.pinchDist();
  }
  private pinchDist() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a!.x - b!.x, a!.y - b!.y);
  }
  private move(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.offsetX - p.x,
      dy = e.offsetY - p.y;
    p.x = e.offsetX;
    p.y = e.offsetY;
    this.moved += Math.abs(dx) + Math.abs(dy);
    if (this.pointers.size === 2) {
      const d = this.pinchDist();
      if (this.pinch > 0) {
        const [a, b] = [...this.pointers.values()];
        this.view = zoomAt(this.view, this.w, this.h, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2, d / this.pinch);
      }
      this.pinch = d;
    } else {
      this.view = clampView(
        { ...this.view, cx: this.view.cx - dx / this.view.scale, cy: this.view.cy + dy / this.view.scale },
        this.w,
        this.h
      );
    }
    this.invalidate();
  }
  private up(e: PointerEvent) {
    const had = this.pointers.has(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.pinch = 0;
    if (had && this.moved < 6 && this.pointers.size === 0) this.tap(e.offsetX, e.offsetY);
  }
  private tap(sx: number, sy: number) {
    let best: { id: string; d: number } | null = null;
    const pins = this.state.pins;
    if (pins) {
      for (const p of pins) {
        const s = toScreen(this.view, this.w, this.h, gameToMap(p.x, p.z));
        const d = Math.hypot(s.x - sx, s.y - sy);
        if (d < 26 && (!best || d < best.d)) best = { id: p.id, d };
      }
      if (best) this.onPick?.(best.id);
      return;
    }
    for (const a of playAreas()) {
      const s = toScreen(this.view, this.w, this.h, areaCentre(a.id));
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d < 26 && (!best || d < best.d)) best = { id: a.id, d };
    }
    if (best) this.onPick?.(best.id);
  }

  // ---- drawing
  private path(pts: Km[], close = false) {
    const ctx = this.ctx;
    pts.forEach((p, i) => {
      const s = toScreen(this.view, this.w, this.h, p);
      if (i) ctx.lineTo(s.x, s.y);
      else ctx.moveTo(s.x, s.y);
    });
    if (close) ctx.closePath();
  }

  /** Smooth open curve through the points (midpoint quadratic). */
  private curve(pts: Km[], cont = false) {
    const ctx = this.ctx;
    const s = pts.map((p) => toScreen(this.view, this.w, this.h, p));
    if (cont) ctx.lineTo(s[0]!.x, s[0]!.y);
    else ctx.moveTo(s[0]!.x, s[0]!.y);
    for (let i = 1; i < s.length - 1; i++) {
      const mx = (s[i]!.x + s[i + 1]!.x) / 2,
        my = (s[i]!.y + s[i + 1]!.y) / 2;
      ctx.quadraticCurveTo(s[i]!.x, s[i]!.y, mx, my);
    }
    const l = s[s.length - 1]!;
    ctx.lineTo(l.x, l.y);
  }

  private queue: { text: string; x: number; y: number; size: number; color: string; angle: number; prio: number }[] =
    [];

  /** Queue a name; names are written after everything else, most important first, and skipped when they would overlap. */
  private label(text: string, x: number, y: number, size: number, color = C.text, angle = 0, prio = 1) {
    this.queue.push({ text, x, y, size, color, angle, prio });
  }

  private flushLabels() {
    const ctx = this.ctx;
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const q = this.queue.sort((a, b) => b.prio - a.prio);
    this.queue = [];
    for (const l of q) {
      ctx.font = `700 ${l.size}px Cairo, Tahoma, sans-serif`;
      const tw = ctx.measureText(l.text).width + 4;
      const th = l.size + 3;
      const c = Math.abs(Math.cos(l.angle)),
        sn = Math.abs(Math.sin(l.angle));
      const hw = (tw * c + th * sn) / 2,
        hh = (tw * sn + th * c) / 2;
      if (l.prio >= 5) {
        l.x = Math.max(hw + 2, Math.min(this.w - hw - 2, l.x));
        l.y = Math.max(hh + 2, Math.min(this.h - hh - 2, l.y));
      }
      const box = { x0: l.x - hw, y0: l.y - hh, x1: l.x + hw, y1: l.y + hh };
      if (box.x0 < 0 || box.x1 > this.w || box.y0 < 0 || box.y1 > this.h) continue;
      if (placed.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0)) continue;
      placed.push(box);
      ctx.save();
      ctx.translate(l.x, l.y);
      if (l.angle) ctx.rotate(l.angle);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.direction = 'rtl';
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.halo;
      ctx.lineJoin = 'round';
      ctx.strokeText(l.text, 0, 0);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, 0, 0);
      ctx.restore();
    }
  }

  draw() {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const z = this.zoom;
    const px = (n: number) => n * Math.min(1.6, 0.8 + z * 0.12);
    ctx.fillStyle = C.land;
    ctx.fillRect(0, 0, w, h);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // desert beyond the city, built-up Cairo, the plateau, parks
    ctx.beginPath();
    this.path(this.geo.urban, true);
    ctx.fillStyle = C.urban;
    ctx.fill();
    ctx.beginPath();
    this.path(this.geo.plateau, true);
    ctx.fillStyle = C.desert;
    ctx.fill();
    ctx.fillStyle = C.park;
    for (const p of this.geo.parks) {
      ctx.beginPath();
      this.path(p, true);
      ctx.fill();
    }

    // the Nile: the banks enclose the water, the islands sit on top
    ctx.beginPath();
    const east = this.geo.east,
      west = [...this.geo.west].reverse();
    this.curve(east);
    this.curve(west, true);
    ctx.closePath();
    ctx.fillStyle = C.water;
    ctx.fill();
    ctx.strokeStyle = C.waterEdge;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    for (const isl of this.geo.islands) {
      ctx.beginPath();
      this.path(isl, true);
      ctx.fillStyle = C.island;
      ctx.fill();
      ctx.strokeStyle = C.waterEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // streets: casing first, then the line
    const order: Line['kind'][] = ['minor', 'corniche', 'major', 'ring', 'bridge'];
    const width = (k: Line['kind']) =>
      px(k === 'minor' ? 1.4 : k === 'corniche' ? 1.6 : k === 'bridge' ? 3 : k === 'ring' ? 2.6 : 2.4);
    const color = (k: Line['kind']) => C[k];
    for (const kind of order)
      for (const { l, p } of this.geo.lines) {
        if (l.kind !== kind) continue;
        if (kind === 'minor' && z < 2) continue;
        ctx.beginPath();
        this.curve(p);
        ctx.strokeStyle = 'rgba(8,14,24,0.85)';
        ctx.lineWidth = width(kind) + 2;
        ctx.stroke();
        ctx.beginPath();
        this.curve(p);
        ctx.strokeStyle = color(kind);
        ctx.lineWidth = width(kind);
        if (kind === 'ring') ctx.setLineDash([px(7), px(3)]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

    // the generated side streets of the network (the drawn ones are the lines above): every road you can drive
    if (z >= 2.4) {
      ctx.strokeStyle = C.minor;
      ctx.lineWidth = px(1.1);
      ctx.beginPath();
      for (const p of this.geo.infill) this.path(p);
      ctx.stroke();
    }

    // district colour blobs under their pins
    for (const a of playAreas()) {
      const s = toScreen(this.view, this.w, this.h, areaCentre(a.id));
      const r = Math.max(22, 0.7 * this.view.scale * 1.1);
      const grad = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, r);
      grad.addColorStop(0, GLOW[a.id as District]);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // names
    for (const { l, p } of this.geo.lines) {
      if (z < l.label || p.length < 2) continue;
      const mid = Math.floor((p.length - 1) / 2);
      const a = toScreen(this.view, this.w, this.h, p[mid]!),
        b = toScreen(this.view, this.w, this.h, p[mid + 1]!);
      let ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      if (a.x < -20 || a.x > w + 20 || a.y < -20 || a.y > h + 20) continue;
      this.label(
        l.name,
        (a.x + b.x) / 2,
        (a.y + b.y) / 2 - px(6),
        px(9),
        l.kind === 'bridge' ? '#ffffff' : '#cfe0f5',
        ang
      );
    }
    for (const pl of PLACES) {
      if (z < pl.zoom) continue;
      const s = toScreen(this.view, this.w, this.h, project(pl.at));
      if (s.x < 0 || s.x > w || s.y < 0 || s.y > h) continue;
      if (pl.kind === 'water') this.label(pl.name, s.x, s.y, px(11), '#9fd0ff', 0, 1.2);
      else if (pl.kind === 'area') this.label(pl.name, s.x, s.y, px(10), '#9fb3c8', 0, 1.1);
      else {
        ctx.fillStyle = pl.kind === 'landmark' ? '#ffb46a' : '#e8f1ff';
        ctx.beginPath();
        if (pl.name === 'الأهرامات' || pl.name === 'أبو الهول') {
          ctx.moveTo(s.x, s.y - 6);
          ctx.lineTo(s.x + 6, s.y + 4);
          ctx.lineTo(s.x - 6, s.y + 4);
          ctx.closePath();
        } else ctx.arc(s.x, s.y, pl.kind === 'square' ? 3 : 3.5, 0, Math.PI * 2);
        ctx.fill();
        this.label(pl.name, s.x, s.y + 11, px(9.5), pl.kind === 'landmark' ? '#ffd9b0' : '#e8f1ff', 0, 2);
      }
    }

    // district pins
    const st = this.state;
    for (const p of st.pins ?? []) {
      const s = toScreen(this.view, this.w, this.h, gameToMap(p.x, p.z));
      const picked = p.id === st.picked;
      ctx.beginPath();
      ctx.arc(s.x, s.y, picked ? 11 : 9, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.lineWidth = picked ? 3 : 2;
      ctx.strokeStyle = picked ? '#ffd56a' : '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#10213f';
      ctx.font = '800 11px Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.badge ?? '', s.x, s.y + 0.5);
      this.label(p.name, s.x, s.y - 17, 12, picked ? '#ffd56a' : '#ffffff', 0, 5);
    }
    for (const a of st.pins ? [] : playAreas()) {
      const s = toScreen(this.view, this.w, this.h, areaCentre(a.id));
      const mission = a.id === st.missionId,
        picked = a.id === st.picked;
      ctx.beginPath();
      ctx.arc(s.x, s.y, picked ? 11 : 9, 0, Math.PI * 2);
      ctx.fillStyle = mission ? '#ff4d6d' : '#2f8fe8';
      ctx.fill();
      ctx.lineWidth = picked ? 3 : 2;
      ctx.strokeStyle = picked ? '#ffd56a' : '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 10px Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mission ? '!' : '', s.x, s.y + 0.5);
      const off = LABEL_AT[a.id as District];
      this.label(
        a.name + (mission ? ' · بلاغ' : ''),
        s.x + off[0],
        s.y + off[1],
        12.5,
        mission ? '#ffb3c0' : picked ? '#ffd56a' : '#ffffff',
        0,
        5
      );
    }

    // the current objective and the officer
    if (st.objective) {
      const o = toScreen(this.view, this.w, this.h, gameToMap(st.objective.x, st.objective.z));
      ctx.beginPath();
      ctx.arc(o.x, o.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd23d';
      ctx.fill();
      ctx.strokeStyle = '#1b2430';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const me = toScreen(this.view, this.w, this.h, gameToMap(st.player.x, st.player.z));
    const ang = -mapHeading(st.player.yaw);
    ctx.save();
    ctx.translate(me.x, me.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-6, 6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, -6);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0b4a9a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    this.flushLabels();
    this.furniture();
  }

  /** North arrow and a 1 km / 5 km scale bar. */
  private furniture() {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.fillStyle = 'rgba(8,14,24,0.7)';
    ctx.beginPath();
    ctx.arc(w - 22, 22, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(w - 22, 9);
    ctx.lineTo(w - 17, 24);
    ctx.lineTo(w - 22, 21);
    ctx.lineTo(w - 27, 24);
    ctx.closePath();
    ctx.fill();
    ctx.font = '700 9px Cairo, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fb3c8';
    ctx.fillText('شمال', w - 22, 40);
    const kmLen = this.zoom > 4 ? 0.5 : this.zoom > 1.8 ? 1 : 2;
    const len = kmLen * this.view.scale;
    const x0 = w - 12 - len;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, h - 12);
    ctx.lineTo(x0 + len, h - 12);
    ctx.moveTo(x0, h - 16);
    ctx.lineTo(x0, h - 8);
    ctx.moveTo(x0 + len, h - 16);
    ctx.lineTo(x0 + len, h - 8);
    ctx.stroke();
    this.label(`${kmLen} كم`, x0 + len / 2, h - 22, 10, '#ffffff', 0, 9);
    this.flushLabels();
  }

  /** Km point under a screen position (for tests and tooling). */
  at(sx: number, sy: number) {
    return toKm(this.view, this.w, this.h, sx, sy);
  }
}

export { BOUNDS };
