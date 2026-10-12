/** Street-mode campaign: ordered levels, unlocks and star ratings saved locally. */
export interface LevelDef {
  id: number;
  placeId: 'downtown' | 'port' | 'corniche' | 'suburb';
  title: string;
  brief: string;
  /** suspect speed multiplier */
  speed: number;
  /** seconds before the suspect escapes */
  limit: number;
  reward: number;
  rep: number;
  /** finish under these seconds for 3 / 2 stars */
  stars: [number, number];
}

export const LEVELS: LevelDef[] = [
  { id: 1, placeId: 'port', title: 'أول دورية', brief: 'سيارة مسروقة خارجة من الميناء. اركب الدورية واقفل عليها.', speed: 0.8, limit: 34, reward: 1500, rep: 4, stars: [10, 18] },
  { id: 2, placeId: 'downtown', title: 'إشارات مكسورة', brief: 'هارب بيقطع الإشارات في وسط البلد.', speed: 0.9, limit: 30, reward: 1900, rep: 5, stars: [10, 17] },
  { id: 3, placeId: 'corniche', title: 'ليلة الكورنيش', brief: 'صفقة مشبوهة على الكورنيش والسيارة هربت.', speed: 1.0, limit: 28, reward: 2400, rep: 6, stars: [11, 18] },
  { id: 4, placeId: 'suburb', title: 'هدوء مخادع', brief: 'بلاغ اعتداء في الضاحية، والمعتدي بيهرب بعربية.', speed: 1.05, limit: 27, reward: 2800, rep: 6, stars: [11, 18] },
  { id: 5, placeId: 'port', title: 'شحنة الميناء', brief: 'عصابة تهريب بعربية سريعة.', speed: 1.15, limit: 26, reward: 3300, rep: 7, stars: [12, 19] },
  { id: 6, placeId: 'downtown', title: 'سطو البنك', brief: 'لصوص البنك هاربين — أسرع هارب لحد دلوقتي.', speed: 1.25, limit: 25, reward: 4000, rep: 8, stars: [12, 19] },
  { id: 7, placeId: 'corniche', title: 'مطاردة المطر', brief: 'الطريق مبلول والهارب محترف.', speed: 1.32, limit: 24, reward: 4700, rep: 9, stars: [13, 19] },
  { id: 8, placeId: 'suburb', title: 'الزعيم', brief: 'زعيم العصابة بنفسه. دي المهمة الأخيرة.', speed: 1.42, limit: 24, reward: 6000, rep: 12, stars: [13, 20] }
];

const KEY = 'pc.levels.v1';
interface Progress { unlocked: number; stars: Record<number, number>; current: number }

function load(): Progress {
  try { return { unlocked: 1, stars: {}, current: 1, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { unlocked: 1, stars: {}, current: 1 }; }
}

export const progress = load();
export function saveProgress() { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* ignore */ } }

export function levelById(id: number) { return LEVELS.find((l) => l.id === id) ?? LEVELS[0]; }

/** Record a result; returns earned stars (0 on fail). */
export function completeLevel(id: number, success: boolean, seconds: number) {
  if (!success) return 0;
  const l = levelById(id);
  const stars = seconds <= l.stars[0] ? 3 : seconds <= l.stars[1] ? 2 : 1;
  progress.stars[id] = Math.max(progress.stars[id] ?? 0, stars);
  if (id < LEVELS.length) progress.unlocked = Math.max(progress.unlocked, id + 1);
  progress.current = Math.min(LEVELS.length, id + 1);
  saveProgress();
  return stars;
}
