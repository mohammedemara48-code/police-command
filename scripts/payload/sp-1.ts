import * as THREE from 'three';
import { audio } from './AudioManager';

export interface StreetPlace {
  id: string;
  name: string;
  z: number;
  blurb: string;
}

export const STREET_PLACES: StreetPlace[] = [
  { id: 'downtown', name: 'وسط البلد', z: 0, blurb: 'أبراج ونوافذ مضيئة' },
  { id: 'port', name: 'الميناء', z: 100, blurb: 'أرصفة وحاويات' },
  { id: 'corniche', name: 'الكورنيش', z: 190, blurb: 'واجهة مائية' },
  { id: 'suburb', name: 'الضاحية', z: -72, blurb: 'بيوت وشوارع هادئة' }
];
