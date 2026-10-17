/** Who can talk in radio calls and cutscenes: display name (Arabic / English), badge colour and badge letter. */
import type { Who } from '../game/missions/Levels';

export type Speaker = Who | 'narrator';

export interface SpeakerInfo {
  name: string;
  nameEn: string;
  color: string;
  /** letter shown on the round portrait badge */
  badge: string;
}

export const SPEAKERS: Record<Speaker, SpeakerInfo> = {
  mona: { name: 'الرقيب منى · العمليات', nameEn: 'Sgt. Mona · Dispatch', color: '#3aa0ff', badge: 'م' },
  hamed: { name: 'النقيب حامد', nameEn: 'Capt. Hamed', color: '#ffd23d', badge: 'ح' },
  yasser: { name: 'ياسر', nameEn: 'Yasser', color: '#7dff9a', badge: 'ي' },
  suspect: { name: 'المشتبه به', nameEn: 'Suspect', color: '#ff6b81', badge: '؟' },
  informant: { name: 'الواشي', nameEn: 'Informant', color: '#c39bff', badge: 'و' },
  boss: { name: 'الزعيم', nameEn: 'Al-Zaeem', color: '#ff3b3b', badge: 'ز' },
  narrator: { name: '', nameEn: '', color: '#cfd8e6', badge: '' }
};

/** Story text language: Arabic unless the page is switched to English. */
export const storyLang = (): 'ar' | 'en' =>
  typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'ar';
