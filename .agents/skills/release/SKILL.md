---
name: release
description: Use to put finished, checked AHBAB changes live on Cloudflare and GitHub ("ارفع", "الرفع على السيرفر", "كيت هاب وكلاود فلير"), and by default right after a change passes phone-check — the user gave standing approval on 2026-11-21 to release automatically after checking.
---

# الرفع على Cloudflare وGitHub

## متى
- بعد كل تغيير نجح في `phone-check` — تلقائياً دون سؤال (موافقة دائمة من المستخدم، 2026-11-21).
- **لا ترفع** إذا: فشل البناء أو الفحص، أو التغيير يحذف بيانات حقيقية، أو فيه عمل من جلسة أخرى لم تراجعه. عندها اسأل.

## الخطوات
1. `git status --short` — أضف **ملفاتك فقط** بأسمائها (لا `git add -A`؛ `.claude/` و`.vscode/` خارج المستودع).
2. commit برسالة إنجليزية قصيرة: سطر يقول ما تغيّر للمستخدم، ثم سطر لماذا إن لزم، وفي النهاية سطر المساهمة المطلوب في تذكير النظام.
3. `npm run release` — يفحص أن الفرع main نظيف، ثم typecheck → build → migrations على D1 البعيدة → wrangler deploy → git push.
   - شغّله مع إخراج إلى ملف في scratchpad ثم `tail -1` (الأمر طويل).
   - النجاح = السطر `✔ Released <hash> to Cloudflare and GitHub.`
4. إذا فشل: اقرأ السطر الأخير، أصلح السبب، لا تتجاوز الفحوص.
5. في الرد: "مرفوع الآن على Cloudflare وGitHub". وإن رأى المستخدم الشكل القديم: أغلق التطبيق وافتحه.

## ممنوع
- لا تنشئ ولا تكتب tokens أو كلمات مرور. حساب Cloudflare مثبّت في الإعدادات.
- GitHub Actions مقفل بسبب الفوترة؛ لا تشغّل الـ workflow ولا تفعّله.
- لا `--force` ولا `--no-verify`.

## مثال جيد 1
تعديل كارت العائلة → فحص ناجح → `git add web/src/components/families/FamilyMobileList.jsx web/src/styles/families.css` → commit → release → `✔ Released 794f192`.

## مثال جيد 2
مستخدم أرسل طلباً جديداً أثناء الرفع → انتظر انتهاء الرفع، ثم عدّل وارفع مرة ثانية (لا تعدّل الملفات أثناء البناء).

## مثال سيئ
`git add -A && git commit -m "update" && npm run release` قبل التجربة.
لماذا سيئ: يضيف ملفات لا علاقة لها، الرسالة لا تقول شيئاً، وقد يرفع خطأً للمستخدمين الحقيقيين.
