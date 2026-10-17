/** First-call interactive tutorial: picks the hint for the current situation (pure, unit-tested). */
export type TutAct = 'car' | 'move' | 'order' | 'cuff' | null;
export interface TutState {
  step: 'radio' | 'car' | 'goto' | 'chase' | 'suspects' | 'pullover' | 'checkpoints' | 'trap' | 'escort' | 'done';
  inCar: boolean;
  radioShowing: boolean;
  /** state of the nearest suspect still free (undefined when none) */
  targetState?: string;
  targetDist?: number;
  touch: boolean;
}
export interface TutHint {
  n: number;
  text: string;
  act: TutAct;
}

export const TUT_STEPS = 5;
export const TUT_KEY = 'pc.tutorial.v1';

export function tutorialHint(s: TutState): TutHint | null {
  if (s.radioShowing || s.step === 'radio' || s.step === 'done') return null;
  const k = (touch: string, keys: string) => (s.touch ? touch : keys);
  if (s.step === 'car') {
    return s.inCar
      ? null
      : {
          n: 1,
          text: k('حرّك العصا ناحية الدورية واضغط «ركب الدورية».', 'امشي بـ W A S D للدورية واضغط E.'),
          act: 'car'
        };
  }
  if (s.step === 'goto') {
    if (!s.inCar) return { n: 1, text: k('ارجع اركب الدورية: «ركب الدورية».', 'ارجع اركب الدورية: E.'), act: 'car' };
    return {
      n: 2,
      text: k(
        'سوق بالأسهم واتبع السهم الأصفر والخط على الخريطة الصغيرة.',
        'سوق بـ W/S واللف بـ A/D واتبع السهم الأصفر.'
      ),
      act: 'move'
    };
  }
  if (s.step === 'suspects' || s.step === 'chase') {
    if (s.inCar) return { n: 3, text: k('انزل من العربية: اضغط «انزل».', 'انزل من العربية: E.'), act: 'car' };
    if (s.targetState === 'hands') {
      return (s.targetDist ?? 99) > 2.6
        ? { n: 5, text: 'رفع إيده! قرّب منه لحد ما تلمسه.', act: 'move' }
        : { n: 5, text: k('دلوقتي اضغط «🔗 كلبش».', 'دلوقتي اضغط C للكلبشة.'), act: 'cuff' };
    }
    if (s.targetState === 'flee') return { n: 4, text: 'بيجري! اجري وراه (زرار ركض) وقرّب منه.', act: 'move' };
    if ((s.targetDist ?? 99) > 16) return { n: 4, text: 'قرّب من المشتبه به (العلامة الحمرا).', act: 'move' };
    return { n: 4, text: k('بص عليه واضغط «📢 استسلم!».', 'بص عليه واضغط Q: «استسلم!».'), act: 'order' };
  }
  return null;
}
