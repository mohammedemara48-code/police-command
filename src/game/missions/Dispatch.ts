/**
 * Procedural dispatch: endless radio calls for free patrol after (or alongside) the story.
 * Each call becomes a LevelDef with the same step-script the story uses, placed on a real road.
 */
import { AVENUES_X, CROSS_Z, districtAt, DISTRICT_NAMES } from '../world/City';
import { patrolCalls, rank, type LevelDef, type SuspectSpec, type Step, type Behaviour } from './Levels';
import { callLimit, callReward, raidPlan, trapCount, waveText, type CallKind } from '../logic/calls';

export type Kind = CallKind;
const KINDS: Kind[] = [
  'robbery',
  'chase',
  'gang',
  'hostage',
  'runner',
  'robbery',
  'chase',
  'gang',
  'speeder',
  'route',
  'dui',
  'trap',
  'raid'
];
const TITLES: Record<Kind, string[]> = {
  robbery: ['سطو على صيدلية', 'سرقة سوبر ماركت', 'سطو على محل دهب'],
  chase: ['عربية مسروقة', 'سواق متهور', 'هروب من كمين'],
  gang: ['اشتباك عصابات', 'تجار سلاح', 'رجالة العقرب'],
  hostage: ['رهينة في محل', 'احتجاز موظف'],
  runner: ['نشال هارب', 'مشتبه به بيجري'],
  speeder: ['مخالفة سرعة', 'سواق طاير', 'عربية بتسابق'],
  route: ['دورية تفقدية', 'تأمين الشوارع', 'لفة أمنية'],
  dui: ['سواق سكران', 'عربية بتتمايل', 'قيادة تحت تأثير'],
  trap: ['كمين رادار', 'رادار السرعة', 'كمين مرور'],
  raid: ['مداهمة وكر مخدرات', 'مداهمة بيت العقرب', 'مداهمة مخزن']
};

let seq = 0;
function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate a call near (px,pz) but not on top of it. Difficulty scales with rank. */
export function newCall(px: number, pz: number, seed = Date.now(), force?: Kind): LevelDef {
  const r = mulberry(seed);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const lvl = Math.max(1, ['مستجد', 'شرطي', 'رقيب', 'ملازم', 'نقيب', 'رائد'].indexOf(rank().name) + 1);
  const kind = force ?? pick(KINDS);
  // location: on an avenue, between two cross streets, 60–200 m from the player
  let x = 0,
    z = 0;
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
  const mk = (b: Behaviour, i: number): SuspectSpec => ({
    b,
    dx: (i % 2 ? 3 : -3) + (r() - 0.5),
    dz: -dir * (2 + i * 3)
  });
  let steps: Step[];
  let count = -1; // speeders / suspects for pay and time (defaults to the suspect list)
  const radio = (text: string): Step => ({ t: 'radio', lines: [{ who: 'mona', text }] });
  switch (kind) {
    case 'chase':
      steps = [
        radio(`كل الوحدات: ${pick(TITLES.chase)} في ${where}. الحقها!`),
        { t: 'car' },
        { t: 'goto', x, z: gz, text: `روح ${where}` },
        {
          t: 'chase',
          speed: 0.85 + lvl * 0.07,
          limit: 50,
          then: r() < 0.5 ? 'surrender' : r() < 0.5 ? 'flee' : 'fight',
          text: 'الحق العربية'
        }
      ];
      break;
    case 'speeder':
      steps = [
        radio(`عربية مسرعة جدًا في ${where}. شغّل السارينة ووقّفها على جنب.`),
        { t: 'car' },
        { t: 'goto', x, z: gz, text: `روح ${where}` },
        { t: 'pullover', text: 'شغّل السارينة وخليك وراها' }
      ];
      break;
    case 'dui':
      steps = [
        radio(`بلاغ عن عربية بتتمايل في ${where} — غالبًا السواق سكران. وقّفها قبل ما تعمل حادثة.`),
        { t: 'car' },
        { t: 'goto', x, z: gz, text: `روح ${where}` },
        { t: 'pullover', dui: true, text: 'شغّل السارينة وخليك ورا العربية اللي بتتمايل' }
      ];
      count = 1;
      break;
    case 'trap': {
      const n = trapCount(lvl);
      steps = [
        radio(`المرور محتاجك: اركن الدورية عند نقطة الرادار في ${where} واقفش ${n === 1 ? 'أول مسرع' : `${n} مسرعين`}.`),
        { t: 'car' },
        { t: 'trap', x: x - 3.4, z: gz, n, text: 'اركن في دايرة الرادار' }
      ];
      count = n;
      break;
    }
    case 'raid': {
      const waves = raidPlan(lvl, [r(), r(), r(), r(), r(), r(), r(), r(), r()]);
      steps = [
        radio(`مداهمة وكر مخدرات في ${where}. فيه ${waves.length === 2 ? 'موجتين' : `${waves.length} موجات`} جوه البيت — اتحامى وخلّص على كل موجة.`),
        { t: 'car' },
        { t: 'goto', x, z: gz, text: `روح ${where}` }
      ];
      waves.forEach((w, i) => {
        // each wave steps out a little deeper from the door so it never stacks on the last one
        const specs = w.roles.map((b, k) => ({ ...mk(b, k), dz: -dir * (3 + i * 2.5 + k * 2.5) }));
        if (i > 0) steps.push(radio(waveText(i, waves.length)));
        steps.push({ t: 'suspects', x, z, cover: true, list: specs, text: `حيّد الموجة ${i + 1}/${waves.length}` });
        list.push(...specs);
      });
      break;
    }
    case 'route': {
      // 4 intersections in a loop near the call
      const ax = AVENUES_X.filter((a) => Math.abs(a - x) <= 60);
      const pts = [0, 1, 2, 3].map((i) => ({
        x: ax[i % ax.length]!,
        z: CROSS_Z[Math.min(CROSS_Z.length - 1, Math.max(0, CROSS_Z.findIndex((c) => c > z - 1) - 1 + (i >> 1)))]!
      }));
      steps = [
        radio(`العمليات: لف دورية تفقدية على ${pts.length} تقاطعات في ${where}.`),
        { t: 'car' },
        { t: 'checkpoints', pts, text: 'عدّي على نقط التفتيش' }
      ];
      break;
    }
    case 'gang':
      for (let i = 0; i < Math.max(2, n); i++) list.push(mk(i === n - 1 && r() < 0.3 ? 'flee' : 'fight', i));
      steps = [
        radio(`طلقات نار في ${where}! ${list.length} مسلحين. اتحامى.`),
        { t: 'car' },
        { t: 'goto', x, z: gz, text: `روح ${where}` },
        { t: 'suspects', x, z, cover: true, list, text: 'حيّد المسلحين' }
      ];
      break;
    case 'hostage':
      for (let i = 0; i < Math.max(2, Math.min(3, n)); i++) list.push(mk('fight', i));
      steps = [
        radio(`${pick(TITLES.hostage)} في ${where}. خلي بالك من الرهينة.`),
        { t: 'car' },
        { t: 'goto', x, z: gz, text: `روح ${where}` },
        { t: 'suspects', x, z, cover: true, hostage: true, list, text: 'حرّر الرهينة' }
      ];
      break;
    case 'runner':
      list.push(mk('flee', 0));
      steps = [
        radio(`${pick(TITLES.runner)} في ${where}.`),
        { t: 'car' },
        { t: 'goto', x, z: gz, text: `روح ${where}` },
        { t: 'suspects', x, z, list, text: 'امسك الهارب' }
      ];
      break;
    default:
      for (let i = 0; i < Math.min(3, n); i++) list.push(mk(i === 0 ? 'surrender' : r() < 0.5 ? 'flee' : 'fight', i));
      steps = [
        radio(`${pick(TITLES.robbery)} في ${where} دلوقتي!`),
        { t: 'car' },
        { t: 'goto', x, z: gz, text: `روح ${where}` },
        { t: 'suspects', x, z, list, cover: list.some((s) => s.b === 'fight'), text: 'اقبض على الحرامية' }
      ];
  }
  const id = 100 + ++seq;
  const title = pick(TITLES[kind]);
  const def: LevelDef = {
    id,
    placeId: districtAt(z),
    title: `بلاغ: ${title}`,
    brief: `بلاغ من العمليات في ${where}.`,
    limit: callLimit(kind, count < 0 ? list.length : count),
    reward: callReward(kind, lvl, count < 0 ? list.length : count),
    rep: 3 + lvl,
    stars: [60, 100],
    speed: 1,
    steps
  };
  patrolCalls.set(id, def);
  return def;
}
