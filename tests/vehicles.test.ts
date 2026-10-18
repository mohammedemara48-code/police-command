import { describe, it, expect } from 'vitest';
import { VEHICLES, VEHICLE_IDS, handlingOf, sanitizeVehicle } from '../src/game/logic/vehicles';
import { stepCar, REFERENCE_HANDLING, type CarState } from '../src/game/logic/driving';

/** Drive flat out for `secs` seconds, return the final state and the speed reached after 2 s. */
function run(id: (typeof VEHICLE_IDS)[number], secs: number, steer = 0) {
  const h = handlingOf(id);
  let s: CarState = { speed: 0, yaw: 0, velYaw: 0 };
  let at2 = 0;
  for (let t = 0; t < secs; t += 1 / 60) {
    s = stepCar(s, { throttle: 1, steer, handbrake: false, max: 20 * h.top, damage: 0 }, 1 / 60, h);
    if (t < 2) at2 = s.speed;
  }
  return { s, at2 };
}

describe('vehicle handling presets', () => {
  it('there are four vehicles and the police car is the reference', () => {
    expect(VEHICLE_IDS).toEqual(['police', 'private', 'microbus', 'tuktuk']);
    expect(handlingOf('police')).toEqual(REFERENCE_HANDLING);
  });

  it('the police car has the highest top speed; the tuk-tuk the lowest', () => {
    const top = (id: (typeof VEHICLE_IDS)[number]) => run(id, 30).s.speed;
    expect(top('police')).toBeGreaterThan(top('private'));
    expect(top('private')).toBeGreaterThan(top('microbus'));
    expect(top('microbus')).toBeGreaterThan(top('tuktuk'));
  });

  it('the tuk-tuk is light and narrow: quick off the line and sharp, but slow at the top', () => {
    const t = VEHICLES.tuktuk;
    const m = VEHICLES.microbus;
    expect(t.hw).toBeLessThan(VEHICLES.private.hw);
    expect(m.hw).toBeGreaterThan(VEHICLES.police.hw);
    expect(run('tuktuk', 2).at2).toBeGreaterThan(run('microbus', 2).at2 * 0.7);
    expect(t.handling.steer).toBeGreaterThan(VEHICLES.private.handling.steer);
    expect(m.handling.steer).toBeLessThan(VEHICLES.private.handling.steer);
  });

  it('the microbus accelerates and turns slowest', () => {
    /** total heading change over 3 s of full lock at the vehicle's own top speed (yaw wraps, so sum the steps) */
    const turn = (id: (typeof VEHICLE_IDS)[number]) => {
      const h = handlingOf(id);
      let s: CarState = { speed: 0, yaw: 0, velYaw: 0 };
      let total = 0;
      for (let t = 0; t < 3; t += 1 / 60) {
        const n = stepCar(s, { throttle: 1, steer: 1, handbrake: false, max: 20 * h.top, damage: 0 }, 1 / 60, h);
        total += Math.abs(Math.atan2(Math.sin(n.yaw - s.yaw), Math.cos(n.yaw - s.yaw)));
        s = n;
      }
      return total;
    };
    expect(turn('microbus')).toBeLessThan(turn('private'));
    expect(turn('tuktuk')).toBeGreaterThan(turn('private'));
    expect(run('microbus', 2).at2).toBeLessThan(run('private', 2).at2);
  });

  it('only the police car has a siren', () => {
    expect(VEHICLE_IDS.filter((id) => VEHICLES[id].siren)).toEqual(['police']);
  });

  it('every preset is sane and the reference stepCar is unchanged', () => {
    for (const id of VEHICLE_IDS) {
      const v = VEHICLES[id];
      for (const k of Object.values(v.handling)) expect(k).toBeGreaterThan(0.3);
      expect(v.handling.top).toBeLessThanOrEqual(1);
      expect(v.hl).toBeGreaterThan(v.hw);
    }
    const a = stepCar({ speed: 5, yaw: 0, velYaw: 0 }, { throttle: 1, steer: 0.5, handbrake: false, max: 16 }, 0.05);
    const b = stepCar(
      { speed: 5, yaw: 0, velYaw: 0 },
      { throttle: 1, steer: 0.5, handbrake: false, max: 16 },
      0.05,
      REFERENCE_HANDLING
    );
    expect(a).toEqual(b);
  });

  it('saved choices are validated', () => {
    expect(sanitizeVehicle('tuktuk')).toBe('tuktuk');
    expect(sanitizeVehicle('tank')).toBe('police');
    expect(sanitizeVehicle(undefined)).toBe('police');
  });
});
