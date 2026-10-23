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
  taxi: { id: 'taxi', files: [IBN, SYNTH], fallback: 'taxi' },
  police: {
    id: 'police',
    files: [{ file: 'police-curse-of-the-scarab', title: 'Curse of the Scarab', artist: 'Kevin MacLeod', loop: 160 }],
    fallback: 'police'
  },
  free: {
    id: 'free',
    files: [{ file: 'free-balzan-groove', title: 'Balzan Groove', artist: 'Kevin MacLeod', loop: 122 }, SYNTH],
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
