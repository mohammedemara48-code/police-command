/**
 * Story cutscene scripts: an intro before each campaign mission and a short outro after it is won.
 *
 * Adding one: write a CutsceneDef (shots + lines) and put it under the mission id in STORY_CUTSCENES.
 * - `shots` are camera rails in a local frame (see src/game/logic/cutscene.ts). The presets below cover
 *   most needs; pass overrides for a custom move.
 * - each line can switch to a shot by index (`shot`); lines without one keep the current camera.
 * - `text` is Egyptian Arabic, `en` is the English version used when the page is in English.
 */
import type { ShotDef } from '../game/logic/cutscene';
import type { Speaker } from './speakers';

export interface CutLine {
  who: Speaker;
  text: string;
  en: string;
  shot?: number;
}

export interface CutsceneDef {
  id: string;
  shots: ShotDef[];
  lines: CutLine[];
}

export interface StoryScenes {
  intro?: CutsceneDef;
  outro?: CutsceneDef;
}

// ---------------- shot presets ----------------
// scene frame: origin at the mission spot, forward = from the officer's start towards it (so -z is the near side).
// hero frame: the officer (or the patrol car while he's driving), forward = where he faces.

/** high establishing pass over the mission district */
const aerial = (o: Partial<ShotDef> = {}): ShotDef => ({
  anchor: 'scene',
  from: [-18, 30, -46],
  to: [10, 21, -30],
  look: [0, 2, 0],
  lookTo: [0, 1, 6],
  dur: 7,
  ...o
});
/** slow sideways crane around the spot itself, roof height */
const sceneOrbit = (o: Partial<ShotDef> = {}): ShotDef => ({
  anchor: 'scene',
  from: [-5, 10, -16],
  to: [5, 8, -14],
  look: [0, 1.5, 2],
  dur: 7,
  ...o
});
/** creeping street-level push down the avenue towards the spot */
const streetLevel = (o: Partial<ShotDef> = {}): ShotDef => ({
  anchor: 'scene',
  from: [3.4, 2.4, -26],
  to: [2.2, 1.9, -14],
  look: [0, 1.6, 0],
  lookTo: [0, 1.5, 2],
  dur: 6,
  blend: 0.8,
  ...o
});
/** close-up of the officer's face */
const officerFace = (o: Partial<ShotDef> = {}): ShotDef => ({
  anchor: 'hero',
  from: [1.5, 1.75, 2.7],
  to: [0.9, 1.7, 2.0],
  look: [0, 1.6, 0],
  dur: 5,
  fov: 40,
  ...o
});
/** low front three-quarter on the patrol car */
const carHero = (o: Partial<ShotDef> = {}): ShotDef => ({
  anchor: 'car',
  from: [-3.8, 0.9, 5.4],
  to: [-2.6, 1.1, 3.8],
  look: [0, 0.9, 0],
  dur: 5,
  fov: 42,
  ...o
});
/** outro: wide slide past the officer at the scene */
const heroWide = (o: Partial<ShotDef> = {}): ShotDef => ({
  anchor: 'hero',
  from: [-4.5, 2.6, 5],
  to: [4, 3.2, 5.5],
  look: [0, 1.2, 0],
  dur: 6,
  ...o
});
/** outro: crane up and away from the officer */
const craneUp = (o: Partial<ShotDef> = {}): ShotDef => ({
  anchor: 'hero',
  from: [0.5, 2.4, 4.5],
  to: [0, 15, 10],
  look: [0, 1.2, 0],
  lookTo: [0, 0.4, 0],
  dur: 7,
  blend: 1,
  ...o
});

// ---------------- scripts ----------------
export const STORY_CUTSCENES: Record<number, StoryScenes> = {
  1: {
    intro: {
      id: 'm1-intro',
      shots: [aerial(), officerFace(), carHero()],
      lines: [
        { who: 'narrator', shot: 0, text: 'وسط البلد — أول يوم شغل.', en: 'Downtown — first day on the job.' },
        {
          who: 'hamed',
          text: 'دي المدينة يا ياسر. من فوق شكلها هادية… بس العقرب عامل فيها اللي هو عايزه.',
          en: 'That’s the city, Yasser. Looks calm from up here… but the Scorpion does whatever he wants in it.'
        },
        {
          who: 'yasser',
          shot: 1,
          text: 'أنا جاهز يا فندم. اتعلمت كل حاجة في الكلية.',
          en: 'I’m ready, sir. I learned everything at the academy.'
        },
        {
          who: 'hamed',
          text: 'الشارع مش زي الكلية. عينك مفتوحة، وإيدك جنب اللاسلكي.',
          en: 'The street isn’t the academy. Eyes open, hand near the radio.'
        },
        {
          who: 'hamed',
          shot: 2,
          text: 'دي الدورية بتاعتك. منى هتكلمك على اللاسلكي. يلا.',
          en: 'That’s your patrol car. Mona will call you on the radio. Go.'
        }
      ]
    },
    outro: {
      id: 'm1-outro',
      shots: [heroWide(), craneUp()],
      lines: [
        {
          who: 'mona',
          shot: 0,
          text: 'شغل نضيف يا ياسر. ده أول واحد.',
          en: 'Clean work, Yasser. That’s your first one.'
        },
        {
          who: 'hamed',
          shot: 1,
          text: 'أول واحد بس. العقرب لسه قدامنا.',
          en: 'Only the first. The Scorpion is still out there.'
        }
      ]
    }
  },
  2: {
    intro: {
      id: 'm2-intro',
      shots: [aerial(), streetLevel(), officerFace()],
      lines: [
        { who: 'narrator', shot: 0, text: 'الكورنيش — محل دهب.', en: 'The Corniche — a gold shop.' },
        {
          who: 'suspect',
          shot: 1,
          text: 'بسرعة يا ابني! شيل الدهب واجري قبل ما البوليس ييجي!',
          en: 'Hurry up! Grab the gold and run before the cops get here!'
        },
        {
          who: 'yasser',
          shot: 2,
          text: 'اتنين… وواحد شكله هيجري. مش هسيبه.',
          en: 'Two of them… and one looks like a runner. He’s not getting away.'
        }
      ]
    },
    outro: {
      id: 'm2-outro',
      shots: [heroWide()],
      lines: [
        {
          who: 'hamed',
          shot: 0,
          text: 'النقيب حامد معاك. الاتنين بيشتغلوا للعقرب.',
          en: 'Captain Hamed here. Both of them work for the Scorpion.'
        },
        {
          who: 'hamed',
          text: 'كمّل كده يا ياسر، اسمك بدأ يتسمع في القسم.',
          en: 'Keep it up, Yasser. The precinct is starting to know your name.'
        }
      ]
    }
  },
  3: {
    intro: {
      id: 'm3-intro',
      shots: [aerial(), streetLevel(), carHero()],
      lines: [
        { who: 'narrator', shot: 0, text: 'الميناء — بوابة ٣.', en: 'The port — Gate 3.' },
        {
          who: 'suspect',
          shot: 1,
          text: 'العربية دي لازم تطلع من البوابة النهارده. أي حد يقف قدامك… دوس.',
          en: 'This car leaves the gate today. Anyone gets in your way… floor it.'
        },
        {
          who: 'yasser',
          shot: 2,
          text: 'اربط الحزام يا ياسر. دي أول مطاردة.',
          en: 'Buckle up, Yasser. Your first chase.'
        }
      ]
    },
    outro: {
      id: 'm3-outro',
      shots: [heroWide(), craneUp()],
      lines: [
        { who: 'suspect', shot: 0, text: 'خلاص خلاص! أنا مجرد سواق…', en: 'Okay, okay! I’m just the driver…' },
        {
          who: 'suspect',
          text: 'الشحنة في الحاويات! والله ما ليا دعوة!',
          en: 'The cargo is in the containers! I swear it’s not mine!'
        },
        { who: 'yasser', shot: 1, text: 'الكلام ده تقوله في القسم.', en: 'Save it for the station.' }
      ]
    }
  },
  4: {
    intro: {
      id: 'm4-intro',
      shots: [sceneOrbit(), streetLevel(), officerFace()],
      lines: [
        { who: 'narrator', shot: 0, text: 'الميناء — ساحة الحاويات.', en: 'The port — the container yard.' },
        {
          who: 'suspect',
          text: 'حمّلوا الصناديق بسرعة. السلاح ده لازم يوصل للزعيم الليلة.',
          en: 'Load the crates, fast. These guns reach the boss tonight.'
        },
        {
          who: 'hamed',
          shot: 1,
          text: 'دول مسلحين يا ياسر. مفيش بطولة. اتحامى الأول وبعدين اضرب.',
          en: 'They’re armed, Yasser. No heroics. Take cover first, then shoot.'
        },
        { who: 'yasser', shot: 2, text: 'فاهم يا فندم. داخل.', en: 'Understood, sir. Going in.' }
      ]
    },
    outro: {
      id: 'm4-outro',
      shots: [heroWide()],
      lines: [
        {
          who: 'hamed',
          shot: 0,
          text: 'الصناديق عليها ختم العقرب. ده سلاحه هو.',
          en: 'The crates carry the Scorpion’s mark. These are his guns.'
        },
        {
          who: 'mona',
          text: 'رجالته بقوا متوترين. خلي بالك من نفسك يا ياسر.',
          en: 'His men are getting nervous. Watch yourself, Yasser.'
        }
      ]
    }
  },
  5: {
    intro: {
      id: 'm5-intro',
      shots: [aerial(), streetLevel(), carHero()],
      lines: [
        { who: 'narrator', shot: 0, text: 'وسط البلد — زحمة الضهر.', en: 'Downtown — midday traffic.' },
        {
          who: 'mona',
          shot: 1,
          text: 'ست اتخبطت على الرصيف والعربية مكمّلة! الإسعاف في الطريق.',
          en: 'A woman was hit on the pavement and the car kept going! The ambulance is on its way.'
        },
        { who: 'yasser', shot: 2, text: 'مش هيبعد كتير. أنا وراه.', en: 'He won’t get far. I’m on him.' }
      ]
    },
    outro: {
      id: 'm5-outro',
      shots: [heroWide()],
      lines: [
        { who: 'suspect', shot: 0, text: 'مكنتش شايفها! خفت واتلخبطت…', en: 'I didn’t see her! I panicked…' },
        {
          who: 'mona',
          text: 'الست كويسة الحمد لله. شغل سريع يا ياسر.',
          en: 'She’s okay, thank God. Quick work, Yasser.'
        }
      ]
    }
  },
  6: {
    intro: {
      id: 'm6-intro',
      shots: [sceneOrbit(), streetLevel(), officerFace()],
      lines: [
        { who: 'narrator', shot: 0, text: 'وسط البلد — قدام البنك.', en: 'Downtown — outside the bank.' },
        {
          who: 'suspect',
          text: 'محدش يقرّب! أي حد هيقرّب، الراجل ده هيروح فيها!',
          en: 'Nobody come closer! Anyone moves and this guy pays for it!'
        },
        {
          who: 'hamed',
          shot: 1,
          text: 'الرهينة أهم من أي حاجة. طلقة واحدة غلط والمهمة باظت.',
          en: 'The hostage comes first. One wrong shot and it’s over.'
        },
        { who: 'yasser', shot: 2, text: 'نَفَس عميق… ونشّن كويس.', en: 'Deep breath… and aim carefully.' }
      ]
    },
    outro: {
      id: 'm6-outro',
      shots: [heroWide(), craneUp()],
      lines: [
        {
          who: 'hamed',
          shot: 0,
          text: 'الرهينة سليمة. كده يبقى ظابط بجد.',
          en: 'The hostage is safe. That’s real police work.'
        },
        { who: 'yasser', shot: 1, text: 'كان بيترعش يا فندم… زيي بالظبط.', en: 'He was shaking, sir… just like me.' }
      ]
    }
  },
  7: {
    intro: {
      id: 'm7-intro',
      shots: [aerial(), streetLevel(), carHero()],
      lines: [
        {
          who: 'narrator',
          shot: 0,
          text: 'الكورنيش — عربية سودا من غير نمر.',
          en: 'The Corniche — a black car with no plates.'
        },
        {
          who: 'mona',
          shot: 1,
          text: 'دي عربية العقرب، والركاب مسلحين. أول ما تقف هينزلوا يضربوا.',
          en: 'That’s the Scorpion’s car and the passengers are armed. The moment it stops they’ll come out shooting.'
        },
        { who: 'yasser', shot: 2, text: 'يبقى نوقفها في حتة فاضية.', en: 'Then we stop it somewhere empty.' }
      ]
    },
    outro: {
      id: 'm7-outro',
      shots: [heroWide()],
      lines: [
        {
          who: 'mona',
          shot: 0,
          text: 'لقينا في العربية ورق شحن… عنوان مخزن على الشارع الشرقي.',
          en: 'Shipping papers in the car… a warehouse address on the east avenue.'
        },
        { who: 'hamed', text: 'ده مخزنهم. استعد يا ياسر.', en: 'That’s their warehouse. Get ready, Yasser.' }
      ]
    }
  },
  8: {
    intro: {
      id: 'm8-intro',
      shots: [sceneOrbit(), streetLevel(), officerFace()],
      lines: [
        {
          who: 'narrator',
          shot: 0,
          text: 'الشارع الشرقي — مخزن العقرب.',
          en: 'East avenue — the Scorpion’s warehouse.'
        },
        {
          who: 'suspect',
          text: 'لو البوليس جه، اضربوا واهربوا من الباب الورّاني.',
          en: 'If the cops show up, shoot and get out the back door.'
        },
        {
          who: 'hamed',
          shot: 1,
          text: 'أربعة جوه، وواحد هيحاول يهرب. متسيبش ولا واحد.',
          en: 'Four inside, and one will try to run. Don’t let any of them go.'
        },
        { who: 'yasser', shot: 2, text: 'النهارده نقفل المخزن ده.', en: 'Today this warehouse closes.' }
      ]
    },
    outro: {
      id: 'm8-outro',
      shots: [heroWide()],
      lines: [
        {
          who: 'hamed',
          shot: 0,
          text: 'المخزن ده كان قلب العصابة. العقرب خسر كتير النهارده.',
          en: 'That warehouse was the gang’s heart. The Scorpion lost a lot today.'
        },
        {
          who: 'informant',
          text: '(رسالة من رقم مجهول) عايز تعرف بيت المخدرات فين؟ قابلني في الضاحية.',
          en: '(text from an unknown number) Want to know where the drug house is? Meet me in the suburb.'
        }
      ]
    }
  },
  9: {
    intro: {
      id: 'm9-intro',
      shots: [aerial(), streetLevel(), officerFace()],
      lines: [
        {
          who: 'narrator',
          shot: 0,
          text: 'الضاحية — شارع هادي… زيادة عن اللزوم.',
          en: 'The suburb — a quiet street… too quiet.'
        },
        {
          who: 'informant',
          shot: 1,
          text: 'متبصليش كده يا باشا. أنا عايز أخلص من العقرب زيك بالظبط.',
          en: 'Don’t look at me like that, boss. I want out from the Scorpion as much as you do.'
        },
        {
          who: 'yasser',
          shot: 2,
          text: 'لو ده فخ، إنت أول واحد هيتحاسب.',
          en: 'If this is a trap, you’re the first one to answer for it.'
        }
      ]
    },
    outro: {
      id: 'm9-outro',
      shots: [heroWide()],
      lines: [
        {
          who: 'mona',
          shot: 0,
          text: 'الواشي طلع صادق. البيت كان مليان.',
          en: 'The informant was telling the truth. The house was full.'
        },
        {
          who: 'hamed',
          text: 'فاضل الفلوس… والراجل اللي شايلها.',
          en: 'Now there’s the money… and the man carrying it.'
        }
      ]
    }
  },
  10: {
    intro: {
      id: 'm10-intro',
      shots: [aerial(), streetLevel(), carHero()],
      lines: [
        { who: 'narrator', shot: 0, text: 'وسط البلد — سواق الزعيم.', en: 'Downtown — the boss’s driver.' },
        {
          who: 'boss',
          shot: 1,
          text: 'الفلوس توصل الفيلا قبل المغرب. ولو حد مشي وراك… متقفش.',
          en: 'The money reaches the villa before sunset. If anyone tails you… don’t stop.'
        },
        { who: 'yasser', shot: 2, text: 'أسرع عربية في المدينة؟ هنشوف.', en: 'Fastest car in the city? We’ll see.' }
      ]
    },
    outro: {
      id: 'm10-outro',
      shots: [heroWide(), craneUp()],
      lines: [
        {
          who: 'suspect',
          shot: 0,
          text: 'الزعيم… في الفيلا في الضاحية.',
          en: 'The boss… he’s at the villa in the suburb.'
        },
        {
          who: 'suspect',
          text: 'بس الأول هيهاجموا القسم! النهارده!',
          en: 'But first they’re hitting the precinct! Today!'
        },
        {
          who: 'yasser',
          shot: 1,
          text: 'القسم؟! منى… حامد… لازم أرجع حالاً.',
          en: 'The precinct?! Mona… Hamed… I have to get back now.'
        }
      ]
    }
  },
  11: {
    intro: {
      id: 'm11-intro',
      shots: [sceneOrbit(), streetLevel(), officerFace()],
      lines: [
        { who: 'narrator', shot: 0, text: 'القسم — تحت الهجوم.', en: 'The precinct — under attack.' },
        {
          who: 'mona',
          shot: 1,
          text: 'ياسر! خمسة مسلحين قدام المبنى، وإحنا محبوسين جوه!',
          en: 'Yasser! Five gunmen out front and we’re pinned inside!'
        },
        { who: 'yasser', shot: 2, text: 'اصمدوا. أنا جاي.', en: 'Hold on. I’m coming.' }
      ]
    },
    outro: {
      id: 'm11-outro',
      shots: [heroWide()],
      lines: [
        {
          who: 'hamed',
          shot: 0,
          text: 'لولاك كان القسم ضاع النهارده.',
          en: 'Without you we’d have lost the precinct today.'
        },
        { who: 'hamed', text: 'فاضل خطوة واحدة: الزعيم نفسه.', en: 'One step left: the boss himself.' }
      ]
    }
  },
  12: {
    intro: {
      id: 'm12-intro',
      shots: [aerial(), sceneOrbit({ blend: 1 }), officerFace()],
      lines: [
        { who: 'narrator', shot: 0, text: 'الضاحية — فيلا الزعيم.', en: 'The suburb — Al-Zaeem’s villa.' },
        {
          who: 'boss',
          shot: 1,
          text: 'الحرس في أماكنهم؟ كويس. سيبوه ييجي لحد عندي.',
          en: 'Guards in position? Good. Let him come all the way to me.'
        },
        {
          who: 'yasser',
          shot: 2,
          text: 'من أول يوم في وسط البلد… لحد هنا. النهارده بنخلّص.',
          en: 'From my first day downtown… all the way here. Today it ends.'
        }
      ]
    },
    outro: {
      id: 'm12-outro',
      shots: [heroWide(), craneUp({ dur: 9 })],
      lines: [
        { who: 'boss', shot: 0, text: 'خلاص… استسلمت.', en: 'Enough… I give up.' },
        {
          who: 'hamed',
          shot: 1,
          text: 'العقرب انتهى. المدينة ليها حق تنام النهارده.',
          en: 'The Scorpion is finished. The city can sleep tonight.'
        },
        { who: 'hamed', text: 'مبروك يا حضرة الرائد ياسر.', en: 'Congratulations, Major Yasser.' }
      ]
    }
  }
};

export const storyCutscene = (levelId: number, kind: 'intro' | 'outro'): CutsceneDef | undefined =>
  STORY_CUTSCENES[levelId]?.[kind];
