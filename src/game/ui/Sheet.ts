/** A small modal card over the street view (trip board, shift summary, workshop). Compact on phones: a bottom sheet in portrait. */
export interface Sheet {
  el: HTMLElement;
  /** replace the card's content (listeners are bound again) */
  set(html: string): void;
  close(): void;
}

export function sheet(
  id: string,
  html: string,
  bind: (card: HTMLElement, s: Sheet) => void = () => undefined,
  onClose: () => void = () => undefined
): Sheet {
  document.getElementById(id)?.remove();
  const el = document.createElement('div');
  el.id = id;
  el.className = 'tx-sheet';
  el.innerHTML = `<div class="tx-card" role="dialog"></div>`;
  const card = el.firstElementChild as HTMLElement;
  let closed = false;
  const s: Sheet = {
    el,
    set(h) {
      card.innerHTML = h;
      card.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => b.addEventListener('click', () => s.close()));
      bind(card, s);
    },
    close() {
      if (closed) return;
      closed = true;
      el.remove();
      onClose();
    }
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.target === el) s.close();
  });
  // keep the game's own touch handlers (drive stick, camera drag) from seeing taps on the card
  for (const t of [
    'pointerdown',
    'pointermove',
    'pointerup',
    'touchstart',
    'touchmove',
    'touchend',
    'mousedown'
  ] as const)
    card.addEventListener(t, (e) => e.stopPropagation());
  (document.getElementById('app') ?? document.body).appendChild(el);
  s.set(html);
  return s;
}
