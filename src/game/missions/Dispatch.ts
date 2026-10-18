/**
 * Procedural dispatch: endless radio calls for free patrol after (or alongside) the story.
 * Each call becomes a LevelDef with the same step-script the story uses, placed on a real road.
 */
import { net } from '../logic/roadnet';
import { walkable } from '../logic/places';
import { patrolCalls, rank, type LevelDef, type SuspectSpec, type Step, type Behaviour } from './Levels';
import { callLimit, callReward, raidPlan, trapCount, waveText, type CallKind } from '../logic/calls';
import { ambushPlan, ambushCount, vipDestination, VIP_WHO, VIP_DEST } from '../logic/escort';

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
  'raid',
  'vip'
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
  raid: ['مداهمة وكر مخدرات', 'مداهمة بيت العقرب', 'مداهمة مخزن'],
  vip: ['تأمين موكب', 'حراسة شخصية مهمة', 'موكب رسمي']
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
  // location: on a real street, 90-420 m from the player
  const N = net();
  const okEdge = (e: { cls: string; bridge: boolean; ring: boolean; len: number }) =>
    e.cls !== 'local' && !e.bridge && !e.ring && e.len > 70;
  let pt = N.randomPoint(r, okEdge);
  for (let i = 0; i < 40; i++) {
    const c = N.randomPoint(r, okEdge);
    const d = Math.hypot(c.x - px, c.z - pz);
    pt = c;
    if (d > 90 && d < 420) break;
  }
  // a patrol loop starts where the officer is, so it is announced in the district they are standing in
  if (kind === 'route') {
    const near = N.nearest(px, pz, 600);
    if (near) pt = { x: near.x, z: near.z, e: near.e, yaw: N.at(near.e, near.s).yaw };
  }
  const { x, z } = pt;
  const area = N.area(x, z);
  const where = area.area;
  // along the street, towards the player's side: the goto point lies there and the suspects stand further away
  const fx = Math.sin(pt.yaw),
    fz = Math.cos(pt.yaw);
  const nx = Math.cos(pt.yaw),
    nz = -Math.sin(pt.yaw);
  const sgn = (px - x) * fx + (pz - z) * fz >= 0 ? 1 : -1;
  const gx = x + fx * sgn * 14,
    gz = z + fz * sgn * 14;
  const n = Math.min(5, 1 + Math.floor(r() * (1 + lvl * 0.7)));
  const list: SuspectSpec[] = [];
  /** offsets are in world axes: `lat` across the street, `away` further from the player along it */
  const off = (lat: number, away: number) => {
    let dx = nx * lat - fx * sgn * away,
      dz = nz * lat - fz * sgn * away;
    if (!walkable(x + dx, z + dz)) {
      dx *= 0.4;
      dz *= 0.4;
    }
    return !walkable(x + dx, z + dz) ? { dx: 0, dz: 0 } : { dx, dz };
  };
  const mk = (b: Behaviour, i: number): SuspectSpec => ({ b, ...off((i % 2 ? 3 : -3) + (r() - 0.5), 2 + i * 3) });
  let steps: Step[];
  let count = -1; // speeders / suspects for pay and time (defaults to the suspect list)
  const radio = (text: string): Step => ({ t: 'radio', lines: [{ who: 'mona', text }] });
  switch (kind) {
    case 'chase':
      steps = [
        radio(`كل الوحدات: ${pick(TITLES.chase)} في ${where}. الحقها!`),
        { t: 'car' },
        { t: 'goto', x: gx, z: gz, text: `روح ${where}` },
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
        { t: 'goto', x: gx, z: gz, text: `روح ${where}` },
        { t: 'pullover', text: 'شغّل السارينة وخليك وراها' }
      ];
      break;
    case 'dui':
      steps = [
        radio(`بلاغ عن عربية بتتمايل في ${where} — غالبًا السواق سكران. وقّفها قبل ما تعمل حادثة.`),
        { t: 'car' },
        { t: 'goto', x: gx, z: gz, text: `روح ${where}` },
        { t: 'pullover', dui: true, text: 'شغّل السارينة وخليك ورا العربية اللي بتتمايل' }
      ];
      count = 1;
      break;
    case 'trap': {
      const n = trapCount(lvl);
      steps = [
        radio(
          `المرور محتاجك: اركن الدورية عند نقطة الرادار في ${where} واقفش ${n === 1 ? 'أول مسرع' : `${n} مسرعين`}.`
        ),
        { t: 'car' },
        { t: 'trap', x: gx - nx * 3.4, z: gz - nz * 3.4, n, text: 'اركن في دايرة الرادار' }
      ];
      count = n;
      break;
    }
    case 'raid': {
      const waves = raidPlan(lvl, [r(), r(), r(), r(), r(), r(), r(), r(), r()]);
      steps = [
        radio(
          `مداهمة وكر مخدرات في ${where}. فيه ${waves.length === 2 ? 'موجتين' : `${waves.length} موجات`} جوه البيت — اتحامى وخلّص على كل موجة.`
        ),
        { t: 'car' },
        { t: 'goto', x: gx, z: gz, text: `روح ${where}` }
      ];
      waves.forEach((w, i) => {
        // each wave steps out a little deeper from the door so it never stacks on the last one
        const specs = w.roles.map((b, k) => ({
          ...mk(b, k),
          ...off((k % 2 ? 3 : -3) + (r() - 0.5), 3 + i * 2.5 + k * 2.5)
        }));
        if (i > 0) steps.push(radio(waveText(i, waves.length)));
        steps.push({ t: 'suspects', x, z, cover: true, list: specs, text: `حيّد الموجة ${i + 1}/${waves.length}` });
        list.push(...specs);
      });
      break;
    }
    case 'vip': {
      // the VIP car waits at the call spot; escort it along the road graph to a destination 110–220 m away
      const plan = ambushPlan(lvl, [r(), r(), r(), r(), r(), r(), r(), r(), r(), r()]);
      const dest = vipDestination(
        { x, z },
        N.nodes.filter((nd) => nd.edges.length >= 3 && !nd.edges.some((id) => N.edges[id]!.ring)),
        r()
      );
      // park 14 m into the street that leaves the junction so the car never stops in the crossing
      const dn = N.nodes.reduce((a, b) =>
        Math.hypot(b.x - dest.x, b.z - dest.z) < Math.hypot(a.x - dest.x, a.z - dest.z) ? b : a
      );
      const de = N.edges[dn.edges.find((id) => !N.edges[id]!.ring && N.edges[id]!.len > 40) ?? dn.edges[0]!]!;
      const dp = N.at(de, de.a === dn.id ? 14 : Math.max(0, de.len - 14));
      dest.x = dp.x;
      dest.z = dp.z;
      const who = pick(VIP_WHO);
      const to = pick(VIP_DEST);
      steps = [
        radio(
          `موكب ${who} مستني في ${where} ورايح ${to}. خليك لازق في العربية السودا — العقرب ممكن يعمل كمين في السكة.`
        ),
        { t: 'car' },
        { t: 'goto', x: gx, z: gz, text: `روح للموكب في ${where}` },
        { t: 'escort', x, z, tx: dest.x, tz: dest.z, dest: to, ambush: plan, text: `رافق الموكب لحد ${to}` }
      ];
      count = ambushCount(plan);
      break;
    }
    case 'route': {
      // 4 intersections in a loop near the call
      const around = N.nodes
        .filter((nd) => nd.edges.length >= 3 && !nd.edges.some((id) => N.edges[id]!.ring))
        .map((nd) => ({ nd, d: Math.hypot(nd.x - x, nd.z - z) }))
        .filter((c) => c.d > 40 && c.d < 320)
        .sort((a, b) => a.d - b.d)
        .slice(0, 4)
        .map((c) => c.nd);
      // visit them in a loop around the call
      around.sort((a, b) => Math.atan2(a.z - z, a.x - x) - Math.atan2(b.z - z, b.x - x));
      const pts = around.map((nd) => ({ x: nd.x, z: nd.z }));
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
        { t: 'goto', x: gx, z: gz, text: `روح ${where}` },
        { t: 'suspects', x, z, cover: true, list, text: 'حيّد المسلحين' }
      ];
      break;
    case 'hostage':
      for (let i = 0; i < Math.max(2, Math.min(3, n)); i++) list.push(mk('fight', i));
      steps = [
        radio(`${pick(TITLES.hostage)} في ${where}. خلي بالك من الرهينة.`),
        { t: 'car' },
        { t: 'goto', x: gx, z: gz, text: `روح ${where}` },
        { t: 'suspects', x, z, cover: true, hostage: true, list, text: 'حرّر الرهينة' }
      ];
      break;
    case 'runner':
      list.push(mk('flee', 0));
      steps = [
        radio(`${pick(TITLES.runner)} في ${where}.`),
        { t: 'car' },
        { t: 'goto', x: gx, z: gz, text: `روح ${where}` },
        { t: 'suspects', x, z, list, text: 'امسك الهارب' }
      ];
      break;
    default:
      for (let i = 0; i < Math.min(3, n); i++) list.push(mk(i === 0 ? 'surrender' : r() < 0.5 ? 'flee' : 'fight', i));
      steps = [
        radio(`${pick(TITLES.robbery)} في ${where} دلوقتي!`),
        { t: 'car' },
        { t: 'goto', x: gx, z: gz, text: `روح ${where}` },
        { t: 'suspects', x, z, list, cover: list.some((s) => s.b === 'fight'), text: 'اقبض على الحرامية' }
      ];
  }
  const id = 100 + ++seq;
  const title = pick(TITLES[kind]);
  const def: LevelDef = {
    id,
    placeId: area.district,
    title: `بلاغ: ${title}`,
    brief: `بلاغ من العمليات في ${where}.`,
    limit: callLimit(kind, count < 0 ? list.length : count),
    reward: callReward(kind, lvl, count < 0 ? list.length : count),
    rep: 3 + lvl,
    stars: [60, 100],
    speed: 1,
    world: true,
    steps
  };
  patrolCalls.set(id, def);
  return def;
}
