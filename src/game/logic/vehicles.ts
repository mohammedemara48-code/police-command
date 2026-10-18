/** The four vehicles the officer can drive (pure, unit-tested): each has its own handling preset and body size. */

export type VehicleId = 'police' | 'private' | 'microbus' | 'tuktuk';
export const VEHICLE_IDS: readonly VehicleId[] = ['police', 'private', 'microbus', 'tuktuk'];

/** Multipliers on the arcade car model (the police car is the reference, all 1). */
export interface Handling {
  /** share of the top speed */
  top: number;
  accel: number;
  brake: number;
  /** how quickly the velocity follows the nose (lower = slides more) */
  grip: number;
  /** how sharply it turns */
  steer: number;
  reverse: number;
}

export interface VehicleDef {
  id: VehicleId;
  name: string;
  blurb: string;
  handling: Handling;
  /** half width and half length of the hit box (m) */
  hw: number;
  hl: number;
  /** nose-to-tail length the 3D model is fitted to (m) */
  length: number;
  /** has a siren and the blue/red light bar */
  siren: boolean;
  /** where the driver sits (x, y, z in the body frame) and the driver's scale */
  seat: [number, number, number];
}

export const VEHICLES: Record<VehicleId, VehicleDef> = {
  police: {
    id: 'police',
    name: 'عربية الشرطة',
    blurb: 'الأسرع، سارينة ولمبات، تمسك الأرض كويس',
    handling: { top: 1, accel: 1, brake: 1, grip: 1, steer: 1, reverse: 1 },
    hw: 0.95,
    hl: 2.35,
    length: 4.7,
    siren: true,
    seat: [0.32, 0.12, -0.15]
  },
  private: {
    id: 'private',
    name: 'ملاكي',
    blurb: 'متوازنة وسهلة في الشارع، من غير سارينة',
    handling: { top: 0.9, accel: 0.92, brake: 0.95, grip: 0.95, steer: 1, reverse: 1 },
    hw: 0.9,
    hl: 2.1,
    length: 4.2,
    siren: false,
    seat: [0.32, 0.12, -0.05]
  },
  microbus: {
    id: 'microbus',
    name: 'ميكروباص',
    blurb: 'تقيل وعريض، بطيء في التسارع والمنعطفات، بيشيل الخبطات',
    handling: { top: 0.76, accel: 0.62, brake: 0.78, grip: 0.78, steer: 0.72, reverse: 0.9 },
    hw: 1.05,
    hl: 2.65,
    length: 5.3,
    siren: false,
    seat: [0.42, 0.55, 1.2]
  },
  tuktuk: {
    id: 'tuktuk',
    name: 'توكتوك',
    blurb: 'خفيف وضيق، بيلف في أي حتة بس سرعته القصوى قليلة',
    handling: { top: 0.5, accel: 0.8, brake: 0.85, grip: 0.82, steer: 1.35, reverse: 0.8 },
    hw: 0.65,
    hl: 1.3,
    length: 2.6,
    siren: false,
    seat: [0, 0.3, 0.15]
  }
};

export const DEFAULT_VEHICLE: VehicleId = 'police';

export function sanitizeVehicle(v: unknown): VehicleId {
  return typeof v === 'string' && (VEHICLE_IDS as readonly string[]).includes(v) ? (v as VehicleId) : DEFAULT_VEHICLE;
}

export const handlingOf = (id: VehicleId): Handling => VEHICLES[id].handling;
