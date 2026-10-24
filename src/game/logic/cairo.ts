/**
 * Central and western Cairo as the game world: hand-drawn, approximate geometry from the longitude/latitude of well-known
 * places (no imported map data, no tiles). One world metre stands for five real metres, so the Nile is a 50-70 m river and
 * Tahrir to Mesaha is a drive of about 600 m, while roads keep their real-size lanes. Pure data and maths, shared by the road
 * network, the world builder and the map screen.
 *
 * World axes: x grows east, z grows south (so north is -z, like the three.js default), the origin is Tahrir Square.
 */
export type LonLat = readonly [number, number];
export interface V2 {
  x: number;
  z: number;
}

/** World metres per real metre. */
export const WORLD_SCALE = 0.2;
/** The Cairo Tower on Gezira (its plaza is kept free of streets and buildings). */
export const TOWER_LL: LonLat = [31.2244, 30.0458];
export const ORIGIN: LonLat = [31.2357, 30.0444];
const M_PER_DEG_LAT = 110570;
const M_PER_DEG_LON = 111320 * Math.cos((ORIGIN[1] * Math.PI) / 180);

export function toWorld(p: LonLat): V2 {
  return {
    x: (p[0] - ORIGIN[0]) * M_PER_DEG_LON * WORLD_SCALE,
    z: -(p[1] - ORIGIN[1]) * M_PER_DEG_LAT * WORLD_SCALE
  };
}
export function toLonLat(x: number, z: number): LonLat {
  return [ORIGIN[0] + x / (M_PER_DEG_LON * WORLD_SCALE), ORIGIN[1] - z / (M_PER_DEG_LAT * WORLD_SCALE)];
}

/** The playable world: roads run to these limits (a checkpoint barrier closes each one). */
export const WORLD_BOX = (() => {
  const a = toWorld([31.114, 30.1345]);
  const b = toWorld([31.2695, 29.9435]);
  return { x0: a.x, x1: b.x, z0: a.z, z1: b.z };
})();

export type RoadClass = 'arterial' | 'collector' | 'local';
/** Half width of the carriageway, and the pavement beyond it. */
export const ROAD_HALF: Record<RoadClass, number> = { arterial: 8.6, collector: 6.5, local: 5.3 };
export const PAVEMENT = 3.2;

export interface Street {
  id: string;
  name: string;
  cls: RoadClass;
  /** lon/lat points; smoothed into a curve when the network is built */
  pts: readonly LonLat[];
  /** one-way ring road of a square (counter-clockwise seen from above) */
  ring?: { c: LonLat; r: number };
}

const s = (id: string, name: string, cls: RoadClass, pts: LonLat[]): Street => ({ id, name, cls, pts });
/** A corniche runs along the quay, a little inland (dLon < 0 on the west bank, > 0 on the east bank). */
const inland = (pts: LonLat[], dLon: number): LonLat[] => pts.map(([a, b]) => [a + dLon, b] as LonLat);

/** East bank of the Nile (the quay wall), south to north, then the west bank. Extended past the world box so the river reaches the horizon. */
export const BANK_EAST: readonly LonLat[] = [
  [31.2465, 29.94],
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
  [31.2535, 30.145]
];
export const BANK_WEST: readonly LonLat[] = [
  [31.2355, 29.94],
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
  [31.2425, 30.145]
];
export interface Island {
  name: string;
  pts: readonly LonLat[];
}
export const ISLANDS: readonly Island[] = [
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

/** Giza plateau (rock and sand). */
export const PLATEAU: readonly LonLat[] = [
  [31.113, 29.953],
  [31.155, 29.957],
  [31.158, 29.984],
  [31.15, 29.995],
  [31.113, 29.996]
];

export const STREETS: readonly Street[] = [
  // ---- Giza, Haram and the Ring Road
  s('haram', 'شارع الهرم', 'arterial', [
    [31.2089, 30.0131],
    [31.1985, 30.0095],
    [31.1758, 29.999],
    [31.156, 29.989],
    [31.1494, 29.9898],
    // the real west end (OpenStreetMap): the Mena House junction below the plateau, not inside the Great Pyramid
    [31.1358, 29.9849]
  ]),
  s('faisal', 'شارع فيصل', 'arterial', [
    [31.2089, 30.0131],
    [31.1995, 30.016],
    [31.1758, 30.0043],
    [31.16, 30.0],
    [31.1452, 29.9955],
    [31.131, 29.9895],
    [31.1145, 29.9835]
  ]),
  s('ring', 'الطريق الدائري', 'arterial', [
    [31.2515, 29.9442],
    [31.25, 29.95],
    [31.205, 29.964],
    [31.175, 29.976],
    [31.158, 29.99],
    [31.156, 30.015],
    [31.158, 30.04],
    [31.165, 30.07],
    [31.185, 30.095],
    [31.215, 30.115],
    [31.26, 30.128],
    [31.2625, 30.1335]
  ]),
  // from the end of Haram Street round the east of the plateau to the Sphinx gate, clear of the pyramids
  s('pyramids-spur', 'طريق الأهرام - المنصة', 'collector', [
    [31.1358, 29.9849],
    [31.1392, 29.9815],
    [31.1398, 29.9785],
    [31.1392, 29.9762]
  ]),
  s('maryoutia', 'شارع المريوطية', 'collector', [
    [31.1985, 30.0095],
    [31.1962, 30.0002],
    [31.1935, 29.9905],
    [31.1885, 29.9782],
    [31.18, 29.968],
    [31.172, 29.9575],
    [31.1655, 29.9442]
  ]),
  s('giza-st', 'شارع الجيزة', 'arterial', [
    [31.2089, 30.0131],
    [31.2125, 30.0245],
    [31.2128, 30.0376]
  ]),
  s('giza-south', 'شارع ترسا', 'collector', [
    [31.2089, 30.0131],
    [31.2112, 30.0035],
    [31.2152, 29.9935],
    [31.2188, 29.9805],
    [31.2215, 29.967],
    [31.2235, 29.9555],
    [31.2255, 29.9442]
  ]),
  s('university', 'كوبري الجامعة', 'arterial', [
    [31.2089, 30.0131],
    [31.217, 30.0145],
    [31.225, 30.0175],
    [31.2325, 30.0185]
  ]),
  s('sudan', 'شارع السودان', 'collector', [
    [31.1985, 30.0095],
    [31.1985, 30.0215],
    [31.1995, 30.034],
    [31.2005, 30.0462]
  ]),
  // ---- Dokki, Mohandessin, Imbaba
  s('tahrir-dokki', 'شارع التحرير', 'arterial', [
    [31.2128, 30.0376],
    [31.216, 30.0398],
    [31.2188, 30.0424]
  ]),
  s('dokki-st', 'شارع الدقي', 'collector', [
    [31.2128, 30.0376],
    [31.209, 30.0412],
    [31.204, 30.045],
    [31.1985, 30.048],
    [31.19, 30.0515]
  ]),
  s('mosaddak', 'شارع مصدق', 'collector', [
    [31.2128, 30.0376],
    [31.2145, 30.0425],
    [31.2165, 30.047],
    [31.2185, 30.052]
  ]),
  s(
    'nile-west',
    'كورنيش النيل - الجيزة',
    'collector',
    inland(
      [
        [31.2188, 30.0424],
        [31.2178, 30.0305],
        [31.2171, 30.0215],
        [31.2136, 30.0245]
      ],
      -0.0011
    )
  ),
  s('gameat-dowal', 'شارع جامعة الدول العربية', 'arterial', [
    [31.2185, 30.0545],
    [31.208, 30.0575],
    [31.2, 30.0615],
    [31.19, 30.067],
    [31.1655, 30.0705]
  ]),
  s('shehab', 'شارع شهاب', 'collector', [
    [31.2005, 30.0462],
    [31.2055, 30.0535],
    [31.2085, 30.0578]
  ]),
  s('tahrir-bridge', 'كوبري التحرير', 'arterial', [
    [31.2188, 30.0424],
    [31.2237, 30.0426]
  ]),
  s(
    'nile-west-n',
    'كورنيش إمبابة',
    'collector',
    inland(
      [
        [31.2185, 30.0545],
        [31.2181, 30.0605],
        [31.2157, 30.0725],
        [31.2129, 30.0885]
      ],
      -0.0007
    )
  ),
  s('galaa', 'كوبري الجلاء', 'arterial', [
    [31.2185, 30.0575],
    [31.223, 30.06],
    [31.2268, 30.0612],
    [31.2325, 30.0628],
    [31.2395, 30.0645]
  ]),
  s('imbaba-br', 'كوبري إمبابة', 'collector', [
    [31.2122, 30.0885],
    [31.222, 30.0885],
    [31.2326, 30.0887]
  ]),
  s('imbaba-st', 'شارع الوحدة', 'collector', [
    [31.19, 30.067],
    [31.1975, 30.0765],
    [31.2055, 30.0845],
    [31.2122, 30.0885]
  ]),
  // ---- Gezira and Zamalek
  s('gezira-s', 'شارع الجزيرة', 'collector', [
    [31.2237, 30.0426],
    [31.2259, 30.0448],
    [31.2264, 30.0505],
    [31.2262, 30.0562],
    [31.2255, 30.0625],
    [31.2248, 30.0705]
  ]),
  s('gezira-link', 'شارع الأوبرا', 'collector', [
    [31.2237, 30.0426],
    [31.2262, 30.0442],
    [31.2282, 30.0457]
  ]),
  s('qasr-nile-bridge', 'كوبري قصر النيل', 'arterial', [
    [31.2282, 30.0457],
    [31.2337, 30.0452]
  ]),
  s('26july', 'شارع ٢٦ يوليو', 'arterial', [
    [31.2394, 30.049],
    [31.2335, 30.0528],
    [31.2292, 30.0548],
    [31.2262, 30.0562]
  ]),
  // ---- Downtown and the east bank
  s('qasr-nile', 'شارع قصر النيل', 'arterial', [
    [31.2337, 30.0452],
    [31.2357, 30.0444]
  ]),
  s('corniche-e', 'كورنيش النيل', 'collector', [
    // the first stretch passes the Tahrir roundabout on the river side, clear of it
    [31.2337, 30.0452],
    [31.2333, 30.0432],
    ...inland(
      [
        [31.2334, 30.0392],
        [31.2326, 30.03],
        [31.2325, 30.0185],
        [31.2338, 30.0075],
        [31.2345, 29.9955]
      ],
      0.0007
    )
  ]),
  s(
    'corniche-e-n',
    'كورنيش النيل - شبرا',
    'collector',
    inland(
      [
        [31.2337, 30.0452],
        [31.2338, 30.0505],
        [31.2342, 30.058],
        [31.2328, 30.072],
        [31.231, 30.088],
        [31.2335, 30.105],
        [31.2405, 30.125],
        [31.2457, 30.1335]
      ],
      0.0007
    )
  ),
  s('talaat-harb', 'شارع طلعت حرب', 'arterial', [
    [31.2357, 30.0444],
    [31.2375, 30.0468],
    [31.2394, 30.049]
  ]),
  s('qasr-aini', 'شارع قصر العيني', 'arterial', [
    [31.2357, 30.0444],
    [31.2358, 30.036],
    [31.2352, 30.0288],
    [31.2336, 30.0262]
  ]),
  s('mohamed-mahmoud', 'شارع محمد محمود', 'collector', [
    [31.2357, 30.0444],
    [31.242, 30.0428],
    [31.248, 30.0415],
    [31.256, 30.04]
  ]),
  s('bab-louk', 'شارع الجمهورية', 'collector', [
    [31.2357, 30.0444],
    [31.2395, 30.0405],
    [31.244, 30.0385],
    [31.2495, 30.0355]
  ]),
  s('ramses', 'شارع رمسيس', 'arterial', [
    [31.2394, 30.049],
    [31.2425, 30.0555],
    [31.2469, 30.0614]
  ]),
  s('gomhoreya', 'شارع عبد الخالق ثروت', 'collector', [
    [31.2394, 30.049],
    [31.244, 30.0505],
    [31.248, 30.0525],
    [31.2555, 30.0555]
  ]),
  s('bridge-6oct', 'كوبري ٦ أكتوبر', 'arterial', [
    [31.1585, 30.0525],
    [31.18, 30.0515],
    [31.2, 30.051],
    [31.2085, 30.0508],
    [31.2185, 30.0498],
    [31.2292, 30.0492],
    [31.2335, 30.0535],
    [31.2469, 30.0614],
    [31.2555, 30.0655],
    [31.265, 30.068],
    [31.2685, 30.0695]
  ]),
  s('abbassia', 'شارع الجيش', 'collector', [
    [31.2469, 30.0614],
    [31.2525, 30.0596],
    [31.2555, 30.0555]
  ]),
  s('shubra', 'شارع شبرا', 'arterial', [
    [31.2469, 30.0614],
    [31.2455, 30.07],
    [31.244, 30.08],
    [31.244, 30.095],
    [31.2447, 30.11],
    [31.2435, 30.125],
    [31.249, 30.1335]
  ]),
  s('khalafawy', 'شارع الخلفاوي', 'collector', [
    [31.2492, 30.0642],
    [31.2478, 30.0738],
    [31.2462, 30.083],
    [31.2455, 30.0955],
    [31.246, 30.109]
  ]),
  s('rod-farag', 'شارع روض الفرج', 'collector', [
    [31.2342, 30.058],
    [31.2395, 30.0665],
    [31.2445, 30.0728],
    [31.2452, 30.0805]
  ]),
  s('salah-salem', 'طريق صلاح سالم', 'arterial', [
    [31.2352, 29.9955],
    [31.2445, 30.0025],
    [31.2525, 30.012],
    [31.2535, 30.0245],
    [31.2565, 30.0365],
    [31.2555, 30.0555]
  ]),
  s('autostrad', 'شارع التسعين - أتوستراد', 'collector', [
    [31.2395, 30.0645],
    [31.2455, 30.0655],
    [31.252, 30.0652]
  ]),
  s('sayeda', 'شارع السيدة زينب', 'collector', [
    [31.2334, 30.0392],
    [31.2395, 30.0348],
    [31.2455, 30.031],
    [31.2535, 30.0245]
  ])
];

/** Squares: a one-way roundabout of this radius (world metres) joins the streets that meet there. */
export interface Square {
  id: string;
  name: string;
  at: LonLat;
  r: number;
}
export const SQUARES: readonly Square[] = [
  { id: 'tahrir', name: 'ميدان التحرير', at: [31.2357, 30.0444], r: 24 },
  { id: 'talaat', name: 'ميدان طلعت حرب', at: [31.2394, 30.049], r: 19 },
  { id: 'ramses', name: 'ميدان رمسيس', at: [31.2469, 30.0614], r: 20 },
  { id: 'mesaha', name: 'ميدان المساحة', at: [31.2128, 30.0376], r: 20 },
  { id: 'giza', name: 'ميدان الجيزة', at: [31.2089, 30.0131], r: 22 }
];

export interface Landmark {
  name: string;
  at: LonLat;
  kind: 'square' | 'landmark' | 'area' | 'water';
  /** zoom (1 = the whole map) from which the map writes it */
  zoom: number;
}
export const LANDMARKS: readonly Landmark[] = [
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

export type District = 'suburb' | 'downtown' | 'port' | 'corniche';

/** Where the four district looks hold sway (nearest anchor wins); `area` is the name shown on the HUD. */
export interface Anchor {
  area: string;
  district: District;
  at: LonLat;
}
export const ANCHORS: readonly Anchor[] = [
  { area: 'الهرم', district: 'suburb', at: [31.158, 29.99] },
  { area: 'فيصل', district: 'suburb', at: [31.185, 30.0045] },
  { area: 'الجيزة', district: 'suburb', at: [31.2085, 30.0145] },
  { area: 'الدقي', district: 'corniche', at: [31.2105, 30.0405] },
  { area: 'المهندسين', district: 'corniche', at: [31.204, 30.0565] },
  { area: 'إمبابة', district: 'port', at: [31.2035, 30.0765] },
  { area: 'وسط البلد', district: 'downtown', at: [31.2395, 30.0455] },
  { area: 'الزمالك', district: 'downtown', at: [31.2258, 30.0585] },
  { area: 'المنيل', district: 'downtown', at: [31.2315, 30.0235] },
  { area: 'رمسيس', district: 'downtown', at: [31.2465, 30.059] },
  { area: 'شبرا', district: 'port', at: [31.2455, 30.083] },
  { area: 'الجزيرة', district: 'downtown', at: [31.2248, 30.0445] }
];

/** Where infill streets are generated (a rotated rectangle of local streets between the drawn ones). */
export interface Zone {
  id: string;
  at: LonLat;
  /** world metres */
  w: number;
  h: number;
  /** rotation of the rectangle and its street grid, radians */
  angle: number;
  spacing: number;
}
/** A zone from a lon/lat box (the rectangle is axis aligned in the world unless `angle` turns it). */
const zone = (
  id: string,
  lon0: number,
  lon1: number,
  lat0: number,
  lat1: number,
  angle: number,
  spacing: number
): Zone => {
  const a = toWorld([lon0, lat1]),
    b = toWorld([lon1, lat0]);
  return {
    id,
    at: toLonLat((a.x + b.x) / 2, (a.z + b.z) / 2),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.z - a.z),
    angle,
    spacing
  };
};
export const ZONES: readonly Zone[] = [
  { id: 'haram', at: [31.1665, 29.9945], w: 1500, h: 230, angle: 0.49, spacing: 62 },
  zone('giza', 31.172, 31.2175, 30.0, 30.0345, 0.06, 62),
  zone('dokki', 31.172, 31.2195, 30.0345, 30.0705, 0.12, 62),
  zone('imbaba', 31.172, 31.2165, 30.0705, 30.098, 0.2, 62),
  zone('zamalek', 31.2222, 31.2282, 30.0335, 30.0735, 0, 54),
  zone('manial', 31.2338, 31.2555, 30.0045, 30.0385, -0.15, 62),
  zone('downtown', 31.2342, 31.2575, 30.0385, 30.0585, -0.3, 56),
  zone('shubra', 31.2342, 31.259, 30.0585, 30.108, 0.05, 62),
  zone('roda', 31.2245, 31.2282, 29.9995, 30.0275, 0, 54)
];

/** Places the game uses by id (missions, patrol calls, the map). */
export interface Place {
  id: District;
  name: string;
  at: LonLat;
  /** direction of the main street there, radians (world frame) */
  street: string;
}
