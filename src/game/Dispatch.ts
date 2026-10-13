/**
 * Procedural dispatch: endless radio calls for free patrol after (or alongside) the story.
 * Each call becomes a LevelDef with the same step-script the story uses, placed on a real road.
 */
import { AVENUES_X, CROSS_Z, districtAt, DISTRICT_NAMES } from './City';
import { patrolCalls, rank, type LevelDef, type SuspectSpec, type Step, type Behaviour } from './Levels';

type Kind = 'robbery' | 'chase' | 'gang' | 'hostage' | 'runner';
const KINDS: Kind[] = ['robbery', 'chase', 'gang', 'hostage', 'runner', 'robbery', 'chase', 'gang'];
const TITLES: Record<Kind, string[]> = {
  robbery: ['سطو على صيدلية', 'سرقة سوبر ماركت', 'سطو على محل دهب'],
  chase: ['عربية مسروقة', 'سواق متهور', 'هروب من كمين'],
  gang: ['اشتباك عصابات', 'تجار سلاح', 'رجالة العقرب'],
  hostage: ['رهينة في محل', 'احتجاز موظف'],
  runner: ['نشال هارب', 'مشتبه به بيجري']
};

let seq = 0;
function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Generate a call near (px,pz) but not on top of it. Difficulty scales with rank. */
export function newCall(px: number, pz: number, seed = Date.now()): LevelDef {
  const r = mulberry(seed);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const lvl = Math.max(1, ['مستجد', 'شرطي', 'رقيب', 'ملازم', 'نقيب', 'رائد'].indexOf(rank().name) + 1);
  const kind = pick(KINDS);
  // location: on an avenue, between two cross streets, 60–200 m from the player
  let x = 0, z = 0;
  for (let i = 0; i < 20; i++) {
    x = pick(AVENUES_X);
    const j = Math.floor(r() * (CROSS_Z.length - 1));
    z = CROSS_Z[j] + 12 + r() * (CROSS_Z[j + 1] - CROSS_Z[j] - 24);
    const d = Math.hypot(x - px, z - pz);
    if (d > 60 && d < 200) break;
  }
  const where = DISTRICT_NAMES[districtAt(z)];
  const dir = pz < z ? -1 : 1; // arrive from the player's side
  const gz = z + dir * 14;
  const n = Math.min(5, 1 + Math.floor(r() * (1 + lvl * 0.7)));
  const list: SuspectSpec[] = [];
  const mk = (b: Behaviour, i: number): SuspectSpec => ({ b, dx: (i % 2 ? 3 : -3) + (r() - 0.5), dz: -dir * (2 + i * 3) });
  let steps: Step[];
  const radio = (text: string): Step => ({ t: 'radio', lines: [{ who: 'mona', text }] });
  switch (kind) {
    case 'chase':
      steps = [radio(`كل الوحدات: ${pick(TITLES.chase)} في ${where}. الحقها!`), { t: 'car' }, { t: 'goto', x, z: gz, text: `روح ${where}` },
        { t: 'chase', speed: 0.85 + lvl * 0.07, limit: 50, then: r() < 0.5 ? 'surrender' : r() < 0.5 ? 'flee' : 'fight', text: 'الحق العربية' }];
      break;
    case 'gang':
      for (let i = 0; i < Math.max(2, n); i++) list.push(mk(i === n - 1 && r() < 0.3 ? 'flee' : 'fight', i));
      steps = [radio(`طلقات نار في ${where}! ${list.length} مسلحين. اتحامى.`), { t: 'car' }, { t: 'goto', x, z: gz, text: `روح ${where}` },
        { t: 'suspects', x, z, cover: true, list, text: 'حيّد المسلحين' }];
      break;
    case 'hostage':
      for (let i = 0; i < Math.max(2, Math.min(3, n)); i++) list.push(mk('fight', i));
      steps = [radio(`${pick(TITLES.hostage)} في ${where}. خلي بالك من الرهينة.`), { t: 'car' }, { t: 'goto', x, z: gz, text: `روح ${where}` },
        { t: 'suspects', x, z, cover: true, hostage: true, list, text: 'حرّر الرهينة' }];
      break;
    case 'runner':
      list.push(mk('flee', 0));
      steps = [radio(`${pick(TITLES.runner)} في ${where}.`), { t: 'car' }, { t: 'goto', x, z: gz, text: `روح ${where}` },
        { t: 'suspects', x, z, list, text: 'امسك الهارب' }];
      break;
    default:
      for (let i = 0; i < Math.min(3, n); i++) list.push(mk(i === 0 ? 'surrender' : r() < 0.5 ? 'flee' : 'fight', i));
      steps = [radio(`${pick(TITLES.robbery)} في ${where} دلوقتي!`), { t: 'car' }, { t: 'goto', x, z: gz, text: `روح ${where}` },
        { t: 'suspects', x, z, list, cover: list.some((s) => s.b === 'fight'), text: 'اقبض على الحرامية' }];
  }
  const id = 100 + ++seq;
  const title = pick(TITLES[kind]);
  const def: LevelDef = {
    id, placeId: districtAt(z), title: `بلاغ: ${title}`, brief: `بلاغ من العمليات في ${where}.`,
    limit: 150 + list.length * 15, reward: 1200 + lvl * 400 + list.length * 300, rep: 3 + lvl, stars: [60, 100], speed: 1, steps
  };
  patrolCalls.set(id, def);
  return def;
}
