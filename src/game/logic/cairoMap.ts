/**
 * The Cairo map screen's data. It reads the same hand-drawn geometry the game world is built from (logic/cairo.ts): the
 * Nile banks, islands, streets, squares and landmarks are the playable ones, so what the map shows is what you can drive.
 * The only things drawn for the map alone are the built-up outline, the plateau shading and the parks. No map tiles and no
 * imported map data; positions are approximate longitude/latitude of well-known places. Pure data and maths, no rendering.
 */
import {
  BANK_EAST,
  BANK_WEST,
  ISLANDS as GAME_ISLANDS,
  LANDMARKS,
  PLATEAU as GAME_PLATEAU,
  STREETS,
  ORIGIN,
  toLonLat,
  type LonLat
} from './cairo';
import { places } from './places';

export type { LonLat };
export { ORIGIN };
/** Kilometres east / north of the map origin (Tahrir Square). */
export interface Km {
  x: number;
  y: number;
}

const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LON = 111.32 * Math.cos((ORIGIN[1] * Math.PI) / 180);

export function project(p: LonLat): Km {
  return { x: (p[0] - ORIGIN[0]) * KM_PER_DEG_LON, y: (p[1] - ORIGIN[1]) * KM_PER_DEG_LAT };
}

/** Everything the map shows, in this box: west of the pyramids to Shubra, Maadi to Shubra El Kheima. */
export const BOUNDS: { w: number; e: number; s: number; n: number } = (() => {
  const a = project([31.108, 29.935]);
  const b = project([31.276, 30.148]);
  return { w: a.x, s: a.y, e: b.x, n: b.y };
})();

export interface Line {
  name: string;
  pts: readonly LonLat[];
  kind: 'major' | 'minor' | 'ring' | 'bridge' | 'corniche';
  /** zoom (1 = whole map) from which the name is written */
  label: number;
}
export interface Place {
  name: string;
  at: LonLat;
  kind: 'square' | 'landmark' | 'area' | 'district' | 'water';
  /** zoom from which it shows */
  zoom: number;
}
export interface Shape {
  name: string;
  pts: readonly LonLat[];
}

/** East and west banks of the Nile, south to north: the same banks the game world cuts its river from. */
export const NILE_EAST: readonly LonLat[] = BANK_EAST;
export const NILE_WEST: readonly LonLat[] = BANK_WEST;
export const ISLANDS: readonly Shape[] = GAME_ISLANDS;
/** Giza plateau (rock and sand) and the green spaces. */
export const PLATEAU: Shape = { name: 'هضبة الأهرام', pts: GAME_PLATEAU };
export const PARKS: readonly Shape[] = [
  {
    name: 'حديقة الحيوان والأورمان',
    pts: [
      [31.2105, 30.0225],
      [31.2175, 30.0235],
      [31.2178, 30.0305],
      [31.2115, 30.0305]
    ]
  },
  {
    name: 'جامعة القاهرة',
    pts: [
      [31.2035, 30.0225],
      [31.2105, 30.0225],
      [31.2105, 30.0165],
      [31.2035, 30.0165]
    ]
  }
];
/** Built-up Cairo, to tell the city from the desert on the west edge. */
export const URBAN: readonly LonLat[] = [
  [31.272, 29.953],
  [31.2, 29.953],
  [31.168, 29.972],
  [31.1625, 29.99],
  [31.158, 30.04],
  [31.165, 30.085],
  [31.192, 30.115],
  [31.232, 30.14],
  [31.272, 30.14]
];

const BRIDGE = /bridge|^bridge-|^galaa$|^university$|^imbaba-br$/;
/** The drawn streets of the game, as map lines (the infill grid is drawn from the network itself, not listed here). */
export const LINES: readonly Line[] = STREETS.map((st): Line => {
  const kind: Line['kind'] = st.ring
    ? 'minor'
    : st.id === 'ring'
      ? 'ring'
      : BRIDGE.test(st.id)
        ? 'bridge'
        : st.id.startsWith('corniche')
          ? 'corniche'
          : st.cls === 'arterial'
            ? 'major'
            : 'minor';
  const label = kind === 'bridge' ? 2.6 : kind === 'corniche' ? 2.4 : st.cls === 'arterial' ? 1.6 : 3.2;
  return { name: st.name, pts: st.pts, kind, label };
});

export const PLACES: readonly Place[] = LANDMARKS;

/** The four playable districts: the point on their main street where the officer is posted, and the street's name. */
export interface PlayArea {
  id: 'suburb' | 'downtown' | 'port' | 'corniche';
  name: string;
  at: LonLat;
  street: string;
}
export function playAreas(): PlayArea[] {
  return places().map((p) => ({ id: p.id, name: p.name, at: toLonLat(p.x, p.z), street: p.street }));
}

/** Centre of a playable district on the map (for pins and zoom). */
export function areaCentre(id: PlayArea['id']): Km {
  const a = playAreas().find((p) => p.id === id) ?? playAreas()[0]!;
  return project(a.at);
}

/** Where the game point (x, z) is on the map, in km. The map is a plain scaled copy of the world: 1 world m = 5 real m. */
export function gameToMap(x: number, z: number): Km {
  return project(toLonLat(x, z));
}

/** Direction the player faces on the map (radians from east, counter-clockwise): yaw 0 faces south (+z), yaw grows to the east side first. */
export function mapHeading(yaw: number): number {
  return Math.atan2(-Math.cos(yaw), Math.sin(yaw));
}

export interface View {
  /** centre in km */
  cx: number;
  cy: number;
  /** pixels per km */
  scale: number;
}

/** View that fits `BOUNDS` into a w x h canvas. */
export function fitView(w: number, h: number, pad = 8): View {
  const bw = BOUNDS.e - BOUNDS.w,
    bh = BOUNDS.n - BOUNDS.s;
  const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  return { cx: (BOUNDS.e + BOUNDS.w) / 2, cy: (BOUNDS.n + BOUNDS.s) / 2, scale };
}

export const toScreen = (v: View, w: number, h: number, p: Km) => ({
  x: w / 2 + (p.x - v.cx) * v.scale,
  y: h / 2 - (p.y - v.cy) * v.scale
});
export const toKm = (v: View, w: number, h: number, sx: number, sy: number): Km => ({
  x: v.cx + (sx - w / 2) / v.scale,
  y: v.cy - (sy - h / 2) / v.scale
});

/** Keep the view over the map: zoom within [1x, 24x] of the fitted view and the centre inside the bounds. */
export function clampView(v: View, w: number, h: number): View {
  const fit = fitView(w, h);
  const scale = Math.max(fit.scale, Math.min(fit.scale * 24, v.scale));
  return {
    scale,
    cx: Math.max(BOUNDS.w, Math.min(BOUNDS.e, v.cx)),
    cy: Math.max(BOUNDS.s, Math.min(BOUNDS.n, v.cy))
  };
}

/** Zoom by `factor` keeping the km point under screen position (sx, sy) fixed. */
export function zoomAt(v: View, w: number, h: number, sx: number, sy: number, factor: number): View {
  const p = toKm(v, w, h, sx, sy);
  const scale = v.scale * factor;
  const next = { scale, cx: p.x - (sx - w / 2) / scale, cy: p.y + (sy - h / 2) / scale };
  return clampView(next, w, h);
}

/** All the geometry as km, once. */
export const km = (pts: readonly LonLat[]): Km[] => pts.map(project);
