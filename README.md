# POLICE COMMAND — قيادة الشرطة

لعبة استراتيجية عمليات شرطة **ثلاثية أبعاد** في المتصفح (Three.js + Vite + PWA) — واجهة عربية RTL.

**مباشر (Vercel):** https://police-command.vercel.app/

## v1.2.1 — بناء ثابت لـ Cloudflare Pages

- المصادر في `src/` مباشرة (لم نعد نعتمد على `scripts/game-parts` التالف)
- دورة نهار/ليل سينمائية من v1.2
- إعداد Pages: `bun/npm build` → مخرجات `dist` (بدون `npx wrangler deploy`)

## v1.2 — دورة نهار/ليل سينمائية

- ساعة مدينة متسارعة (دورة كاملة ~8–12 دقيقة حقيقية، قابلة للضبط من الإعدادات)
- انتقال سلس: صباح → ظهر → غروب → ليل (سماء، شمس/قمر، ضباب، نوافذ، أعمدة إنارة)
- نهار: سماء مضيئة وشوارع مقروءة · ليل: إنارة شوارع ونوافذ بإضاءة سينمائية
- مؤشر ساعة/قمر في الشريط العلوي (صباح / ظهر / غروب / ليل)

## v1.1 — قرارات + إثارة + ديسكتوب/موبايل

- قرارات صريحة قبل الإرسال: **تفاوض / اقتحام / حصار / مطاردة** مع نسبة نجاح وخطر ضباط ومكافأة متوقعة
- بلاغات أطول ومتعددة المراحل (سطو بنك: محيط → اقتحام → اعتقال)
- شجرة تقنيات قابلة للفتح
- بث CCTV حي للبلاغات الحرجة
- واجهة مكتب كثيفة + ورقة تنبيهات موبايل
- صوت خفيف عبر WebAudio

## تشغيل محلي
```bash
npm install
npm run dev
```

## النشر

### Vercel
- Framework: Vite · Build: `npm run build` · Output: `dist`

### Cloudflare Pages (الواجهة)
في مشروع Pages المرتبط بالمستودع:
- **Build command:** `bun run build` أو `npm run build`
- **Build output directory:** `dist`
- **Deploy command:** فارغ — **لا تستخدم** `npx wrangler deploy`

نشر يدوي بعد `npm run build`:
```bash
npx wrangler pages deploy dist --project-name=police-command
```

### Cloudflare Worker (غرف مالتي بلاير — اختياري)
انظر `worker/` — يحتاج `CLOUDFLARE_ACCOUNT_ID` + توكن بصلاحيات Workers/Durable Objects.

## المستودع
https://github.com/mohammedemara48-code/police-command
