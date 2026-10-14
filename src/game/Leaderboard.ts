/** Weekly leaderboard on Neon (table weekly_scores, RLS + anti-cheat trigger server-side). Signed-in players only. */
import { addWeekly, boardName, weekStart, type Weekly } from './logic/weekly';
import { account, authedFetch } from './Account';

const KEY = 'pc.week.v1';

export function readWeekly(): Weekly | null {
  try {
    const w = JSON.parse(localStorage.getItem(KEY) || 'null') as Weekly | null;
    return w && w.week === weekStart() ? w : null;
  } catch {
    return null;
  }
}

/** Called after every successful mission with the XP it gave. */
export function recordWeekly(points: number) {
  const w = addWeekly(readWeekly(), points);
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    /* ignore */
  }
  void pushWeekly();
}

export async function pushWeekly() {
  const w = readWeekly();
  if (!account.user || !w) return;
  try {
    await authedFetch('/weekly_scores?on_conflict=user_id,week', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        name: boardName(account.user.name, account.user.email),
        points: w.points,
        missions: w.missions
      })
    });
  } catch {
    /* offline: retried after the next mission */
  }
}

interface Row {
  user_id: string;
  name: string;
  points: number;
  missions: number;
}

export async function boardHtml(): Promise<string> {
  const mine = readWeekly();
  const head = `<h2>🏆 ترتيب الأسبوع</h2><p class="hint">بيبدأ من جديد كل اتنين. نقطك الأسبوع ده: <b>${mine?.points ?? 0}</b> (${mine?.missions ?? 0} مهمة).</p>`;
  if (!account.user)
    return `${head}<p class="hint">سجّل دخول عشان تدخل الترتيب وتشوف الباقيين.</p><div class="menu-col"><button class="btn" data-m="account">👤 تسجيل الدخول</button>`;
  try {
    await pushWeekly();
    const r = await authedFetch(
      `/weekly_scores?select=user_id,name,points,missions&week=eq.${weekStart()}&order=points.desc&limit=20`
    );
    const rows = (await r.json()) as Row[];
    if (!rows.length)
      return `${head}<p class="hint">لسه محدش لعب الأسبوع ده. خلّص مهمة وابقى الأول!</p><div class="menu-col">`;
    const esc = (s: string) => s.replace(/[<>&"]/g, '');
    const list = rows
      .map(
        (x, i) =>
          `<li class="${x.user_id === account.user?.id ? 'me' : ''}"><b>${i + 1}</b><span>${esc(x.name)}</span><i>${x.points}</i></li>`
      )
      .join('');
    return `${head}<ol class="board">${list}</ol><div class="menu-col">`;
  } catch {
    return `${head}<p class="hint">مقدرناش نجيب الترتيب دلوقتي (مفيش اتصال؟).</p><div class="menu-col">`;
  }
}
