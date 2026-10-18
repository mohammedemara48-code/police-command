/** Layout of the Nile crossing south of Dokki: river, Qasr El Nil bridge, Gezira island and Cairo Tower. Pure data, shared by the world builder and the movement rules. */
export const NILE = {
  /** top of the stone embankment on the Dokki side (the corniche rail) */
  bankZ: 250.2,
  /** top of the embankment on the Gezira side */
  islandZ: 372,
  /** water surface, below the quay level */
  waterY: -4.2,
  /** deck surface of the bridge, level with the avenue */
  deckY: 0.09,
  roadHalf: 4.6,
  /** outer edge of the deck (carriageway + pavements) */
  deckHalf: 7.9,
  /** where the island road crosses the end of the bridge */
  islandRoadZ: 410,
  islandRoadX: 110,
  tower: { x: 14, z: 920, height: 187 },
  /** the elevated 6th of October highway, east of the avenue */
  flyover: { x: 122, half: 7, z0: 205, z1: 640, y: 9.5 }
};

export interface RoadRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const W = 9.2 / 2;
/** Drivable surfaces beyond the avenue grid: the bridge, the island road and the spur to the tower plaza. */
export const NILE_ROADS: RoadRect[] = [
  { x0: -W, x1: W, z0: 240, z1: NILE.islandRoadZ + W },
  { x0: -NILE.islandRoadX, x1: NILE.islandRoadX, z0: NILE.islandRoadZ - W, z1: NILE.islandRoadZ + W },
  { x0: NILE.tower.x - W, x1: NILE.tower.x + W, z0: NILE.islandRoadZ, z1: NILE.tower.z - 28 }
];

export function onNileRoad(x: number, z: number, pad = 0) {
  for (const r of NILE_ROADS) if (x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad) return true;
  return false;
}

/** the four bronze lions: [x, z] of their pedestals (two at each end of the bridge) */
export const LION_SPOTS: [number, number][] = [
  [-10.4, 246.2],
  [10.4, 246.2],
  [-10.4, NILE.islandZ - 2.2],
  [10.4, NILE.islandZ - 2.2]
];
