/**
 * The recorded background music (see CREDITS.md): one playlist per place in the game. A single file loops on its
 * baked crossfade; a playlist of several plays them one after the other. Pure data so tests stay light.
 */
import type { TrackId } from './maqam';

export type MusicId = 'menu' | 'taxi' | 'police' | 'free';

export interface MusicFile {
  /** file name in /music without the extension (.m4a and .ogg are both shipped) */
  file: string;
  title: string;
  artist: string;
  /** length in seconds; the end is crossfaded into the start so it loops cleanly */
  loop: number;
}

export interface MusicTrack {
  id: MusicId;
  files: MusicFile[];
  /** the generated (synth) track used when no file can be played */
  fallback: TrackId;
}

/** The game owner's own track: first and default while driving. */
const OWNER: MusicFile = {
  file: 'taxi-user-main',
  title: 'Main theme',
  artist: 'Supplied and licensed by the game owner',
  loop: 175
};
const OWNER2: MusicFile = {
  file: 'taxi-user-main2',
  title: 'Main theme 2',
  artist: 'Supplied and licensed by the game owner',
  loop: 177
};
const IBN: MusicFile = { file: 'taxi-ibn-al-noor', title: 'Ibn Al-Noor', artist: 'Kevin MacLeod', loop: 215 };
const SYNTH: MusicFile = {
  file: 'taxi2-arab-synthwave',
  title: 'Arabic / Eastern Electronic Synth',
  artist: 'agent178',
  loop: 95
};

export const MUSIC: Record<MusicId, MusicTrack> = {
  menu: {
    id: 'menu',
    files: [{ file: 'menu-desert-city', title: 'Desert City', artist: 'Kevin MacLeod', loop: 86 }],
    fallback: 'menu'
  },
  taxi: { id: 'taxi', files: [OWNER, OWNER2, IBN, SYNTH], fallback: 'taxi' },
  police: {
    id: 'police',
    files: [{ file: 'police-curse-of-the-scarab', title: 'Curse of the Scarab', artist: 'Kevin MacLeod', loop: 160 }],
    fallback: 'police'
  },
  free: {
    id: 'free',
    files: [
      OWNER,
      OWNER2,
      { file: 'free-balzan-groove', title: 'Balzan Groove', artist: 'Kevin MacLeod', loop: 122 },
      SYNTH
    ],
    fallback: 'taxi'
  }
};

/** Which music goes with a vehicle mode (taxi work and free driving = upbeat, police = tense). */
export function musicForMode(mode: 'police' | 'taxi' | 'free'): MusicId {
  return mode;
}

/** The file to fetch: AAC for Safari / iOS, Ogg Vorbis where AAC is missing. */
export function musicUrl(f: MusicFile, canPlay: (mime: string) => string): string {
  const aac = canPlay('audio/mp4; codecs="mp4a.40.2"');
  return `/music/${f.file}.${aac ? 'm4a' : 'ogg'}`;
}

/** The in-car radio: the driver picks a station. 'auto' = the playlist for the mode, 'off' = silence. */
export type RadioPick = 'auto' | 'off' | string;

/** Every recorded file once, the owner's tracks first, in the order the radio cycles through them. */
export const RADIO_FILES: MusicFile[] = (() => {
  const seen = new Map<string, MusicFile>();
  for (const id of ['taxi', 'free', 'police', 'menu'] as MusicId[])
    for (const f of MUSIC[id].files) if (!seen.has(f.file)) seen.set(f.file, f);
  return [...seen.values()];
})();

const RADIO_NAMES: Record<string, string> = {
  'taxi-user-main': 'تراك ١',
  'taxi-user-main2': 'تراك ٢',
  'taxi-ibn-al-noor': 'ابن النور',
  'taxi2-arab-synthwave': 'سينث شرقي',
  'free-balzan-groove': 'بلزان',
  'police-curse-of-the-scarab': 'لعنة الجعران',
  'menu-desert-city': 'مدينة الصحرا'
};

export function radioLabel(p: RadioPick): string {
  if (p === 'auto') return 'تلقائي';
  if (p === 'off') return 'مقفول';
  return RADIO_NAMES[p] ?? RADIO_FILES.find((f) => f.file === p)?.title ?? p;
}

/** Order of the radio's single button: auto, each track, off, back to auto. */
export function radioOrder(): RadioPick[] {
  return ['auto', ...RADIO_FILES.map((f) => f.file), 'off'];
}
export function nextRadio(p: RadioPick): RadioPick {
  const o = radioOrder();
  const i = o.indexOf(p);
  return o[(i + 1) % o.length]!;
}
export function sanitizeRadio(p: unknown): RadioPick {
  return typeof p === 'string' && radioOrder().includes(p) ? p : 'auto';
}

/** The files to play for a place and the driver's pick. The menu ignores the radio. Empty = silence. */
export function playlistFor(id: MusicId, pick: RadioPick): MusicFile[] {
  if (id === 'menu' || pick === 'auto') return MUSIC[id].files;
  if (pick === 'off') return [];
  const f = RADIO_FILES.find((x) => x.file === pick);
  return f ? [f] : MUSIC[id].files;
}
