/** Weekly leaderboard rules (pure). Weeks start Monday 00:00 UTC, same as the server (date_trunc('week')). */
export function weekStart(d: Date = new Date()): string {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(t - dow * 86400000).toISOString().slice(0, 10);
}

export interface Weekly {
  week: string;
  points: number;
  missions: number;
}

/** Add points for a finished mission, starting a fresh tally when the week changed. */
export function addWeekly(w: Weekly | null, points: number, now: Date = new Date()): Weekly {
  const week = weekStart(now);
  const base = w && w.week === week ? w : { week, points: 0, missions: 0 };
  return { week, points: base.points + Math.max(0, Math.round(points)), missions: base.missions + 1 };
}

/** Display name for the board: never the e-mail address. */
export function boardName(name: string | undefined, email: string | undefined): string {
  const n = (name || '').trim() || (email || '').split('@')[0] || 'ضابط';
  return n.replace(/[<>&"]/g, '').slice(0, 24) || 'ضابط';
}
