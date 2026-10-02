# POLICE COMMAND — قيادة الشرطة

لعبة استراتيجية عمليات شرطة **ثلاثية الأبعاد** في المتصفح (Three.js + Vite + PWA).

## اللعب

- **مباشر بعد النشر:** `https://police-command.vercel.app`
- محلياً: `npm install && npm run dev`

### التحكم
- سحب: دوران الكاميرا · عجلة: زوم
- إرسال دورية / SWAT / تحقيقات / K9 إلى البلاغات

### أنظمة (Unity Core → TypeScript)
- GameManager: ميزانية 125400، سمعة 82، وقود 750، مستلزمات 900، أبحاث 400
- IncidentManager: SpawnIncident / DispatchUnitToIncident
- CITY WIDE ALERT + ضباط XP

## النشر على Vercel
Framework: Vite · Build: `npm run build` · Output: `dist`

## PWA
Android Chrome: Install app · iOS Safari: Add to Home Screen

## أصول
انظر `public/assets/README.md` لإضافة Textures/GLB.
