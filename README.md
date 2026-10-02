# POLICE COMMAND — قيادة الشرطة

لعبة استراتيجية عمليات شرطة **ثلاثية أبعاد** في المتصفح (Three.js + Vite + PWA) — واجهة عربية RTL.

**مباشر:** https://police-command.vercel.app/

## v1.1 — قرارات + إثارة + ديسكتوب/موبايل

- قرارات صريحة قبل الإرسال: **تفاوض / اقتحام / حصار / مطاردة** مع نسبة نجاح وخطر ضباط ومكافأة متوقعة
- بلاغات أطول ومتعددة المراحل (سطو بنك: محيط → اقتحام → اعتقال)
- شجرة تقنيات قابلة للفتح (استجابة سريعة، كفاءة وقود، CCTV، تعزيز SWAT، دعم جوي، مختبر)
- بث CCTV حي (كانفاس CRT) للبلاغات الحرجة
- واجهة مكتب كثيفة + ورقة تنبيهات موبايل بأزرار إرسال كبيرة
- صوت خفيف (صافرة / نجاح / فشل / همس مدينة) عبر WebAudio
- مدينة ليلية أوضح وإضاءة أفضل

## تشغيل محلي
```bash
npm install
npm run assemble   # يستعيد المصادر من scripts/game-parts
npm run dev
```

### التحكم
- سحب / لمس: دوران الكاميرا
- عجلة: زوم
- اختر قراراً ثم أرسل وحدة من بطاقة البلاغ

## النشر
- Framework: Vite · Build: `npm run build` · Output: `dist`
- المستودع: https://github.com/mohammedemara48-code/police-command
- Commit ship: sources tarball في `scripts/game-parts` + assemble في build
