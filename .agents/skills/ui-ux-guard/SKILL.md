---
name: ui-ux-guard
description: >-
  Use before implementing any UI/UX change, layout redesign, or visual bug fix in the AHBAB web app
  (desktop or phone, light or dark mode). Audits CSS root causes (class collisions, specificity,
  stacking contexts, RTL alignment, dark-mode contrast), alerts the user in Arabic before executing
  structural or cross-page changes, and requires live browser verification before releasing.
---

# حارس تصميم UI/UX والتنبيه قبل التنفيذ (`ui-ux-guard`)

## الهدف
منع أخطاء التصميم والتداخلات المخفية في CSS/HTML قبل وصولها للمستخدم، وتنبيه المستخدم بوضوح قبل تنفيذ أي تعديل قد يؤثر على صفحات أخرى أو يغيّر البنية البصرية، ثم التحقق البصري الحقيقي في المتصفح قبل الرفع.

## 1. فحص السبب الجذري قبل أي تعديل (لا تخمين)
عند أي بلاغ بصري أو طلب تعديل UI/UX:
1. **تعارض أسماء الكلاسات (Class Collisions)**: ابحث في **جميع** ملفات `web/src/styles/*.css` عن كل قاعدة تستهدف نفس الكلاس (مثل تسرب قواعد `print-register.css` أو `blue.css` أو `subscribers-theme.css` إلى صفحات أخرى).
2. **أولوية CSS (Specificity & Layers)**: تحقق من القواعد ذات الأولوية الأعلى (`:root[data-palette=...]`, `:root[data-theme="dark"]`, `@layer utilities`, `!important`) التي قد تلغي التعديل.
3. **طبقات التراكب (Stacking Contexts)**: افحص `z-index`، `position`، `overflow`، و`backdrop-filter`، وتأكد أن القوائم المنسدلة (مثل `DatePicker`) تستخدم `Portal` على `document.body` فلا تختفي خلف البطاقات.
4. **الهوامش السالبة والتكرار (Negative Margins & Duplicates)**: تأكد من عدم وجود مسار تنقّل (`Breadcrumb`) مكرّر بين `Shell.tsx` والصفحة، وعدم سحب الصفحة للأعلى فوق المسار بهوامش سالبة (`-my-*`).
5. **المحاذاة والـ RTL**: تحقق أن العناصر تبدأ من اليمين إلى اليسار بشكل منطقي (`margin-inline-*`, `padding-inline-*`, `text-align: start`) دون فراغات غير مقصودة.
6. **الوضعان النهاري والليلي + الثيمات**: تأكد من التباين والحدود والظلال في الوضع الفاتح والداكن مع استخدام متغيرات الثيم (`--surface`, `--ink`, `--line`, `--brand`, `--bar-active`, `--glass`).

## 2. التنبيه قبل التنفيذ (`تنبيه قبل التنفيذ`)
قبل تعديل أي تصميم أو إصلاح يؤثر على أكثر من صفحة، أو يغيّر بنية بطاقة/جدول/ترويسة:
- اعرض للمستخدم تنبيهاً مختصراً وواضحاً بالعربية يتضمن:
  1. **الخلل المكتشف وسببه الحقيقي** (اسم الملف والقاعدة المسببة).
  2. **التعديل المقترح** وما الصفحات التي ستتأثر به (الكمبيوتر / الهاتف / الطباعة / الوضع الليلي).
  3. **تحذير بأي أثر جانبي محتمل** (إن وُجد) أو تأكيد عدم وجود أثر جانبي.
- عند التعديلات البنيوية أو الغامضة، اطلب موافقة المستخدم قبل التنفيذ.
- عند الإصلاحات المباشرة التي طلبها المستخدم صراحةً، نفّذ الإصلاح ثم تحقّق منه بصرياً في المتصفح قبل الرفع.

## 3. التحقق البصري الحقيقي قبل الرفع
**لا تعتمد على نجاح `npm run build` وحده لإعلان إصلاح خطأ UI/UX!**
1. شغّل `npm run typecheck` و`npm run build`.
2. افتح الصفحة المعدّلة أو أعد تحميلها في المتصفح المحلي (`/browser` على `http://127.0.0.1:8787`) وتأكّد فعلياً من:
   - اختفاء الخطأ البصري تماماً (محاذاة، حدود، تباين، عدم تداخل).
   - سلامة الوضع الليلي والنهاري.
   - عدم وجود أخطاء في الشبكة (مثل `422` أو `404` في الـ API) أو الـ Console.
3. بعد تأكيد النجاح بصرياً، ارفع إلى GitHub وانشر على Cloudflare Workers.
