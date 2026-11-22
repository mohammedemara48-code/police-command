import { places, type Place } from '../logic/places';

/** The four mission districts, each on its main street of the real map (logic/places.ts). */
export type StreetPlace = Place;
export const streetPlaces = (): StreetPlace[] => places();

export interface ChaseReport {
  success: boolean;
  placeName: string;
  summary: string;
  money: number;
  rep: number;
  title?: string;
  events?: string[];
  durationSec?: number;
  arrests?: number;
  escaped?: number;
  injuries?: number;
  score?: number;
  kindLabel?: string;
}

export type MissionKind = 'chase' | 'robbery' | 'drugs' | 'assault' | 'traffic';

export interface MissionDef {
  id: string;
  placeId: string;
  kind: MissionKind;
  title: string;
  blurb: string;
}

export const MISSION_POOL: MissionDef[] = [
  {
    id: 'm-port-chase',
    placeId: 'port',
    kind: 'chase',
    title: 'مطاردة هاربين',
    blurb: 'سيارة سودا هاربة من شارع شبرا'
  },
  {
    id: 'm-down-rob',
    placeId: 'downtown',
    kind: 'robbery',
    title: 'سطو على محل',
    blurb: 'مسلحون داخل محل في شارع التحرير'
  },
  {
    id: 'm-corn-drug',
    placeId: 'corniche',
    kind: 'drugs',
    title: 'تفتيش مخدرات',
    blurb: 'صفقة مشبوهة على كورنيش الجيزة'
  },
  {
    id: 'm-sub-assault',
    placeId: 'suburb',
    kind: 'assault',
    title: 'اعتداء في الشارع',
    blurb: 'مشاجرة وعنف في شارع الهرم'
  },
  {
    id: 'm-port-traffic',
    placeId: 'port',
    kind: 'traffic',
    title: 'حادث مروري',
    blurb: 'تصادم وإغلاق طريق في شارع الخلفاوي'
  },
  { id: 'm-down-chase', placeId: 'downtown', kind: 'chase', title: 'مطاردة وسط البلد', blurb: 'هارب يقطع الإشارات' },
  { id: 'm-corn-rob', placeId: 'corniche', kind: 'robbery', title: 'سرقة في الدقي', blurb: 'سطو على كشك ليلي' },
  { id: 'm-sub-drugs', placeId: 'suburb', kind: 'drugs', title: 'مداهمة بيت', blurb: 'بلاغ مخدرات في الهرم' }
];

