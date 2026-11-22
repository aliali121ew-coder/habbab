---
name: phone-check
description: Use after any change to the AHBAB web app that shows on screen, before releasing — to see it on a phone-sized screen (375px) in light and dark mode, catch cut-off text, duplicates and dark-mode problems, and take the photo that goes in the reply.
---

# التجربة على مقاس الهاتف

## الخطوات
1. `npm run build` (يجب أن ينجح).
2. افتح المعاينة: `preview_start {name: "dev"}` (يُعاد استخدامه إن كان يعمل). ثم `resize_window {preset: "mobile"}`.
3. **امسح النسخة المحفوظة** وإلا سترى التصميم القديم:
   `for (const k of await caches.keys()) await caches.delete(k); for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); location.reload();`
4. إذا ظهرت صفحة الدخول: ادخل بحساب `admin` التجريبي المحلي (كلمة مروره في `scripts/seed-dev.mjs`، لا تكتبها في الرد). هذا للخادم المحلي فقط.
5. اذهب للصفحة، مرّر العنصر إلى الشاشة بـ `scrollIntoView` (التمرير بالعجلة قد يُظهر شاشة فارغة).
6. **افحص بالكود لا بالعين فقط:**
   - نص مقطوع: `[...document.querySelectorAll('SELECTOR')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent)` يجب أن يرجع `[]`.
   - تكرار: عدّ العناصر (مثل `nav` ظاهر فيه "الرئيسية") يجب أن يكون 1.
   - الأزرار: انقر بـ JS وتأكد من النتيجة (مثلاً `location.hash` تغيّر).
7. **الوضعان:** خذ صورة، ثم `document.documentElement.dataset.theme = 'light'` أو `'dark'`، **انتظر 500ms** (وإلا تُلتقط الصورة قبل تغيّر الألوان)، وخذ صورة ثانية، ثم `location.reload()` لإرجاع اختيار المستخدم.
8. أرجع الحجم: `resize_window {preset: "desktop"}`.
9. احذف أي بيانات تجريبية أضفتها (صورة، عائلة…).
10. في الرد: صورة واحدة واضحة، واذكر إن لم تجرّب أحد الوضعين.

## مثال جيد 1
بعد اختصار سطر "آخر صرف": فحص القطع أرجع `["راتب ش…"]` → وضع التاريخ في سطر خاص → الفحص أرجع `[]` → صورة.

## مثال جيد 2
بعد إضافة التقويم: فتحه بالنقر، عدّ الأيام الملونة (زيارة 3، مساعدة 4، الاثنان 6)، النقر على يوم، صورة داكن وصورة فاتح.

## مثال سيئ
أخذ صورة مباشرة بعد البناء دون مسح النسخة المحفوظة، فظهر الكارت القديم، ثم القول "تم".
لماذا سيئ: الصورة لا تُثبت شيئاً، والمستخدم سيرى غير ما قيل له.
