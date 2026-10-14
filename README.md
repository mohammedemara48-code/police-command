# POLICE COMMAND — قيادة الشرطة

<p align="center"><img src="https://police-command.vercel.app/media/gameplay.gif" width="600" alt="gameplay: walk to the patrol car, chase and arrest, drift, siren, station hub"></p>

<p align="center">
  <img src="docs/media/street.svg" width="150" alt="street patrol HUD">
  <img src="docs/media/creator.svg" width="150" alt="character creator">
  <img src="docs/media/station.svg" width="150" alt="police station hub">
  <img src="docs/media/drift.svg" width="150" alt="driving with siren and handbrake">
  <img src="docs/media/chase.svg" width="150" alt="chase box-in">
  <img src="docs/media/traffic-stop.svg" width="150" alt="traffic stop">
</p>

لعبة شرطة ثلاثية الأبعاد في المتصفح (Three.js + Vite + PWA) بواجهة عربية RTL، مصممة للموبايل أولاً.

**العب الآن:** https://police-command.vercel.app/

## المميزات
- حملة قصة من 12 مهمة + دورية حرة ببلاغات عشوائية (سطو، عصابات، رهائن، مطاردات، مخالفات سرعة، دوريات تفقدية).
- حركة ظابط بكاميرا ثالث شخص نسبية للكاميرا، تصادم مع العربيات، وتعليم تفاعلي لأول بلاغ.
- قيادة آركيد: فرامل يد ودريفت، سارينة بتخلي العربيات توسع، خبطات وضرر، عداد سرعة.
- صانع شخصية (راجل/ست، لون البشرة، الشعر، الزي، السلاح) مع معاينة 3D، ومتزامن مع الحساب.
- قسم الشرطة: لوحة المهام، الجراج، مخزن السلاح، غرفة الملابس.
- حفظ تلقائي واستكمال، تصدير/استيراد، تقليل الحركة، أصوات وموسيقى منفصلة.
- PWA حقيقي: يتثبّت ويشتغل أوفلاين بعد أول زيارة.
- حساب اختياري (Neon Auth) وترتيب أسبوعي.

## تشغيل محلي
```bash
npm install
npm run dev      # تطوير
npm run check    # typecheck + lint + tests
npm run build    # بناء الإنتاج إلى dist/
```

## النشر
الاستضافة الوحيدة هي **Vercel** (`vercel.json`: Vite · `npm run build` · `dist`). كل دمج في `main` ينشر تلقائياً.

## CI
[![CI](https://github.com/mohammedemara48-code/police-command/actions/workflows/ci.yml/badge.svg)](https://github.com/mohammedemara48-code/police-command/actions/workflows/ci.yml)

كل تعديل بيتختبر تلقائياً (فحص الأنواع، ESLint، Prettier، الاختبارات، والبناء) عن طريق GitHub Actions.

## الترخيص
الكود مرخّص بـ MIT (انظر `LICENSE`). الأصول الخارجية (نماذج وأصوات) لها تراخيصها الخاصة (CC0 / CC-BY)، انظر `CREDITS.md`.
