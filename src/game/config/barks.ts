/**
 * Street barks: short Egyptian-Arabic one-liners for small moments of the patrol.
 * Every situation keeps only a few variants on purpose; they surface at most once per cooldown window,
 * so seeing the same one again feels like a running joke rather than noise.
 * `{V}` is swapped for a vocative (يا أسطى / يا عم / يا باشا) when the line is picked.
 */

export type VoiceId = 'mona' | 'yasser' | 'driver' | 'passerby' | 'vendor' | 'microbus' | 'ahwa' | 'suspect' | 'patrol';

export interface Voice {
  /** label shown on the bubble */
  name: string;
  icon: string;
  color: string;
}

export const VOICES: Record<VoiceId, Voice> = {
  mona: { name: 'الرقيب منى', icon: '📻', color: '#3aa0ff' },
  yasser: { name: 'ياسر', icon: '📻', color: '#7dff9a' },
  driver: { name: 'سواق', icon: '🚗', color: '#ffb347' },
  passerby: { name: 'ماشي في الشارع', icon: '🚶', color: '#cfd8e6' },
  vendor: { name: 'بائع', icon: '🛒', color: '#f4d35e' },
  microbus: { name: 'سواق ميكروباص', icon: '🚐', color: '#ffe08a' },
  ahwa: { name: 'زبون القهوة', icon: '☕', color: '#d9b48f' },
  suspect: { name: 'المشتبه به', icon: '🕶', color: '#ff6b81' },
  patrol: { name: 'الدورية', icon: '🚓', color: '#9ec9ff' }
};

export interface BarkSituation {
  voice: VoiceId;
  lines: readonly string[];
  /** seconds before this situation can speak again (default: BARK_COOLDOWN) */
  cooldown?: number;
}

/** Vocatives the player is called by. */
export const VOCATIVES = ['يا أسطى', 'يا عم', 'يا باشا'] as const;

export const BARKS = {
  // ---- driving
  nearMissCar: {
    voice: 'driver',
    lines: ['عدّت بشعرة {V}', 'قلبي وقع في رجلي', 'الحمد لله على السلامة', 'ده إحنا كنا هنتعرف']
  },
  nearMissPed: {
    voice: 'passerby',
    lines: ['إيدك على الفرامل {V}', 'الرصيف ده بتاعي!', 'كنت رايح أجيب عيش', 'على مهلك، الحياة حلوة']
  },
  crashLight: {
    voice: 'driver',
    lines: ['خير اللهم اجعله خير', 'ولا يهمك، حاجة بسيطة', 'إحنا بنسلّم بس', 'سلامات {V}']
  },
  crashHeavy: {
    voice: 'yasser',
    lines: ['دي كانت مكتوبة {V}', 'الحمد لله إنه صاج', 'هنقعد أسبوع في الورشة', 'منى مش هتبقى مبسوطة']
  },
  trafficYields: {
    voice: 'driver',
    lines: ['اتفضل يا باشا', 'وسّعنا أهو', 'حاضر حاضر، ركنت', 'مفيش مخالفة المرة دي؟']
  },
  speederCaught: {
    voice: 'driver',
    lines: ['كان العداد بيهزر', 'ده أنا لسه ماشي ببطء', 'العربية هي اللي جرّتني', 'أول مرة والله {V}']
  },

  // ---- suspects
  suspectSurrender: {
    voice: 'suspect',
    lines: ['خلاص خلاص، أنا معاك', 'إيدي أهي {V}', 'كفاية جري بقى', 'هسلّم نفسي، مش مستاهلة']
  },
  suspectRuns: {
    voice: 'yasser',
    lines: ['طلع فيها نفس {V}', 'ده بيجري ولا بيطير؟', 'اجري وراه {V}']
  },
  suspectEscapes: {
    voice: 'mona',
    lines: ['راحت علينا {V}', 'هنكتبها: اختفى فجأة', 'الأسفلت بلعها', 'نلحقه المرة الجاية']
  },
  cuffing: {
    voice: 'suspect',
    lines: ['الكلبش ضيق شوية', 'براحة على إيدي', 'اتكلبش بالسلامة', 'أنا مش بتاع مشاكل']
  },

  // ---- gun
  shotFired: {
    voice: 'passerby',
    lines: ['إيه الدوشة دي؟', 'اتفضلوا جوه كلكم!', 'طلقة واحدة وكفاية {V}', 'قفلنا المحل خلاص']
  },
  reload: {
    voice: 'yasser',
    lines: ['عمّر وأنا واقف', 'المخزن فاضي {V}', 'ثواني بس يا بطل']
  },
  outOfAmmo: {
    voice: 'mona',
    lines: ['الاحتياطي خلص {V}', 'دوّر على صندوق ذخيرة', 'هنتفاهم بالكلام بقى']
  },
  lowHealth: {
    voice: 'mona',
    lines: ['صحتك تعبانة {V}', 'دي مش وقت بطولات', 'اتحامى يا باشا وخد نفس', 'ماتنساش السترة يا أسطى']
  },
  backupCalled: {
    voice: 'mona',
    lines: ['الدعم في السكة {V}', 'الدعم لسه بيدوّر على ركنة', 'الدعم قال خمس دقايق']
  },

  // ---- mission end
  missionComplete: {
    voice: 'mona',
    lines: ['شغل نضيف {V}', 'الشاي عليّا النهارده', 'القسم فخور بيك يا باشا', 'التقرير هيطلع جميل']
  },
  missionFailed: {
    voice: 'mona',
    lines: ['معلش يا باشا، فيها جولة', 'نفسنا طويل يا باشا', 'هنقول ظروف جوية', 'اشرب ميّة وارجع']
  },
  rankUp: {
    voice: 'mona',
    lines: ['مبروك الرتبة يا باشا', 'النجمة دي تليق بيك', 'رتبة جديدة، شاي جديد', 'هتحتاج بدلة أكبر']
  },

  // ---- people on the street
  pedGreet: {
    voice: 'passerby',
    lines: ['صباح الفل يا باشا', 'منوّر الحتة {V}', 'ربنا يحميك يا باشا', 'تحية للبدلة دي']
  },
  pedScared: {
    voice: 'passerby',
    lines: ['يا خبر! رايحين فين؟', 'استرها معانا يا رب', 'أنا ماليش دعوة والله', 'اقفل الشباك يا ولد']
  },
  gossipVendor: {
    voice: 'vendor',
    lines: ['الظابط ده شكله جاد', 'ده بيطلع بدري كل يوم', 'الدورية دي نضيفة أوي', 'درة مشوي يا باشا؟']
  },
  gossipMicrobus: {
    voice: 'microbus',
    lines: ['كرسي واحد وماشيين', 'اللي نازل ينزل بسرعة', 'ما تضيّقش عليا {V}', 'الدورية معانا ببلاش']
  },
  gossipAhwa: {
    voice: 'ahwa',
    lines: ['واحد شاي للباشا', 'الدور عليك في الدومينو', 'اتفضل اقعد يا باشا', 'الأهلي ولا الزمالك؟']
  },

  // ---- dispatcher
  monaQuip: {
    voice: 'mona',
    lines: ['منى معاك، لو لسه صاحي', 'الدنيا هادية، مش عاجبني', 'الشاي بردان على مكتبي', 'حد شاف قلمي؟']
  },

  // ---- district landmarks (spoken once when the officer enters the district)
  landmarkSuburb: {
    voice: 'passerby',
    lines: ['الأهرامات بتبص عليك', 'سلّم على خوفو {V}', 'الجمل هنا له أولوية', 'شارع الهرم صاحي دايمًا']
  },
  landmarkDowntown: {
    voice: 'passerby',
    lines: ['كل عمارة ليها حكاية', 'التحرير على بعد خطوتين', 'الكشري هنا أسطوري', 'ركنة هنا محتاجة معجزة']
  },
  landmarkPort: {
    voice: 'passerby',
    lines: ['شبرا ما بتنامش', 'طعمية سخنة على الناصية', 'زحمة شبرا ليها بركة', 'حاسب من التوك توك']
  },
  landmarkCorniche: {
    voice: 'passerby',
    lines: ['هوا النيل يا باشا', 'الدقي هادي… ظاهريًا', 'ميدان الدقي بيلفّ بيك', 'الكورنيش بيصلّح المزاج']
  }
} as const satisfies Record<string, BarkSituation>;

export type BarkId = keyof typeof BARKS;

/** District id (StreetPlace.id) to its landmark situation. */
export const LANDMARK_BARK: Record<string, BarkId> = {
  suburb: 'landmarkSuburb',
  downtown: 'landmarkDowntown',
  port: 'landmarkPort',
  corniche: 'landmarkCorniche'
};

/** What the patrol car "says" about its own condition, by damage taken (percent, upper bound inclusive). */
export const DAMAGE_WORDS: readonly { upTo: number; word: string }[] = [
  { upTo: 10, word: 'لسه بتلمع' },
  { upTo: 30, word: 'عليها علامة' },
  { upTo: 55, word: 'شغالة بالنية' },
  { upTo: 80, word: 'بتتنفس بالعافية' },
  { upTo: 99, word: 'على آخر نفس' },
  { upTo: 100, word: 'مشروع سكراب' }
];

/** Rear-window slogans painted on the patrol car and on the microbuses (picked at spawn, no per-frame cost). */
export const STICKERS = {
  patrol: [
    'الشاي في الجيب',
    'تكييف؟ بالأمل',
    'ماشي بالنية',
    'بلاغ تاني؟ استنى',
    'بطّل تزمّر',
    'الخدمة أولًا والركنة ثانيًا'
  ],
  microbus: [
    'الراكب ملك والباقي زحمة',
    'على قد الفلوس',
    'من عرق جبيني',
    'النية الطيبة وقود',
    'الرزق على الله والرصيف',
    'خط الفرحة',
    'ما تستعجلش الرزق',
    'اللي مش راكب يتفرج',
    'ركّاب بس، من غير شرح',
    'الونس أهم من الكرسي'
  ]
} as const;
