# هيكل المشروع والـ API

## الهيكل

```text
migrations/0001_init.sql     الجداول والفهارس والمشغّلات
src/
  index.ts                   الحماية العامة، ربط المسارات، معالجة الأخطاء، Cron
  env.ts                     الأنواع والـ bindings
  jobs.ts                    النسخ الاحتياطي والأرشفة
  lib/   auth  cache  crypto  db  http  text
  routes/ auth  subscribers  programs  transactions  prescriptions  closings
          admin (dashboard, meta, delegates, users, audit)
web/
  index.html  vite.config.ts  public/_headers
  src/ App  api  format  image  theme  styles.css
  src/components/ Shell  Modal  StateMessage
  src/pages/ Login
  src/pages/subscribers/ SubscribersPage  StatCards  DelegatePanel  MonthlyChart
                         Register  PaymentDialog  AddSubscriberDialog
  public/legacy/  الواجهة السابقة، تعمل مؤقتاً حتى إعادة بناء بقية الصفحات
scripts/  create-admin  seed-dev  decrypt-backup
tests/    api.test.mjs  mobile.mjs
```

الواجهة الجديدة مبنية بـ React وVite وتُخرج إلى `dist/`. أما `web/public/legacy/` فملفات تُقدَّم كما هي.

## الأدوار

`A` مدير عام، `F` محاسب، `D` مندوب (مقيّد بمشتركيه)، `H` مسؤول صحي.

| الطريقة والمسار | الأدوار | الوصف |
|---|---|---|
| `POST /api/auth/login` | عام | دخول، وRate limit لكل IP وقفل لكل حساب |
| `POST /api/auth/logout` | عام | خروج |
| `GET /api/auth/me` | الكل | المستخدم الحالي |
| `POST /api/auth/change-password` | الكل | تغيير كلمة المرور |
| `GET /api/dashboard` | الكل | ملخص خاص بكل دور |
| `GET /api/meta` | الكل | البرامج، والمندوبون لـ A وF |
| `GET /api/subscribers?status=&delegate=&cursor=` | A D | قائمة مقنّعة |
| `POST /api/subscribers/search` | A D | بحث، حد أدنى 3 أحرف |
| `POST /api/subscribers/lookup` | A F H D | معرّف واسم فقط، لاختيار شخص |
| `POST /api/subscribers` | A D | إضافة |
| `GET /api/subscribers/:id` | A D | تفاصيل مقنّعة |
| `POST /api/subscribers/:id/reveal` | A D | كشف الهاتف والهوية، مسجل بالتدقيق |
| `PATCH /api/subscribers/:id` | A D | تعديل، والنقل بين المندوبين لـ A فقط |
| `DELETE /api/subscribers/:id` | A | حذف ناعم |
| `POST /api/programs` | A | برنامج جديد |
| `GET /api/programs/:id/members?cursor=` | A D | أعضاء البرنامج |
| `POST /api/programs/:id/members` | A D | تسجيل مشترك |
| `DELETE /api/programs/:id/members/:memberId` | A D | إنهاء التسجيل |
| `GET /api/transactions?type=&month=&delegate=&subscriber=&cursor=` | A F D | الحركات، والمندوب يرى حركاته فقط |
| `POST /api/transactions` | A F | حركة جديدة |
| `DELETE /api/transactions/:id` | A F | حذف ناعم |
| `GET /api/prescriptions?status=&subscriber=&cursor=` | A H | القائمة مع مصغرات موقّعة |
| `POST /api/prescriptions` | A H | multipart: بيانات وصورة ومصغرة |
| `GET /api/prescriptions/:id` | A H | فك التشفير ورابط الصورة، مسجل بالتدقيق |
| `PATCH /api/prescriptions/:id/status` | A H | تغيير الحالة |
| `DELETE /api/prescriptions/:id` | A | حذف ناعم |
| `GET /api/files/:token` | A H | ملف عبر رابط موقّع للمستخدم نفسه |
| `GET /api/closings?cursor=` | A F | الأشهر المقفلة |
| `GET /api/closings/preview?month=` | A F | معاينة قبل الإقفال |
| `POST /api/closings` | A F | إقفال شهر منتهٍ |
| `POST /api/closings/:month/reopen` | A | إعادة الفتح |
| `GET /api/collections/overview?year=&delegate=` | A D | بطاقات الصفحة ولوحة المندوب والرسم البياني |
| `GET /api/collections/grid?year=&status=&delegate=&cursor=` | A D | سجل التسديد |
| `POST /api/collections/search` | A D | بحث في سجل التسديد |
| `POST /api/collections/pay` | A D | تسجيل تسديد شهر |
| `POST /api/collections/undo` | A | إلغاء تسديد |
| `POST /api/collections/delegates/:id/photo` | A D | صورة المندوب |
| `GET /api/delegates` | A F | المندوبون وإحصائياتهم |
| `GET /api/delegates/:id` | A F D | صفحة مندوب، والمندوب لصفحته فقط |
| `GET /api/users?cursor=` | A | المستخدمون |
| `POST /api/users` | A | مستخدم جديد بكلمة مؤقتة |
| `PATCH /api/users/:id` | A | تعديل، ويُنهي جلساته الحالية |
| `GET /api/audit?cursor=` | A | سجل التدقيق |

## اتفاقيات الاستجابة

- القوائم تعيد `{ "items": [...], "next": <cursor|null> }`، بحد 30 سجلاً.
- الأخطاء تعيد `{ "error": "رسالة عربية" }` مع الرموز 400 و401 و403 و404 و409 و413 و422 و429.
- سجل مندوب آخر يعيد 404 وليس 403، حتى لا يكشف وجود المعرّف.
- طلبات الكتابة تتطلب الترويسة `x-app: 1`.
