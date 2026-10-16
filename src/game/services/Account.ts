/**
 * Optional player account (Neon Auth + Neon Data API). Guest play stays local; when signed in, progress
 * (levels/stars, achievements, career level, best score) is merged with the server copy and synced.
 * Only public endpoints live here: data access is enforced server-side by row-level security (user_id = auth.user_id()).
 */
import { progress, saveProgress } from '../missions/Levels';
import { ach, saveAch } from '../systems/Achievements';
import { storedCharacter, setCharacter } from '../entities/Character';
import { sanitizeChar, newerChar } from '../logic/character';

const AUTH = 'https://ep-calm-hill-b4a4ddw6.neonauth.c-6.us-east-2.aws.neon.tech/game/auth';
const API = 'https://ep-calm-hill-b4a4ddw6.apirest.c-6.us-east-2.aws.neon.tech/game/rest/v1';
const META_KEY = 'pc.save.v1';

export interface User {
  id: string;
  email: string;
  name?: string;
}
export const account: { user: User | null; status: string; lastSync: number } = { user: null, status: '', lastSync: 0 };
let jwt = '';
let jwtExp = 0;
let lastPushed = '';
const listeners: (() => void)[] = [];
export const onAccount = (f: () => void) => listeners.push(f);
const emit = () => listeners.forEach((f) => f());

async function auth(path: string, body?: unknown) {
  const r = await fetch(AUTH + path, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { message?: string }).message || `HTTP ${r.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped auth server JSON
  return j as Record<string, any>;
}

async function token() {
  if (jwt && Date.now() < jwtExp - 30000) return jwt;
  const j = await auth('/token');
  jwt = j.token;
  try {
    jwtExp = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000;
  } catch {
    jwtExp = Date.now() + 5 * 60000;
  }
  return jwt;
}

/** fetch against the Data API with the signed-in user's JWT */
export async function authedFetch(path: string, init: RequestInit = {}) {
  const t = await token();
  const r = await fetch(API + path, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${t}` }
  });
  if (!r.ok) throw new Error(`api ${r.status}`);
  return r;
}

function readMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}');
  } catch {
    return {};
  }
}

function snapshot() {
  return {
    levels: { ...progress, stars: { ...progress.stars } },
    ach: { stats: { ...ach.stats }, unlocked: { ...ach.unlocked } },
    meta: readMeta(),
    char: storedCharacter()
  };
}
type Snap = ReturnType<typeof snapshot>;

/** Merge never loses progress: max of every counter, union of unlocks. */
function merge(a: Snap, b: Partial<Snap>): Snap {
  const out = snapshot();
  const L = b.levels;
  if (L) {
    out.levels.unlocked = Math.max(a.levels.unlocked, L.unlocked || 1);
    out.levels.current = Math.max(a.levels.current, L.current || 1);
    out.levels.xp = Math.max(a.levels.xp ?? 0, L.xp ?? 0);
    out.levels.money = Math.max(a.levels.money ?? 0, L.money ?? 0);
    for (const [k, v] of Object.entries(L.stars || {}))
      out.levels.stars[+k] = Math.max(a.levels.stars[+k] ?? 0, v as number);
    const owns = new Set([...(a.levels.ownedWeapons || ['pistol']), ...((L.ownedWeapons as string[]) || [])]);
    out.levels.ownedWeapons = ['pistol', 'revolver', 'smg'].filter((id) => owns.has(id)) as typeof out.levels.ownedWeapons;
    const ag = a.levels.garage || { engine: 0, armor: 0, brakes: 0 };
    const bg = (L.garage as typeof ag) || { engine: 0, armor: 0, brakes: 0 };
    out.levels.garage = {
      engine: Math.max(ag.engine ?? 0, bg.engine ?? 0),
      armor: Math.max(ag.armor ?? 0, bg.armor ?? 0),
      brakes: Math.max(ag.brakes ?? 0, bg.brakes ?? 0)
    };
  }
  const A = b.ach;
  if (A) {
    for (const [k, v] of Object.entries(A.stats || {}))
      (out.ach.stats as Record<string, number>)[k] = Math.max(
        (a.ach.stats as Record<string, number>)[k] ?? 0,
        v as number
      );
    for (const [k, v] of Object.entries(A.unlocked || {}))
      out.ach.unlocked[k] = Math.min(a.ach.unlocked[k] ?? Infinity, v as number);
  }
  // character: the newer edit wins (never overwritten by a device that has none)
  out.char = newerChar(a.char, b.char ? sanitizeChar(b.char) : null);
  const M = b.meta || {};
  for (const k of ['best', 'shifts', 'resolved', 'level'])
    if (typeof M[k] === 'number') out.meta[k] = Math.max(a.meta[k] ?? 0, M[k]);
  return out;
}

function apply(s: Snap) {
  Object.assign(progress, s.levels);
  saveProgress();
  Object.assign(ach.stats, s.ach.stats);
  Object.assign(ach.unlocked, s.ach.unlocked);
  saveAch();
  if (s.char && s.char !== storedCharacter()) setCharacter(s.char, false);
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ ...readMeta(), ...s.meta }));
  } catch {
    /* ignore */
  }
}

export async function sync() {
  if (!account.user) return;
  try {
    const t = await token();
    const r = await fetch(`${API}/progress?select=data`, { headers: { Authorization: `Bearer ${t}` } });
    const rows = r.ok ? await r.json() : [];
    const merged = merge(snapshot(), rows[0]?.data || {});
    apply(merged);
    const body = JSON.stringify({ data: merged });
    if (body !== lastPushed) {
      const w = await fetch(`${API}/progress?on_conflict=user_id`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${t}`,
          'content-type': 'application/json',
          Prefer: 'resolution=merge-duplicates'
        },
        body
      });
      if (!w.ok) throw new Error(`sync ${w.status}`);
      lastPushed = body;
    }
    account.lastSync = Date.now();
    account.status = 'اتحفظ على حسابك ✔';
  } catch (e) {
    account.status = 'مزامنة متأجلة (مفيش اتصال؟)';
    console.warn('sync', e);
  }
  emit();
}

export async function restore() {
  try {
    const j = await auth('/get-session');
    account.user = j?.user ? { id: j.user.id, email: j.user.email, name: j.user.name } : null;
  } catch {
    account.user = null;
  }
  emit();
  if (account.user) await sync();
}

export async function signIn(email: string, password: string, create: boolean) {
  const j = create
    ? await auth('/sign-up/email', { email, password, name: email.split('@')[0] })
    : await auth('/sign-in/email', { email, password });
  account.user = { id: j.user.id, email: j.user.email, name: j.user.name };
  jwt = '';
  await sync(); // first login merges this device's guest progress into the account
}

export async function google() {
  const j = await auth('/sign-in/social', { provider: 'google', callbackURL: location.origin + '/' });
  if (j.url) location.href = j.url;
}

export async function signOut() {
  try {
    await auth('/sign-out', {});
  } catch {
    /* ignore */
  }
  account.user = null;
  jwt = '';
  account.status = '';
  emit();
}

// background sync: cheap JSON compare every 20 s, only when signed in and something changed
setInterval(() => {
  if (!account.user || document.hidden) return;
  if (JSON.stringify({ data: merge(snapshot(), {}) }) !== lastPushed) void sync();
}, 20000);

export function accountHtml() {
  const u = account.user;
  return u
    ? `<h2>حسابي</h2><p>مسجّل باسم <b dir="ltr">${u.email.replace(/[<>&"]/g, '')}</b></p>
       <p class="hint">${account.status || 'تقدمك بيتحفظ على السيرفر ويتزامن على كل أجهزتك.'}</p>
       <div class="menu-col"><button class="btn" data-acc="sync">مزامنة دلوقتي</button><button class="btn ghost" data-acc="out">تسجيل خروج</button><button class="btn ghost" data-m="main">رجوع</button></div>`
    : `<h2>تسجيل الدخول</h2><p class="hint">اختياري — تقدر تلعب كضيف. لو دخلت، المستويات والنجوم والإنجازات تتحفظ على حسابك.</p>
       <div class="acc-form"><input id="acc-email" type="email" placeholder="الإيميل" dir="ltr" autocomplete="email">
       <input id="acc-pass" type="password" placeholder="كلمة السر (8 حروف على الأقل)" dir="ltr" autocomplete="current-password" minlength="8">
       <div class="acc-msg"></div>
       <div class="menu-col"><button class="btn" data-acc="in">دخول</button><button class="btn ghost" data-acc="up">حساب جديد</button>
       <button class="btn ghost" data-acc="google">الدخول بجوجل</button><button class="btn ghost" data-m="main">رجوع</button></div></div>`;
}

export function bindAccount(root: HTMLElement, rerender: () => void) {
  const msg = (t: string) => {
    const m = root.querySelector('.acc-msg');
    if (m) m.textContent = t;
  };
  root.querySelectorAll<HTMLButtonElement>('[data-acc]').forEach((b) =>
    b.addEventListener('click', async () => {
      const a = b.dataset.acc;
      try {
        if (a === 'out') {
          await signOut();
          return rerender();
        }
        if (a === 'sync') {
          await sync();
          return rerender();
        }
        if (a === 'google') {
          msg('جاري التحويل لجوجل…');
          return void (await google());
        }
        const email = (root.querySelector('#acc-email') as HTMLInputElement).value.trim();
        const pass = (root.querySelector('#acc-pass') as HTMLInputElement).value;
        if (!/^\S+@\S+\.\S+$/.test(email) || pass.length < 8) return msg('اكتب إيميل صحيح وكلمة سر 8 حروف على الأقل.');
        msg('لحظة…');
        await signIn(email, pass, a === 'up');
        rerender();
      } catch (e) {
        msg('مقدرناش ندخلك: ' + ((e as Error).message || 'خطأ'));
      }
    })
  );
}
