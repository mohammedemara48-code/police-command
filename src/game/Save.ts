/** Autosave/resume of the command center, plus save export/import (all `pc.*` localStorage keys). */
import type { GameManager } from './GameManager';
import { COMMAND_KEY, SAVE_PREFIX, buildSaveFile, mergePersisted, parseSaveFile, pickPersisted } from './logic/save';

export function restoreCommand(game: GameManager) {
  try {
    const raw = localStorage.getItem(COMMAND_KEY);
    if (!raw) return false;
    game.state = mergePersisted(
      game.state as unknown as Record<string, unknown>,
      JSON.parse(raw)
    ) as unknown as typeof game.state;
    for (const t of game.techDefs) t.unlocked = !!game.state.techs[t.id];
    return true;
  } catch {
    return false;
  }
}

export function saveCommand(game: GameManager) {
  try {
    localStorage.setItem(COMMAND_KEY, JSON.stringify(pickPersisted(game.state)));
  } catch {
    /* storage full / private mode */
  }
}

let current: GameManager | null = null;

export function startAutosave(game: GameManager, everyMs = 15000) {
  current = game;
  setInterval(() => saveCommand(game), everyMs);
  const flush = () => saveCommand(game);
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
  });
}

export function exportSave() {
  if (current) saveCommand(current);
  const entries: Array<[string, string]> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(SAVE_PREFIX)) entries.push([k, localStorage.getItem(k) ?? '']);
  }
  const file = buildSaveFile(entries);
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `police-command-save-${file.savedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Opens a file picker; on a valid save, replaces local data and reloads. Resolves with an error text on failure. */
export function importSave(): Promise<string | null> {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return resolve(null);
      const r = parseSaveFile(await f.text());
      if (!r.ok) return resolve(r.error);
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith(SAVE_PREFIX)) localStorage.removeItem(k);
        for (const [k, v] of Object.entries(r.data)) localStorage.setItem(k, v);
      } catch {
        return resolve('مقدرناش نحفظ البيانات على الجهاز ده.');
      }
      location.reload();
      resolve(null);
    };
    inp.click();
  });
}
