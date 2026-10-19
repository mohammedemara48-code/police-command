/**
 * The driver's own temper (pure, unit-tested). Each trip rolls a mood: some trips he's fed up (traffic,
 * haggling, potholes, people cutting him off), some trips he's in good spirits and cracks jokes.
 * Events pick a line in that mood. Lines are street dialect, never obscene.
 */
export type DriverMood = 'angry' | 'witty';
export type DriverEvent = 'jam' | 'board' | 'honk' | 'bump' | 'paid' | 'cutoff';

export const DRIVER_LINES: Record<DriverMood, Record<DriverEvent, readonly string[]>> = {
  angry: {
    jam: [
      'هو الطريق ده اتقفل ولا إيه؟! من الصبح واقفين',
      'زحمة إيه دي! هو البلد كلها نازلة النهارده؟',
      'يا ساتر.. ساعة عشان أعدّي إشارة واحدة',
      'أنا لو كنت ماشي على رجلي كنت وصلت'
    ],
    board: ['اركب بسرعة يا أستاذ ورانا طابور', 'يلا يلا، مش هنقضي اليوم هنا', 'خش جوه، والفكة جاهزة لو سمحت'],
    honk: ['ما توسع يا عم! هو أنا هطير؟', 'إنت نايم ولا إيه يا اسطى؟ اتحرك!', 'يا عم الطريق مش ملك أبوك!'],
    bump: [
      'المطب ده مين اللي حطه؟ إلهي يتعب زي ما تعبنا',
      'العفشة راحت.. الحفر دي هتخرب بيتي',
      'يا دي الحفر! ده شارع ولا ترعة؟'
    ],
    paid: ['الفكة يا أستاذ، ماعيش بقى', 'خلاص.. الأجرة دي بالعافية والله', 'كده بالظبط، من غير فصال'],
    cutoff: ['إيه ده! بتكسر عليّ كده ليه؟', 'ده سواق ده ولا بيلعب أتاري؟', 'حاسب يا عم، ده ميكروباص مش لعبة']
  },
  witty: {
    jam: [
      'الزحمة دي نعمة، بتخلّي الواحد يتأمل',
      'هنوصل بالسلامة.. السنة الجاية إن شاء الله',
      'شغّلوا أم كلثوم بقى، الوقفة دي طويلة',
      'لو الزحمة دي فلوس كنا كلنا مليونيرات'
    ],
    board: ['اتفضل يا باشا، الكرسي ده مكيّف طبيعي', 'نوّرت العربية يا كبير', 'أهلاً أهلاً، دي مش عربية، دي طيارة أرضي'],
    honk: ['بيب بيب.. سلام عليكم يا جماعة', 'الكلاكس ده عشان أسلّم بس والله', 'وسّع يا حبيبي، العروسة جاية'],
    bump: ['ده مش مطب، ده تدليك ببلاش', 'اربطوا الأحزمة، داخلين على مطبات جوية', 'المطب ده بيسلّم عليكم'],
    paid: ['تسلم إيدك، ربنا يكتّر خيرك', 'الحمد لله.. كده الشاي عليّا النهارده', 'شكراً يا باشا، وصلنا بالسلامة'],
    cutoff: ['ماشي يا عم السريع، روح الله يسهّلك', 'عدّي يا حبيبي، إحنا مش مستعجلين', 'شكله متأخر على فرحه']
  }
};

/** Roll the mood for a new trip (about 45% fed up). */
export function rollMood(rnd: () => number = Math.random): DriverMood {
  return rnd() < 0.45 ? 'angry' : 'witty';
}

/** A line for this event in this mood, avoiding the one just said. */
export function driverLine(mood: DriverMood, ev: DriverEvent, last?: string, rnd: () => number = Math.random): string {
  const lines = DRIVER_LINES[mood][ev];
  let i = Math.min(lines.length - 1, Math.floor(rnd() * lines.length));
  if (lines.length > 1 && lines[i] === last) i = (i + 1) % lines.length;
  return lines[i]!;
}

/** Seconds stuck (crawling while in the car) before the driver grumbles about the jam. */
export const JAM_SECONDS = 7;
/** Advance the jam timer; true when it's time for a jam line (then it resets). */
export function jamTick(t: number, speed: number, dt: number): { t: number; fire: boolean } {
  const nt = Math.abs(speed) < 1 ? t + dt : 0;
  return nt >= JAM_SECONDS ? { t: -20, fire: true } : { t: nt, fire: false };
}
