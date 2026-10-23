/**
 * The recorded background music: four loops rendered from real instrument recordings (see CREDITS.md),
 * one per place in the game. Pure data so tests stay light.
 */
import type { TrackId } from './maqam';

export type MusicId = 'menu' | 'taxi' | 'police' | 'free';

export interface MusicTrack {
  id: MusicId;
  /** file name in /music without the extension (.m4a and .ogg are both shipped) */
  file: string;
  title: string;
  /** exact loop length in seconds (the loop point, whole bars) */
  loop: number;
  /** the generated (synth) track used while the file loads or when it cannot be played */
  fallback: TrackId;
}

const bars = (n: number, bpm: number, beats: number) => (n * beats * 60) / bpm;

export const MUSIC: Record<MusicId, MusicTrack> = {
  menu: { id: 'menu', file: 'menu-zuruni', title: 'زوروني كل سنة مرة — عود', loop: bars(16, 84, 4), fallback: 'menu' },
  taxi: {
    id: 'taxi',
    file: 'taxi-salma',
    title: 'سالمة يا سلامة — أكورديون ومقسوم',
    loop: bars(32, 118, 4),
    fallback: 'taxi'
  },
  police: {
    id: 'police',
    file: 'police-hijaz',
    title: 'مطاردة — حجاز على ملفوف',
    loop: bars(48, 150, 2),
    fallback: 'police'
  },
  free: { id: 'free', file: 'free-saidi', title: 'صعيدي — بياتي', loop: bars(24, 112, 4), fallback: 'taxi' }
};

/** Which music goes with a vehicle mode (taxi work = sha'bi, police = tense, free driving = saidi). */
export function musicForMode(mode: 'police' | 'taxi' | 'free'): MusicId {
  return mode;
}

/** The file to fetch: AAC for Safari / iOS, Ogg Vorbis where AAC is missing. */
export function musicUrl(t: MusicTrack, canPlay: (mime: string) => string): string {
  const aac = canPlay('audio/mp4; codecs="mp4a.40.2"');
  return `/music/${t.file}.${aac ? 'm4a' : 'ogg'}`;
}
