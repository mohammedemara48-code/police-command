/** Achievements: stats + unlocks saved on the device (and synced to the account when signed in). */
import { LEVELS, progress } from './Levels';

export interface Stats {
  arrests: number;
  gang: number;
  distance: number;
  shots: number;
  hits: number;
  missions: number;
  deaths: number;
}
interface Ach {
  id: string;
  icon: string;
  title: string;
  desc: string;
  test: (s: Stats) => boolean;
}

const KEY = 'pc.ach.v1';
const allStars = () => LEVELS.every((l) => (progress.stars[l.id] ?? 0) >= 3);
const done = () => LEVELS.filter((l) => (progress.stars[l.id] ?? 0) > 0).length;

export const ACHIEVEMENTS: Ach[] = [
  { id: 'first_arrest', icon: '🚓', title: 'أول قبضة', desc: 'اقبض على أول هارب', test: (s) => s.arrests >= 1 },
  { id: 'arrest10', icon: '🔗', title: 'إيد من حديد', desc: '10 قبضات', test: (s) => s.arrests >= 10 },
  { id: 'gang1', icon: '🎯', title: 'أول مواجهة', desc: 'حيّد أول فرد عصابة', test: (s) => s.gang >= 1 },
  { id: 'gang10', icon: '🛡️', title: 'كاسر العصابات', desc: 'حيّد 10 أفراد عصابات', test: (s) => s.gang >= 10 },
  { id: 'gang50', icon: '⭐', title: 'رعب الشوارع', desc: 'حيّد 50 فرد عصابة', test: (s) => s.gang >= 50 },
  { id: 'sharp', icon: '🔫', title: 'قناص', desc: '25 طلقة في الهدف', test: (s) => s.hits >= 25 },
  { id: 'km1', icon: '🛣️', title: 'أول كيلو', desc: 'اسوق 1 كم', test: (s) => s.distance >= 1000 },
  { id: 'km20', icon: '🏁', title: 'ملك الطريق', desc: 'اسوق 20 كم', test: (s) => s.distance >= 20000 },
  { id: 'half', icon: '📋', title: 'نص المشوار', desc: 'خلّص 4 مستويات', test: () => done() >= 4 },
  { id: 'all', icon: '🏆', title: 'المدينة أمان', desc: 'خلّص كل المستويات', test: () => done() >= LEVELS.length },
  { id: 'stars', icon: '🌟', title: 'كامل النجوم', desc: '3 نجوم في كل المستويات', test: allStars }
];

interface Save {
  stats: Stats;
  unlocked: Record<string, number>;
}
function load(): Save {
  const base: Save = {
    stats: { arrests: 0, gang: 0, distance: 0, shots: 0, hits: 0, missions: 0, deaths: 0 },
    unlocked: {}
  };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { stats: { ...base.stats, ...s.stats }, unlocked: { ...s.unlocked } };
  } catch {
    return base;
  }
}
export const ach = load();
let dirty = false;
let saveT = 0;
const listeners: (() => void)[] = [];
export function onAchChange(f: () => void) {
  listeners.push(f);
}
export function saveAch() {
  try {
    localStorage.setItem(KEY, JSON.stringify(ach));
  } catch {
    /* ignore */
  }
  dirty = false;
  listeners.forEach((f) => f());
}

function toast(a: Ach) {
  const el = document.createElement('div');
  el.className = 'ach-toast';
  el.innerHTML = `<span>${a.icon}</span><div><small>إنجاز جديد</small><b>${a.title}</b></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3800);
}

export function checkAch() {
  for (const a of ACHIEVEMENTS) {
    if (!ach.unlocked[a.id] && a.test(ach.stats)) {
      ach.unlocked[a.id] = Date.now();
      toast(a);
      dirty = true;
    }
  }
  if (dirty) saveAch();
}

/** Increment a stat. Distance is batched (saved every few seconds) to keep frames cheap. */
export function addStat(k: keyof Stats, n = 1) {
  ach.stats[k] += n;
  dirty = true;
  if (k === 'distance') {
    const now = performance.now();
    if (now - saveT < 4000) return;
    saveT = now;
  }
  checkAch();
  if (dirty) saveAch();
}

export function achHtml() {
  const n = Object.keys(ach.unlocked).length;
  return `<h2>الإنجازات <small>${n}/${ACHIEVEMENTS.length}</small></h2>
  <div class="ach-list">${ACHIEVEMENTS.map((a) => {
    const on = !!ach.unlocked[a.id];
    return `<div class="ach ${on ? 'on' : ''}"><span>${on ? a.icon : '🔒'}</span><div><b>${a.title}</b><small>${a.desc}</small></div></div>`;
  }).join('')}</div>
  <p class="hint">قبضات ${ach.stats.arrests} · عصابات ${ach.stats.gang} · مسافة ${(ach.stats.distance / 1000).toFixed(1)} كم</p>`;
}
