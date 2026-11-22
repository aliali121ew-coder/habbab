---
name: theme-colours
description: Use whenever a change in the AHBAB app adds or changes a colour, background, gradient, shadow or glow, or the user asks for a colour to "follow the theme", be lighter ("تخفيف"), match other pages, or look right in dark mode. Applies on phone and computer alike.
---

# الألوان والثيم

## القواعد
- **لون الثيم = `var(--bar-active)`.** أي لون "رئيسي" (شريط، زر، رقم مهم، سهم) يُبنى منه حتى يتغير مع الثيم (أزرق / بنفسجي / رسمي). لا تكتب `#2563eb` أو `blue-600` لعنصر يجب أن يتبع الثيم.
- **درجات خفيفة بـ `color-mix`:** خلفية `color-mix(in srgb, var(--bar-active) 6–14%, #fff)`، حدود 14–22%، وفي الداكن `… 10–20%, transparent)` والنص `… 65%, #fff)`.
- **الألوان الثابتة للمعنى فقط:** أخضر = مساعدة/مدفوع، برتقالي = زيارة، أحمر = حرجة/متأخر. وتكون باهتة (خلفية 10–22%).
- **الوضع الداكن:** لكل قاعدة لون أضف نسخة `:root[data-theme="dark"] …` باستخدام `var(--surface)`, `var(--ink)`, `var(--ink-2)`, `var(--ink-3)`, `var(--line)`. السمة `data-theme` موجودة دائماً (حتى عندما يأتي الداكن من إعداد الهاتف).
- **ابدأ خفيفاً.** إذا شككت، الأخف أفضل؛ المستخدم يطلب "تخفيف أكثر" كثيراً ونادراً يطلب "أغمق".
- لا تحقن `<style>` من JS (يمنعه CSP)؛ اكتب في ملفات `web/src/styles/*.css`.
- الخط دائماً Noto Kufi Arabic.

## الخطوات
1. ابحث عن ألوان قريبة مستخدمة في الصفحات الأخرى وانسخ نسبها.
   وابحث في الملفات التي تلمسها عن أزرق ثابت بقي من قبل: `blue-600`, `indigo-600`, `#2563eb`, `rgba(37,99,235` — حوّله إلى `var(--bar-active)` أو الصنف `fam-theme-fill` (`var(--accent-grad)`).
2. اكتب القاعدة الفاتحة ثم الداكنة مباشرة تحتها.
3. افحص بـ `phone-check` في الوضعين **وفي ثيم آخر**: `document.documentElement.dataset.palette='violet'` — كل ما هو "لون رئيسي" يجب أن يصبح بنفسجياً معاً.

## مثال جيد 1
"هذه لون يتغير بتغير الثيم": شريط الكارت من تدرج أزرق ثابت إلى
`linear-gradient(160deg, color-mix(in srgb, var(--bar-active) 88%, #fff), var(--bar-active) 45%, color-mix(in srgb, var(--bar-active) 78%, #000))` + نسخة داكنة.

## مثال جيد 2
التقويم: أيام الزيارة `color-mix(in srgb, #f59e0b 22%, #fff)` وأيام المساعدة `… #10b981 22% …`، وفي الداكن 26% على شفاف مع نص فاتح.

## مثال سيئ
كارتات ملونة بألوان قوية مشبعة (100%) دون نسخة داكنة.
لماذا سيئ: المستخدم قال "اصبح نشاز" ثم "تخفيف اكثر واكثر"، وفي الداكن ظهرت باهتة بسبب قاعدة الفاتح.
