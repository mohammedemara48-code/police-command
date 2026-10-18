import { describe, it, expect } from 'vitest';
import {
  DISTRICT_NAMES,
  DISTRICT_STYLES,
  blockLook,
  districtAt,
  hash01,
  signNames,
  type District
} from '../src/game/logic/districts';

const IDS: District[] = ['suburb', 'downtown', 'port', 'corniche'];

describe('Cairo districts', () => {
  it('names the four districts', () => {
    expect(DISTRICT_NAMES).toEqual({ suburb: 'الهرم', downtown: 'وسط البلد', port: 'شبرا', corniche: 'الدقي' });
  });

  it('keeps the district bands along the avenue', () => {
    expect(districtAt(-90)).toBe('suburb');
    expect(districtAt(0)).toBe('downtown');
    expect(districtAt(100)).toBe('port');
    expect(districtAt(200)).toBe('corniche');
  });

  it('gives every block a look inside its district range', () => {
    for (const id of IDS) {
      const st = DISTRICT_STYLES[id];
      for (let seed = 0; seed < 300; seed++) {
        const look = blockLook(id, seed);
        expect(look.floors).toBeGreaterThanOrEqual(st.floorsMin);
        expect(look.floors).toBeLessThanOrEqual(st.floorsMax);
        expect(st.tints).toContain(look.tint);
      }
    }
  });

  it('is deterministic', () => {
    expect(blockLook('port', 42)).toEqual(blockLook('port', 42));
    expect(hash01(7)).toBe(hash01(7));
    for (let i = 0; i < 100; i++) expect(hash01(i)).toBeLessThan(1);
  });

  it('follows the brick share: Haram is mostly brick, downtown and Dokki mostly plaster', () => {
    const share = (id: District) => {
      let n = 0;
      for (let seed = 0; seed < 2000; seed++) if (blockLook(id, seed).brick) n++;
      return n / 2000;
    };
    expect(share('suburb')).toBeGreaterThan(0.6);
    expect(share('suburb')).toBeLessThan(0.8);
    expect(share('downtown')).toBeLessThan(0.2);
    expect(share('corniche')).toBeLessThan(0.12);
  });

  it('builds Haram taller than downtown and Shubra the most crowded', () => {
    expect(DISTRICT_STYLES.suburb.floorsMax).toBeGreaterThan(DISTRICT_STYLES.downtown.floorsMax);
    expect(DISTRICT_STYLES.port.crowd).toBeGreaterThan(DISTRICT_STYLES.downtown.crowd);
  });

  it('uses the real street names on the signs', () => {
    expect(DISTRICT_STYLES.suburb.streets).toEqual(['شارع الهرم', 'الطريق الدائري', 'شارع فيصل']);
    expect(signNames('port', 0)).toEqual(['شارع شبرا', 'شارع الخلفاوي']);
    expect(signNames('corniche', 3)[1]).toBe('كورنيش الجيزة');
    for (const id of IDS) for (let i = 0; i < 5; i++) expect(signNames(id, i)[0]).toBe(DISTRICT_STYLES[id].streets[0]);
  });
});
