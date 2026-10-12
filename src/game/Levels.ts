/** Story campaign: 12 scripted missions (see docs/GAME_DESIGN.md). Unlocks, stars, XP/rank saved locally (and synced when signed in). */
export type Who = 'mona' | 'hamed' | 'yasser' | 'suspect' | 'informant' | 'boss';
export interface Line { who: Who; text: string }
export type Behaviour = 'surrender' | 'flee' | 'fight';
export interface SuspectSpec { b: Behaviour; dx: number; dz: number; boss?: boolean }
export type Step =
  | { t: 'radio'; lines: Line[] }
  | { t: 'car'; text?: string }
  | { t: 'goto'; x: number; z: number; r?: number; text: string }
  | { t: 'chase'; speed: number; limit: number; then?: Behaviour; text?: string }
  | { t: 'suspects'; x: number; z: number; list: SuspectSpec[]; hostage?: boolean; cover?: boolean; text: string };

export interface LevelDef {
  id: number;
  placeId: 'downtown' | 'port' | 'corniche' | 'suburb';
  title: string;
  brief: string;
  /** seconds for the whole scenario (after arrival) */
  limit: number;
  reward: number;
  rep: number;
  /** finish under these seconds for 3 / 2 stars */
  stars: [number, number];
  steps: Step[];
  ending?: Line[];
  // legacy fields still read by older code paths
  speed: number;
  kind?: 'gang';
  gang?: number;
}

const S = (b: Behaviour, dx: number, dz: number, boss = false): SuspectSpec => ({ b, dx, dz, boss });

export const LEVELS: LevelDef[] = [
  { id: 1, placeId: 'downtown', title: 'أول يوم', brief: 'أول دورية ليك. حرامي محلات في وسط البلد.', limit: 120, reward: 1500, rep: 4, stars: [45, 80], speed: 1, steps: [
    { t: 'radio', lines: [
      { who: 'mona', text: 'أهلاً يا ياسر، أنا الرقيب منى من غرفة العمليات. أول يوم ليك في الدورية.' },
      { who: 'mona', text: 'المدينة دي تحت سيطرة عصابة «العقرب». هنبدأ واحدة واحدة.' },
      { who: 'mona', text: 'بلاغ: حرامي سرق محل في وسط البلد. اركب الدورية واتبع الـGPS.' }] },
    { t: 'car', text: 'اركب الدورية' },
    { t: 'goto', x: 0, z: 0, text: 'سوق لوسط البلد' },
    { t: 'radio', lines: [{ who: 'mona', text: 'المشتبه به قدامك. انزل، وجّه عليه واضغط «استسلم!» وبعدين قرّب وكلبشه.' }] },
    { t: 'suspects', x: 0, z: 6, list: [S('surrender', 3, 4)], text: 'اقبض على الحرامي' }],
    ending: [{ who: 'mona', text: 'شغل نضيف يا ياسر. ده أول واحد. العقرب لسه قدامنا.' }] },
  { id: 2, placeId: 'corniche', title: 'سرقة جارية', brief: 'اتنين بيسرقوا محل على الكورنيش دلوقتي.', limit: 120, reward: 2000, rep: 5, stars: [50, 85], speed: 1, steps: [
    { t: 'radio', lines: [{ who: 'mona', text: 'سرقة جارية على الكورنيش! اتنين. واحد منهم ممكن يجري — متسيبوش.' }] },
    { t: 'car' },
    { t: 'goto', x: 0, z: 186, text: 'روح الكورنيش بسرعة' },
    { t: 'suspects', x: 0, z: 192, list: [S('surrender', -3, 2), S('flee', 3, 4)], text: 'اقبض على الحرامية الاتنين' }],
    ending: [{ who: 'hamed', text: 'النقيب حامد معاك. الاتنين بيشتغلوا للعقرب. كمّل كده.' }] },
  { id: 3, placeId: 'port', title: 'مطاردة الميناء', brief: 'عربية مسروقة خارجة من الميناء.', limit: 90, reward: 2600, rep: 6, stars: [35, 60], speed: 0.85, steps: [
    { t: 'radio', lines: [{ who: 'mona', text: 'عربية مسروقة طالعة من الميناء. الحقها وقفّل عليها، وبعدين اقبض على السواق.' }] },
    { t: 'car' },
    { t: 'goto', x: 0, z: 92, text: 'روح الميناء' },
    { t: 'chase', speed: 0.85, limit: 45, then: 'surrender', text: 'الحق العربية السودا' }],
    ending: [{ who: 'suspect', text: 'خلاص خلاص! أنا مجرد سواق… الشحنة في الحاويات!' }] },
  { id: 4, placeId: 'port', title: 'شحنة مهربة', brief: 'رجالة العقرب بيحمّلوا سلاح في الحاويات.', limit: 150, reward: 3200, rep: 7, stars: [60, 100], speed: 1, steps: [
    { t: 'radio', lines: [{ who: 'hamed', text: 'السواق اعترف. فيه 3 مسلحين عند الحاويات. اتحامى ورا الحاجات واضرب بحذر.' }] },
    { t: 'car' },
    { t: 'goto', x: 0, z: 96, text: 'روح الحاويات في الميناء' },
    { t: 'suspects', x: 0, z: 110, cover: true, list: [S('fight', -4, 4), S('fight', 4, 8), S('fight', -2, 13)], text: 'حيّد المسلحين' }] },
  { id: 5, placeId: 'downtown', title: 'اضرب واهرب', brief: 'عربية خبطت حد وهربت في وسط البلد.', limit: 100, reward: 3400, rep: 7, stars: [40, 70], speed: 0.95, steps: [
    { t: 'radio', lines: [{ who: 'mona', text: 'حادث وهروب في وسط البلد! السواق بيجري. الحقه.' }] },
    { t: 'car' },
    { t: 'goto', x: 0, z: -6, text: 'روح وسط البلد' },
    { t: 'chase', speed: 0.95, limit: 45, then: 'flee', text: 'الحق العربية' }] },
  { id: 6, placeId: 'downtown', title: 'رهينة', brief: 'مسلحين ماسكين رهينة جنب البنك.', limit: 150, reward: 4200, rep: 9, stars: [50, 90], speed: 1, steps: [
    { t: 'radio', lines: [
      { who: 'hamed', text: 'رهينة جنب البنك. اتنين مسلحين. أي طلقة في الرهينة = فشل.' },
      { who: 'hamed', text: 'خليك هادي ونشّن كويس.' }] },
    { t: 'car' },
    { t: 'goto', x: 0, z: 14, text: 'روح البنك' },
    { t: 'suspects', x: 0, z: 26, cover: true, hostage: true, list: [S('fight', -3, 2), S('fight', 3, 3)], text: 'حرّر الرهينة' }] },
  { id: 7, placeId: 'corniche', title: 'ليلة الكورنيش', brief: 'عربية العقرب على الكورنيش.', limit: 140, reward: 4700, rep: 9, stars: [55, 95], speed: 1.15, steps: [
    { t: 'radio', lines: [{ who: 'mona', text: 'عربية العقرب على الكورنيش، والركاب مسلحين.' }] },
    { t: 'car' },
    { t: 'goto', x: 0, z: 170, text: 'روح الكورنيش' },
    { t: 'chase', speed: 1.15, limit: 40, then: 'fight', text: 'الحق العربية' }] },
  { id: 8, placeId: 'port', title: 'مخزن العقرب', brief: 'مخزن العصابة على الشارع الشرقي.', limit: 160, reward: 5200, rep: 10, stars: [60, 110], speed: 1, steps: [
    { t: 'radio', lines: [{ who: 'hamed', text: 'لقينا مخزنهم على الشارع الشرقي جنب الميناء. 4 جوه. واحد هيحاول يهرب.' }] },
    { t: 'car' },
    { t: 'goto', x: 60, z: 90, text: 'روح المخزن (الشارع الشرقي)' },
    { t: 'suspects', x: 60, z: 104, cover: true, list: [S('fight', -3, 2), S('fight', 3, 6), S('fight', -2, 10), S('flee', 2, 12)], text: 'اقتحم المخزن' }] },
  { id: 9, placeId: 'suburb', title: 'الواشي', brief: 'واشي هيدلّك على بيت المخدرات.', limit: 160, reward: 5600, rep: 10, stars: [60, 110], speed: 1, steps: [
    { t: 'radio', lines: [
      { who: 'informant', text: 'أنا مش عايز مشاكل… بيت المخدرات في الضاحية. 4 رجالة، واحد فيهم خواف.' },
      { who: 'mona', text: 'اتأكد منه يا ياسر. ممكن يكون فخ.' }] },
    { t: 'car' },
    { t: 'goto', x: 0, z: -62, text: 'روح الضاحية' },
    { t: 'suspects', x: 0, z: -78, cover: true, list: [S('fight', -3, 0), S('fight', 3, -3), S('fight', -2, -7), S('surrender', 3, -9)], text: 'نضّف بيت المخدرات' }] },
  { id: 10, placeId: 'downtown', title: 'طريق الهروب', brief: 'سواق الزعيم شايل الفلوس.', limit: 120, reward: 6200, rep: 11, stars: [40, 70], speed: 1.3, steps: [
    { t: 'radio', lines: [{ who: 'mona', text: 'سواق الزعيم شايل فلوس العصابة! أسرع عربية في المدينة.' }] },
    { t: 'car' },
    { t: 'goto', x: 0, z: -10, text: 'روح وسط البلد' },
    { t: 'chase', speed: 1.3, limit: 40, then: 'surrender', text: 'الحق سواق الزعيم' }],
    ending: [{ who: 'suspect', text: 'الزعيم… في الفيلا في الضاحية. بس الأول هيهاجموا القسم!' }] },
  { id: 11, placeId: 'downtown', title: 'هجوم على القسم', brief: 'العصابة بتهاجم القسم.', limit: 180, reward: 7000, rep: 12, stars: [70, 120], speed: 1, steps: [
    { t: 'radio', lines: [{ who: 'hamed', text: 'القسم تحت الهجوم! 5 مسلحين قدام المبنى. ارجع بسرعة!' }] },
    { t: 'car' },
    { t: 'goto', x: 0, z: 34, text: 'ارجع للقسم' },
    { t: 'suspects', x: 0, z: 46, cover: true, list: [S('fight', -4, 0), S('fight', 4, 2), S('fight', -2, 6), S('fight', 3, 9), S('fight', 0, 12)], text: 'صد الهجوم' }] },
  { id: 12, placeId: 'suburb', title: 'الزعيم', brief: 'فيلا الزعيم في الضاحية. النهاية.', limit: 200, reward: 10000, rep: 20, stars: [80, 140], speed: 1, steps: [
    { t: 'radio', lines: [
      { who: 'hamed', text: 'دي اللحظة يا ياسر. الزعيم في الفيلا ومعاه 3 حرس.' },
      { who: 'boss', text: 'مستجد؟ بعتولي مستجد؟! تعالى يا شاطر.' }] },
    { t: 'car' },
    { t: 'goto', x: 0, z: -80, text: 'روح فيلا الزعيم' },
    { t: 'suspects', x: 0, z: -92, cover: true, list: [S('fight', -4, 2), S('fight', 4, 0), S('fight', -2, -3), S('fight', 0, -6, true)], text: 'اقبض على الزعيم' }],
    ending: [
      { who: 'boss', text: 'خلاص… استسلمت.' },
      { who: 'hamed', text: 'العقرب انتهى. المدينة ليها حق تنام النهارده. مبروك يا حضرة الرائد ياسر.' }] }
];

const KEY = 'pc.levels.v1';
interface Progress { unlocked: number; stars: Record<number, number>; current: number; xp?: number }

function load(): Progress {
  try { return { unlocked: 1, stars: {}, current: 1, xp: 0, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { unlocked: 1, stars: {}, current: 1, xp: 0 }; }
}

export const progress = load();
export function saveProgress() { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* ignore */ } }

export function levelById(id: number) { return LEVELS.find((l) => l.id === id) ?? LEVELS[0]; }

export const RANKS = [
  { name: 'مستجد', xp: 0, mag: 12, dmg: 1, car: 0 },
  { name: 'شرطي', xp: 300, mag: 13, dmg: 1, car: 1 },
  { name: 'رقيب', xp: 800, mag: 15, dmg: 1.5, car: 2 },
  { name: 'ملازم', xp: 1600, mag: 15, dmg: 1.5, car: 3 },
  { name: 'نقيب', xp: 2800, mag: 17, dmg: 2, car: 4 },
  { name: 'رائد', xp: 4200, mag: 17, dmg: 2, car: 5 }
];
export function rank() {
  const xp = progress.xp ?? 0;
  let r = RANKS[0];
  for (const k of RANKS) if (xp >= k.xp) r = k;
  return r;
}

/** Record a result; returns earned stars (0 on fail). */
export function completeLevel(id: number, success: boolean, seconds: number) {
  if (!success) return 0;
  const l = levelById(id);
  const stars = seconds <= l.stars[0] ? 3 : seconds <= l.stars[1] ? 2 : 1;
  progress.stars[id] = Math.max(progress.stars[id] ?? 0, stars);
  progress.xp = (progress.xp ?? 0) + 100 + 50 * stars;
  if (id < LEVELS.length) progress.unlocked = Math.max(progress.unlocked, id + 1);
  progress.current = Math.min(LEVELS.length, id + 1);
  saveProgress();
  return stars;
}
