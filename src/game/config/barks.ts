/**
 * Street talk. The humour belongs to ordinary people on the street, never to the radio or the officer:
 * every situation names who may say it (a pedestrian, a vendor, an ahwa customer, a microbus driver...) and the
 * line appears as a bubble above that person. Each situation keeps a handful of variants and a cooldown, so a
 * line returning is a running joke, not noise. `{V}` becomes a vocative (يا أسطى / يا عم / يا باشا).
 * The radio has its own short, professional lines in RADIO.
 */

export type VoiceId =
  | 'pedestrian'
  | 'woman'
  | 'elder'
  | 'kid'
  | 'student'
  | 'vendor'
  | 'shopkeeper'
  | 'ahwa'
  | 'microbus'
  | 'taxi'
  | 'driver';

export interface Voice {
  /** label on the bubble */
  name: string;
  icon: string;
  color: string;
}

export const VOICES: Record<VoiceId, Voice> = {
  pedestrian: { name: 'ماشي في الشارع', icon: '🚶', color: '#cfd8e6' },
  woman: { name: 'واحدة ماشية', icon: '🚶‍♀️', color: '#f4b6d2' },
  elder: { name: 'راجل كبير', icon: '👴', color: '#d9c9a3' },
  kid: { name: 'ولد صغير', icon: '🧒', color: '#9be7ff' },
  student: { name: 'طالب', icon: '🎒', color: '#b6f09c' },
  vendor: { name: 'بائع', icon: '🛒', color: '#f4d35e' },
  shopkeeper: { name: 'صاحب محل', icon: '🏪', color: '#ffb36b' },
  ahwa: { name: 'زبون القهوة', icon: '☕', color: '#d9b48f' },
  microbus: { name: 'سواق ميكروباص', icon: '🚐', color: '#ffe08a' },
  taxi: { name: 'سواق تاكسي', icon: '🚕', color: '#fff2a8' },
  driver: { name: 'سواق', icon: '🚗', color: '#ffb347' }
};

/** People standing or walking on the pavement. */
export const ON_FOOT: readonly VoiceId[] = [
  'pedestrian',
  'woman',
  'elder',
  'kid',
  'student',
  'vendor',
  'shopkeeper',
  'ahwa'
];
/** Drivers of the cars in traffic. */
export const DRIVERS: readonly VoiceId[] = ['driver', 'taxi', 'microbus'];
export const ANYONE: readonly VoiceId[] = [...ON_FOOT, ...DRIVERS];

export interface BarkSituation {
  /** who may say it, in the order they are preferred */
  who: readonly VoiceId[];
  lines: readonly string[];
  /** seconds before this situation can speak again (default: BARK_COOLDOWN) */
  cooldown?: number;
}

/** Vocatives the officer is called by. */
export const VOCATIVES = ['يا أسطى', 'يا عم', 'يا باشا'] as const;

export const BARKS = {
  // ---- the officer in uniform
  officerPasses: {
    who: ON_FOOT,
    lines: [
      'ربنا يحميكم يا باشا',
      'الشارع منوّر بحضرتك',
      'الشاي موجود لو تحب {V}',
      'شكلك بتدوّر على حد',
      'ماتروحش بعيد {V}',
      'البدلة مكوية على الآخر',
      'الأمان مع وجودكم يا باشا',
      'صباح الخير يا حضرة الظابط'
    ]
  },
  sirenOn: {
    who: ANYONE,
    lines: [
      'خير يا رب، فيه إيه؟',
      'السرينة قطعت عليّا الشاي',
      'فيه حاجة حصلت ولا إيه؟',
      'وسّعوا للدورية يا جماعة',
      'السرينة دي معناها جد',
      'الله يستر على اللي بيجري',
      'نادوا العيال من الشارع'
    ]
  },
  trafficYields: {
    who: DRIVERS,
    lines: [
      'اتفضل يا باشا، الطريق ليك',
      'وسّعت أهو، عدّي',
      'ركنت على جنب، اتفضل',
      'السرينة معناها نوسّع',
      'شغلك أهم من طريقي',
      'عدّي يا باشا، ربنا معاك',
      'ركنت ومفيش داعي للعجلة'
    ]
  },
  chaseNear: {
    who: ON_FOOT,
    lines: [
      'بيجري ورا مين ده؟',
      'الحقه يا باشا!',
      'مطاردة في شارعنا؟ يا نهار',
      'ورا العربية السودا دي',
      'ربنا يستر على الأولاد',
      'سيبوا الشارع للدورية',
      'ده فيلم أكشن ولا إيه؟'
    ]
  },

  // ---- gunfire, arrests
  shotFired: {
    who: ON_FOOT,
    lines: [
      'قفلنا المحل خلاص',
      'استخبّوا يا ولاد!',
      'اللهم احفظنا',
      'ده صوت طلق ناري!',
      'ادخلوا جوه بسرعة',
      'الله يستر على الشارع',
      'نزّلوا الكراسي وادخلوا'
    ]
  },
  pedScared: {
    who: ON_FOOT,
    lines: [
      'يا خبر، إحنا هنا!',
      'اجري يا ولد!',
      'استرها يا رب',
      'ماليش دعوة والله',
      'الشارع مش آمن دلوقتي',
      'خدوا الأطفال جوه',
      'كنت رايح أشتري عيش بس'
    ]
  },
  cuffing: {
    who: ON_FOOT,
    lines: [
      'اتمسك الحمد لله',
      'أخيرًا حد مسكه',
      'ده اللي كان بيعمل الدوشة',
      'ربنا يقويك يا باشا',
      'الشارع هيرتاح',
      'شفت يا ولد؟ العدل موجود',
      'اتكلبش وخلصنا'
    ]
  },
  suspectSurrender: {
    who: ON_FOOT,
    lines: [
      'استسلم خلاص، يا فرحتي',
      'رفع إيده بسهولة كده؟',
      'الأحسن له إنه سلّم نفسه',
      'بدري عليه الجري ده',
      'عاقل لمّا سلّم',
      'ما كانش يستاهل المطاردة',
      'شفت الهدوء بيعمل إيه؟'
    ]
  },
  suspectRuns: {
    who: ON_FOOT,
    lines: [
      'هرب! الحقه يا باشا',
      'بيجري زي الريح',
      'ده هيعدّي السور',
      'خد الشارع الجاي!',
      'رجله سابقة عربيته',
      'اجري وراه ربنا معاك',
      'ده لسه واخد نفسه'
    ]
  },
  suspectEscapes: {
    who: ON_FOOT,
    lines: [
      'راح فين الله أعلم',
      'الأسفلت بلعه',
      'اختفى وما حدّش شافه',
      'الزحمة هي اللي ساعدته',
      'المرة الجاية هتمسكه',
      'العربية دي طارت',
      'لفّ من الشارع الخلفي'
    ]
  },
  speederCaught: {
    who: ON_FOOT,
    lines: [
      'اتمسك المتهوّر ده أخيرًا',
      'ده كان طاير مش ماشي',
      'السرعة دي قدّام المدرسة؟',
      'الحمد لله الشارع هيهدى',
      'مخالفة يستاهلها',
      'ده كان هيدوس على حد',
      'ريّح الشارع يا باشا'
    ]
  },

  // ---- driving around people and cars
  nearMissCar: {
    who: DRIVERS,
    lines: [
      'عدّت بشعرة يا باشا',
      'ماشي بسرعة ورا مين؟',
      'قلبي وقع في رجلي',
      'بالراحة، الشارع مش لوحدك',
      'نص متر كمان ونتعرف',
      'الحمد لله إني سايق براحة',
      'خدت بالي في آخر لحظة'
    ]
  },
  nearMissPed: {
    who: ON_FOOT,
    lines: [
      'إيدك على الفرامل {V}',
      'الرصيف ده بتاعي',
      'كنت رايح أجيب عيش',
      'على مهلك، فيه ناس',
      'قلبي يا باشا!',
      'ما تخضّش الناس كده',
      'الحياة حلوة بالراحة'
    ]
  },
  crashLight: {
    who: ANYONE,
    lines: [
      'حصل خير، ولا يهمك',
      'الحمد لله ملحقش',
      'خبطة خفيفة، ربنا ستر',
      'بالراحة شوية يا باشا',
      'معلش، الطريق ضيق',
      'حد يشوف الصاج',
      'عادي، ده زحمة الشارع'
    ]
  },
  crashHeavy: {
    who: ANYONE,
    lines: [
      'لا إله إلا الله',
      'الحمد لله مفيش مصاب',
      'اتصلوا بالمرور يا جماعة',
      'قول يا رب سلّم',
      'الشارع وقف كله',
      'الصوت سمّع الحارة كلها',
      'ده عايز ورشة مش دعاء'
    ]
  },
  parkedBadly: {
    who: ANYONE,
    lines: [
      'الدورية واقفة في نص الناصية',
      'الركنة دي محتاجة مهندس',
      'مفيش مكان للميكروباص بسببها',
      'يا باشا، الرصيف ليه ناسه',
      'وسّع الناصية شوية يا باشا',
      'فيه عربية عايزة تعدّي',
      'الركنة دي هتعمل طابور',
      'ركّن على جنب لو سمحت'
    ]
  },

  // ---- districts: said when the officer enters, and now and then while they are there
  landmarkSuburb: {
    who: ON_FOOT,
    lines: [
      'الأهرامات في آخر الشارع أهي',
      'السياح جايين على الجمال',
      'شارع الهرم ما بينامش',
      'نص الميكروباصات رايحة الهرم',
      'الطريق ده بيوصّل لخوفو',
      'شارع فيصل زحمة النهارده',
      'الجمل هنا له أولوية',
      'الدائري قريب من هنا'
    ]
  },
  landmarkDowntown: {
    who: ON_FOOT,
    lines: [
      'طلعت حرب بيوصّل للتحرير',
      'عمارات وسط البلد ليها حكاية',
      'الكشري هنا على أصوله',
      'ركنة في وسط البلد معجزة',
      'ميدان التحرير قريب خطوتين',
      'القهاوي القديمة لسه مكانها',
      'الشارع ده كل الناس بتعدّي منه',
      'الشرفات دي أقدم مني'
    ]
  },
  landmarkPort: {
    who: ON_FOOT,
    lines: [
      'شبرا ما بتنامش',
      'الشجر ده أقدم من العمارات',
      'الطعمية السخنة على الناصية',
      'زحمة شبرا ليها بركة',
      'الخلفاوي زحمة بعد العصر',
      'شبرا فيها كل الناس',
      'ماتحاولش تعدّي الشارع بسرعة',
      'ده شارع شبرا يا باشا'
    ]
  },
  landmarkCorniche: {
    who: ON_FOOT,
    lines: [
      'ميدان الدقي بيلفّ بيك',
      'هوا النيل حلو من هنا',
      'شارع المساحة قدامك على طول',
      'الكورنيش بيصلّح المزاج',
      'الدقي هادية وبتتغير بالليل',
      'الكوبري قريب والنيل بعده',
      'ناس الدقي بتحب الكورنيش',
      'الأتوبيس هنا بيتأخر دايمًا'
    ]
  },
  nileView: {
    who: ON_FOOT,
    lines: [
      'الله على النيل في الغروب',
      'هوا النيل بيصلّح المزاج',
      'مية النيل ما بتتعبش',
      'الفلوكة هناك بتسعد',
      'الكورنيش هو الصيف كله',
      'مفيش أحلى من قعدة جنب النيل',
      'النيل شايف كل حاجة'
    ]
  },
  bridgeCrossing: {
    who: [...DRIVERS, ...ON_FOOT],
    lines: [
      'كوبري قصر النيل والأسود واقفة',
      'الأسود بتحرس الكوبري من زمان',
      'النيل من تحت والزحمة من فوق',
      'عدّي الكوبري براحة يا باشا',
      'الكوبري ده أقدم مننا كلنا',
      'ما تبصّش في المية وإنت سايق',
      'أسود الكوبري ما بتزعقش'
    ]
  },
  towerView: {
    who: ON_FOOT,
    lines: [
      'برج القاهرة قدامك أهو',
      'البرج ده أطول من أي عمارة',
      'السياح بيصوّروا البرج',
      'من فوق البرج بتشوف القاهرة كلها',
      'البرج على شكل زهرة لوتس',
      'كل ما تقرّب يبقى أكبر',
      'رمز القاهرة بعد الأهرامات'
    ]
  },

  // ---- time of day (from the in-game clock)
  timeMorning: {
    who: ON_FOOT,
    lines: [
      'صباح الفل على الشارع',
      'لسه بدري والزحمة بدأت',
      'العيش لسه سخن',
      'الشمس لسه لطيفة',
      'المدارس فتحت والشارع زحمة',
      'كباية شاي وبعدين الشغل'
    ]
  },
  timeNoon: {
    who: ON_FOOT,
    lines: [
      'الشمس نار النهارده',
      'ضل الشجر أحسن من التكييف',
      'وقت الغدا والزحمة كبرت',
      'العصير هنا بيخلص بسرعة',
      'الدنيا حر، اشرب ميّة',
      'الظهر والشارع على آخره'
    ]
  },
  timeSunset: {
    who: ON_FOOT,
    lines: [
      'المغرب قرّب والشارع زحمة',
      'الشمس بتغرب والناس بتخرج',
      'وقت الشاي بعد العصر',
      'الدنيا بتحلو في الغروب',
      'العيال نازلة تلعب',
      'الشارع بيتحول بالليل'
    ]
  },
  timeNight: {
    who: ON_FOOT,
    lines: [
      'الليل في الشارع له طعم',
      'القهوة لسه فاتحة للصبح',
      'النور هنا أحلى بالليل',
      'الساعة اتأخرت والشارع صاحي',
      'الشارع بيهدى بعد العشا',
      'خد بالك من الضلمة يا باشا'
    ]
  },

  // ---- the officer's rank
  rankLow: {
    who: ON_FOOT,
    lines: [
      'لسه في أول الطريق يا باشا',
      'كل ظابط كبير بدأ كده',
      'الرتبة هتيجي مع الشغل',
      'شكلك لسه جديد في الحتة',
      'أول يوم؟ ربنا معاك',
      'ابدأ بالشاي وبعدين بالقضايا'
    ]
  },
  rankHigh: {
    who: ON_FOOT,
    lines: [
      'ده الظابط الكبير بنفسه',
      'سمعنا عنك كتير يا باشا',
      'الحتة كلها بتتكلم عن شغلك',
      'نجوم الكتف بتلمع',
      'الأمان من يوم ما جيت',
      'حضرة الرائد نورت الشارع'
    ]
  },

  // ---- people at work
  vendorCall: {
    who: ['vendor'],
    lines: [
      'درة مشوي سخن يا باشا',
      'ترمس وحمص الشام!',
      'عصير قصب بارد',
      'شاي بالنعناع للي يعدّي',
      'بطاطا سخنة يا حلو',
      'الفل يا جماعة، الفل',
      'خيار وجرجير يا بيه'
    ]
  },
  ahwaTalk: {
    who: ['ahwa'],
    lines: [
      'واحد شاي للباشا',
      'الدور عليك في الدومينو',
      'اتفضل اقعد يا باشا',
      'الأهلي ولا الزمالك؟',
      'الشاي هنا مظبوط',
      'الطاولة النهارده من غير غش',
      'الأخبار جابت إيه؟'
    ]
  },
  shopPharmacy: {
    who: ['shopkeeper'],
    lines: [
      'صيدلية الشارع في خدمتك',
      'سلامتك يا باشا، محتاج حاجة؟',
      'الدوا عندنا والنصيحة ببلاش',
      'صيدلية بتفتح للصبح',
      'فيتامين سي يا باشا؟',
      'محتاج حاجة تانية يا باشا؟'
    ]
  },
  shopBakery: {
    who: ['shopkeeper'],
    lines: [
      'العيش لسه خارج من الفرن',
      'ريحة الفرن وصلت للناصية',
      'عيش بلدي وفينو يا باشا',
      'الطابور وراك يا جماعة',
      'جرّب الكحك الطازة',
      'العيش هنا ما بيباتش'
    ]
  },
  shopCafe: {
    who: ['shopkeeper'],
    lines: [
      'قهوة مظبوطة يا باشا؟',
      'الكافيه ده فيه واي فاي',
      'قهوة تركي ولا نسكافيه؟',
      'الكراسي برّه فاضية',
      'اتفضل استريح خمس دقايق',
      'القهوة على حسابي أول مرة'
    ]
  },
  shopSuper: {
    who: ['shopkeeper'],
    lines: [
      'السوبر ماركت فاتح على طول',
      'الأسعار هنا ما بتزعلش',
      'كل حاجة موجودة يا باشا',
      'العروض خلصت النهارده',
      'كيس ولا اتنين يا حاج؟',
      'تعالى واخد طلبك سريع'
    ]
  },
  shopRestaurant: {
    who: ['shopkeeper'],
    lines: [
      'المطعم ريحته جايبة الناس',
      'فول وطعمية على الصبح',
      'الفراخ طازة النهارده',
      'اتفضل طبق ع الحساب',
      'الأكل بيخلص قبل العشا',
      'ريحة الأكل بتنادي'
    ]
  },
  shopClothes: {
    who: ['shopkeeper'],
    lines: [
      'تخفيضات على القمصان يا باشا',
      'الأقمشة هنا مضمونة',
      'قيس وإنت مرتاح',
      'الموديل ده آخر حاجة',
      'اللون ده يليق عليك',
      'عندنا مقاسك على طول'
    ]
  },
  shopMobiles: {
    who: ['shopkeeper'],
    lines: [
      'شاحن أصلي وكفالة',
      'الموبايل ده آخر موديل',
      'بنصلّح الشاشة في ساعة',
      'جراب وإزاز حماية؟',
      'شريحة جديدة بعشر دقايق',
      'الشحن عندنا ببلاش'
    ]
  },
  shopSweets: {
    who: ['shopkeeper'],
    lines: [
      'بسبوسة سخنة يا باشا',
      'الحلو هنا بيصبّر',
      'كنافة طازة وعسل زيادة',
      'جرّب بالمكسّرات',
      'الحلويات تفتّح النفس',
      'علبة للأولاد يا باشا؟'
    ]
  },
  shopBank: {
    who: ['shopkeeper'],
    lines: [
      'البنك هيقفل بعد شوية',
      'الفرع مزدحم بعد الظهر',
      'الماكينة برّه شغالة',
      'خدمة العملاء جوّه يا باشا',
      'الطابور هنا بيمشي بالراحة',
      'المواعيد معلقة على الباب'
    ]
  },
  shopLibrary: {
    who: ['shopkeeper'],
    lines: [
      'كتب الدراسة بالخصم',
      'القلم ده بيكتب من غير ما يوقف',
      'كراسات للمدارس يا باشا',
      'لسه فيه روايات جديدة',
      'الورق هنا على قدّ الجودة',
      'الكتاب خير جليس يا باشا'
    ]
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

/** Shop sign (as painted in the street) to what its owner says at the door. */
export const SHOP_BARK: Record<string, BarkId> = {
  صيدلية: 'shopPharmacy',
  مخبز: 'shopBakery',
  كافيه: 'shopCafe',
  'سوبر ماركت': 'shopSuper',
  مطعم: 'shopRestaurant',
  ملابس: 'shopClothes',
  موبايلات: 'shopMobiles',
  حلويات: 'shopSweets',
  بنك: 'shopBank',
  مكتبة: 'shopLibrary'
};

/**
 * Talk between people of the crowd. Each line is an exchange, "first||reply": two bubbles, one after the other,
 * above two neighbours. Keyed by the kind of group.
 */
export interface Chatter {
  who: readonly [VoiceId, VoiceId];
  lines: readonly string[];
}
export const CHATTER = {
  neighbours: {
    who: ['woman', 'woman'],
    lines: [
      'شفتي أسعار الخضار؟||ما تفكّرنيش',
      'العيال امتحاناتهم قربت||ربنا يوفقهم',
      'الجو حر النهارده||بكرة هيبقى أحسن',
      'جارتنا اتخطبت||مبروك! عقبال عندنا',
      'السوق زحمة أوي||وعلى الآخر برضه',
      'وصفة المحشي اللي قلتلك؟||هجرّبها الجمعة'
    ]
  },
  ahwaPals: {
    who: ['ahwa', 'ahwa'],
    lines: [
      'الأهلي هيكسب النهارده||ده كلام عيال',
      'الدور على مين في الدومينو؟||عليك يا معلم',
      'الشاي ده تقيل||قول لعم محمود',
      'سمعت الأخبار؟||ولا حاجة جديدة',
      'الدنيا غلت أوي||بس الشاي لسه طعمه حلو',
      'تعالى نلعب طاولة||بس من غير غش'
    ]
  },
  shopTalk: {
    who: ['shopkeeper', 'pedestrian'],
    lines: [
      'ازيك يا حاج؟||الحمد لله على كل حال',
      'الشغل ماشي؟||يوم حلو ويوم ساكت',
      'تعالى شوف الجديد||بعدين يا معلم',
      'الدنيا زحمة النهارده||زحمة وبركة',
      'عايز حاجة يا أستاذ؟||بس بسأل على الشارع',
      'مرّ عليّا بعد العصر||إن شاء الله'
    ]
  },
  kids: {
    who: ['kid', 'kid'],
    lines: [
      'هنلعب كورة؟||لا بعد المذاكرة',
      'شفت العربية دي؟||دي الدورية يا عم',
      'معاك فلوس نشتري شيبسي؟||معايا جنيه بس',
      'أنا هبقى ظابط||وأنا هبقى طيّار',
      'ماما بتنادي||دقيقة واحدة',
      'سبقتك للناصية||لا، أنا اللي سبقت'
    ]
  },
  elders: {
    who: ['elder', 'elder'],
    lines: [
      'الشارع ده كان أهدى زمان||كل حاجة اتغيرت',
      'فاكر المرة اللي هنا؟||طبعًا، من أربعين سنة',
      'الشباب النهارده عجيب||بس قلبهم طيب',
      'الجو ده بيوجع الركب||قول لي أنا',
      'كوباية شاي ونقعد||الشاي بالنعناع',
      'الحمد لله على كل حاجة||ونعمة بالله'
    ]
  },
  students: {
    who: ['student', 'student'],
    lines: [
      'ذاكرت الامتحان؟||نص المنهج بس',
      'المحاضرة بدأت؟||لسه، استنى',
      'هنقعد على القهوة؟||بعد المحاضرة',
      'شفت الجدول الجديد؟||كله امتحانات',
      'معاك شاحن؟||لا، بطاريتي خلصت',
      'هتروح الكلية إزاي؟||ميكروباص وبعدين مشي'
    ]
  }
} as const satisfies Record<string, Chatter>;

export type ChatterId = keyof typeof CHATTER;

/**
 * Official radio lines. Short, professional, never funny: the dispatcher reports and instructs.
 */
export interface RadioSituation {
  lines: readonly string[];
  cooldown?: number;
}
export const RADIO = {
  lowHealth: {
    lines: ['صحتك منخفضة. احتمي واستخدم السترة.', 'حالتك الصحية حرجة. ابتعد عن مصدر النيران.']
  },
  backupCalled: {
    lines: ['تم طلب الدعم. تحرك بحذر.', 'الدعم في الطريق. حافظ على موقعك.']
  },
  outOfAmmo: {
    lines: ['الذخيرة نفدت. ابحث عن صندوق ذخيرة.', 'لا توجد ذخيرة احتياطية. اتجه لأقرب صندوق.']
  },
  suspectEscapes: {
    lines: ['فقدنا الهدف. سيتم تعميم البيانات.', 'المشتبه به غادر المنطقة. أبلغ مركز العمليات.']
  },
  missionComplete: {
    lines: ['تم إنجاز البلاغ. عمل ممتاز.', 'تم تأمين الموقف. العودة للتمركز.']
  },
  missionFailed: {
    lines: ['لم يتم إنجاز البلاغ. أعد المحاولة.', 'البلاغ لم يكتمل. سيتم تقييم الموقف.']
  },
  rankUp: {
    lines: ['تهانينا. تمت ترقيتك.', 'صدر قرار ترقيتك. تابع الخدمة.']
  }
} as const satisfies Record<string, RadioSituation>;

export type RadioId = keyof typeof RADIO;

/** The patrol car's condition by damage taken (percent, upper bound inclusive). Plain wording, no jokes. */
export const DAMAGE_WORDS: readonly { upTo: number; word: string }[] = [
  { upTo: 10, word: 'سليمة' },
  { upTo: 30, word: 'ضرر طفيف' },
  { upTo: 55, word: 'ضرر متوسط' },
  { upTo: 80, word: 'ضرر كبير' },
  { upTo: 99, word: 'ضرر شديد' },
  { upTo: 100, word: 'غير صالحة للسير' }
];

/** Official markings on the patrol car: rear plate, and the emergency number printed on Egyptian patrol cars. */
export const PATROL_MARKINGS = { rear: 'النجدة 122', rearTop: 'شرطة' } as const;

/** Rear-window slogans painted on the microbuses (picked at spawn, no per-frame cost). */
export const STICKERS = {
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
