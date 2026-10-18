/**
 * Central and western Cairo as a stylised vector map. All shapes are drawn by hand from approximate longitude/latitude
 * of well-known places (no map tiles, no imported map data), simplified so they read at phone size.
 *
 * The playable avenue is one straight street a few hundred metres long, so each of the four districts is shown where it
 * really is and the avenue's stretch through that district is drawn as a short piece of its real street:
 * Haram on Haram Street, Downtown between Talaat Harb and Tahrir squares, Shubra on Shubra Street, Dokki from Mesaha
 * Square to the Nile, then the bridge to Gezira island and the Cairo Tower. Pure data and maths, no rendering.
 */
import type { District } from './districts';

export type LonLat = readonly [number, number];
/** Kilometres east / north of the map origin (Tahrir Square). */
export interface Km {
  x: number;
  y: number;
}

export const ORIGIN: LonLat = [31.2357, 30.0444];
const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LON = 111.32 * Math.cos((ORIGIN[1] * Math.PI) / 180);

export function project(p: LonLat): Km {
  return { x: (p[0] - ORIGIN[0]) * KM_PER_DEG_LON, y: (p[1] - ORIGIN[1]) * KM_PER_DEG_LAT };
}

/** Everything the map shows, in this box: west of the pyramids to Shubra, Maadi to Shubra El Kheima. */
export const BOUNDS: { w: number; e: number; s: number; n: number } = (() => {
  const a = project([31.108, 29.948]);
  const b = project([31.276, 30.142]);
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

/** East and west banks of the Nile, south to north. */
export const NILE_EAST: readonly LonLat[] = [
  [31.244, 29.95],
  [31.2385, 29.975],
  [31.2345, 29.995],
  [31.232, 30.012],
  [31.2318, 30.03],
  [31.2318, 30.046],
  [31.2325, 30.058],
  [31.231, 30.072],
  [31.229, 30.088],
  [31.232, 30.105],
  [31.24, 30.125],
  [31.25, 30.14]
];
export const NILE_WEST: readonly LonLat[] = [
  [31.233, 29.95],
  [31.2265, 29.975],
  [31.2215, 29.995],
  [31.217, 30.012],
  [31.2178, 30.03],
  [31.219, 30.046],
  [31.2185, 30.058],
  [31.216, 30.072],
  [31.214, 30.088],
  [31.22, 30.105],
  [31.229, 30.125],
  [31.24, 30.14]
];
export const ISLANDS: readonly Shape[] = [
  {
    name: 'الجزيرة',
    pts: [
      [31.2268, 30.0285],
      [31.2285, 30.04],
      [31.2288, 30.056],
      [31.2275, 30.07],
      [31.225, 30.077],
      [31.2215, 30.07],
      [31.2212, 30.056],
      [31.2215, 30.042],
      [31.2235, 30.031]
    ]
  },
  {
    name: 'الروضة',
    pts: [
      [31.224, 29.998],
      [31.2285, 30.008],
      [31.229, 30.02],
      [31.2262, 30.028],
      [31.2232, 30.018],
      [31.2225, 30.006]
    ]
  }
];
/** Giza plateau (rock and sand) and the green spaces. */
export const PLATEAU: Shape = {
  name: 'هضبة الأهرام',
  pts: [
    [31.113, 29.953],
    [31.155, 29.957],
    [31.158, 29.984],
    [31.15, 29.995],
    [31.113, 29.996]
  ]
};
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

export const LINES: readonly Line[] = [
  {
    name: 'شارع الهرم',
    kind: 'major',
    label: 1,
    pts: [
      [31.2089, 30.0131],
      [31.1985, 30.0095],
      [31.1758, 29.999],
      [31.156, 29.989],
      [31.1342, 29.9792]
    ]
  },
  {
    name: 'شارع فيصل',
    kind: 'major',
    label: 1.6,
    pts: [
      [31.211, 30.0165],
      [31.199, 30.013],
      [31.1758, 30.0043],
      [31.16, 30.0],
      [31.145, 29.9955]
    ]
  },
  {
    name: 'الطريق الدائري',
    kind: 'ring',
    label: 1,
    pts: [
      [31.25, 29.95],
      [31.205, 29.964],
      [31.175, 29.976],
      [31.158, 29.99],
      [31.156, 30.015],
      [31.158, 30.04],
      [31.165, 30.07],
      [31.185, 30.095],
      [31.215, 30.115],
      [31.26, 30.128]
    ]
  },
  {
    name: 'كورنيش النيل',
    kind: 'corniche',
    label: 2.4,
    pts: [
      [31.2385, 29.975],
      [31.2345, 29.995],
      [31.2325, 30.012],
      [31.2322, 30.03],
      [31.2322, 30.046],
      [31.233, 30.058],
      [31.2315, 30.072],
      [31.2295, 30.088]
    ]
  },
  {
    name: 'كوبري ٦ أكتوبر',
    kind: 'bridge',
    label: 1,
    pts: [
      [31.2, 30.051],
      [31.215, 30.0495],
      [31.2292, 30.0492],
      [31.2335, 30.0535],
      [31.2469, 30.0614],
      [31.265, 30.068],
      [31.272, 30.0705]
    ]
  },
  {
    name: 'كوبري قصر النيل',
    kind: 'bridge',
    label: 2.6,
    pts: [
      [31.2337, 30.0452],
      [31.229, 30.0459]
    ]
  },
  {
    name: 'كوبري التحرير',
    kind: 'bridge',
    label: 2.6,
    pts: [
      [31.2188, 30.0424],
      [31.2237, 30.0426]
    ]
  },
  {
    name: 'شارع التحرير',
    kind: 'major',
    label: 2.4,
    pts: [
      [31.2128, 30.0376],
      [31.216, 30.0398],
      [31.2188, 30.0424]
    ]
  },
  {
    name: 'شارع طلعت حرب',
    kind: 'major',
    label: 3,
    pts: [
      [31.2357, 30.0444],
      [31.2375, 30.0468],
      [31.2394, 30.049]
    ]
  },
  {
    name: 'شارع قصر النيل',
    kind: 'major',
    label: 3,
    pts: [
      [31.2337, 30.0452],
      [31.2357, 30.0444],
      [31.2394, 30.0494]
    ]
  },
  {
    name: 'شارع شبرا',
    kind: 'major',
    label: 1,
    pts: [
      [31.2469, 30.0614],
      [31.2455, 30.07],
      [31.244, 30.08],
      [31.244, 30.095],
      [31.2447, 30.11],
      [31.2435, 30.125]
    ]
  },
  {
    name: 'شارع رمسيس',
    kind: 'minor',
    label: 3,
    pts: [
      [31.2469, 30.0614],
      [31.2425, 30.0555],
      [31.2395, 30.0495]
    ]
  },
  {
    name: 'شارع جامعة الدول العربية',
    kind: 'minor',
    label: 2.8,
    pts: [
      [31.2185, 30.0545],
      [31.208, 30.0575],
      [31.2, 30.0615]
    ]
  },
  {
    name: 'شارع الجيزة',
    kind: 'minor',
    label: 3.2,
    pts: [
      [31.2089, 30.0131],
      [31.2125, 30.0245],
      [31.2128, 30.0376]
    ]
  }
];

export const PLACES: readonly Place[] = [
  { name: 'الأهرامات', at: [31.1342, 29.9792], kind: 'landmark', zoom: 1 },
  { name: 'أبو الهول', at: [31.1376, 29.9753], kind: 'landmark', zoom: 3.2 },
  { name: 'ميدان التحرير', at: [31.2357, 30.0444], kind: 'square', zoom: 2.2 },
  { name: 'ميدان طلعت حرب', at: [31.2394, 30.049], kind: 'square', zoom: 3.2 },
  { name: 'ميدان رمسيس', at: [31.2469, 30.0614], kind: 'square', zoom: 1.8 },
  { name: 'ميدان المساحة', at: [31.2128, 30.0376], kind: 'square', zoom: 2.2 },
  { name: 'ميدان الجيزة', at: [31.2089, 30.0131], kind: 'square', zoom: 2 },
  { name: 'برج القاهرة', at: [31.2244, 30.0458], kind: 'landmark', zoom: 1.5 },
  { name: 'دار الأوبرا', at: [31.2237, 30.0424], kind: 'landmark', zoom: 3.4 },
  { name: 'المهندسين', at: [31.2, 30.0585], kind: 'area', zoom: 1 },
  { name: 'إمبابة', at: [31.2025, 30.0795], kind: 'area', zoom: 1 },
  { name: 'الزمالك', at: [31.2252, 30.0625], kind: 'area', zoom: 2 },
  { name: 'الجيزة', at: [31.2025, 30.0085], kind: 'area', zoom: 1 },
  { name: 'فيصل', at: [31.1735, 30.0105], kind: 'area', zoom: 1 },
  { name: 'المنيب', at: [31.22, 29.9665], kind: 'area', zoom: 1 },
  { name: 'شبرا الخيمة', at: [31.2425, 30.1255], kind: 'area', zoom: 1 },
  { name: 'النيل', at: [31.2312, 30.0985], kind: 'water', zoom: 1 },
  { name: 'النيل', at: [31.2205, 29.9855], kind: 'water', zoom: 1.6 }
];

/** The four playable districts: where each one really is, its colour, and the piece of its real street the avenue stands for. */
export interface PlayArea {
  id: District | 'bridge' | 'island';
  name: string;
  /** game z range */
  z0: number;
  z1: number;
  /** where the avenue enters and leaves this stretch on the real map */
  a: LonLat;
  b: LonLat;
  /** the real street the stretch follows */
  street: string;
}
export const PLAY_AREAS: readonly PlayArea[] = [
  { id: 'suburb', name: 'الهرم', z0: -100, z1: -45, a: [31.1425, 29.9825], b: [31.176, 29.9995], street: 'شارع الهرم' },
  {
    id: 'downtown',
    name: 'وسط البلد',
    z0: -45,
    z1: 50,
    a: [31.2394, 30.049],
    b: [31.2357, 30.0444],
    street: 'شارع طلعت حرب'
  },
  { id: 'port', name: 'شبرا', z0: 50, z1: 145, a: [31.2469, 30.0614], b: [31.244, 30.0905], street: 'شارع شبرا' },
  {
    id: 'corniche',
    name: 'الدقي',
    z0: 145,
    z1: 240,
    a: [31.2128, 30.0376],
    b: [31.2188, 30.0424],
    street: 'شارع التحرير'
  },
  {
    id: 'bridge',
    name: 'الكوبري',
    z0: 240,
    z1: 372,
    a: [31.2188, 30.0424],
    b: [31.2237, 30.0426],
    street: 'كوبري التحرير'
  },
  { id: 'island', name: 'الجزيرة', z0: 372, z1: 920, a: [31.2237, 30.0426], b: [31.2244, 30.0458], street: 'الجزيرة' }
];

/** Centre of a playable district on the map (for pins and zoom). */
export function areaCentre(id: PlayArea['id']): Km {
  const a = PLAY_AREAS.find((p) => p.id === id) ?? PLAY_AREAS[0]!;
  const p = project(a.a),
    q = project(a.b);
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
}

/** Where the avenue point (x, z) is on the real map, in km. Lateral offset is exaggerated a little so the dot sits on the street. */
export function gameToMap(x: number, z: number): Km {
  const first = PLAY_AREAS[0]!;
  const last = PLAY_AREAS[PLAY_AREAS.length - 1]!;
  const area = z <= first.z0 ? first : z >= last.z1 ? last : (PLAY_AREAS.find((p) => z >= p.z0 && z < p.z1) ?? last);
  const t = Math.max(0, Math.min(1, (z - area.z0) / (area.z1 - area.z0)));
  const a = project(area.a),
    b = project(area.b);
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // perpendicular, to the left of the direction of travel
  const off = (x / 8) * 0.05;
  return { x: a.x + dx * t - (dy / len) * off, y: a.y + dy * t + (dx / len) * off };
}

/** Direction of travel along the avenue on the map (radians from east, counter-clockwise): for the heading arrow. */
export function mapHeading(z: number, yaw: number): number {
  const area = PLAY_AREAS.find((p) => z >= p.z0 && z < p.z1) ?? PLAY_AREAS[PLAY_AREAS.length - 1]!;
  const a = project(area.a),
    b = project(area.b);
  const along = Math.atan2(b.y - a.y, b.x - a.x);
  // facing +z is yaw 0 and a positive yaw turns left, which is counter-clockwise on the map
  return along + yaw;
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
