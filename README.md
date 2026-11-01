# سجلات المشتركين والمساعدات

تطبيق ويب عربي RTL على Cloudflare (Workers + D1 + R2 + KV) لإدارة المشتركين والمساعدات والحسابات الشهرية ووصفات المرضى.

| الوثيقة | المحتوى |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | مخطط المعمارية، ERD، القرارات والافتراضات |
| [migrations/0001_init.sql](migrations/0001_init.sql) | سكربت SQL الكامل مع الفهارس والمشغّلات |
| [docs/API.md](docs/API.md) | هيكل المشروع وكل الـ endpoints والصلاحيات |
| [docs/TESTING.md](docs/TESTING.md) | قائمة الاختبارات، وما نُفّذ وما لم يُنفّذ |
| [docs/ESTIMATE.md](docs/ESTIMATE.md) | تقدير استهلاك D1/R2 والتكلفة الشهرية |

## التشغيل المحلي

```bash
npm install
cp .dev.vars.example .dev.vars        # ثم ضع ثلاث قيم من: openssl rand -base64 32
npm run db:migrate:local
npm run seed:dev                      # 25,000 مشترك تجريبي وحساب لكل دور
npm run dev                           # http://localhost:8787
```

الحسابات التجريبية: `admin` و`accountant` و`delegate1` و`delegate2` و`health`، وكلمة المرور `Test-Pass-123`. هذه الحسابات محلية فقط، ولا تشغّل `seed:dev` على قاعدة الإنتاج.

```bash
npm run typecheck
npm run test:api       # يتطلب خادماً يعمل وقاعدة مزروعة
npm run test:mobile    # يستخدم Microsoft Edge المثبت، أو BROWSER_CHANNEL=chrome
```

## النشر على الإنتاج

1. أنشئ الموارد، وضع المعرّفين الناتجين مكان الأصفار في `wrangler.jsonc`:

   ```bash
   npx wrangler d1 create ahbab-db
   npx wrangler kv namespace create CACHE
   npx wrangler r2 bucket create ahbab-files
   ```

2. أضف الأسرار، كل واحد بقيمة مختلفة من `openssl rand -base64 32`:

   ```bash
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put DATA_KEY
   npx wrangler secret put BLIND_KEY
   ```

   **احفظ `DATA_KEY` و`BLIND_KEY` في خزنة خارج Cloudflare.** ضياع `DATA_KEY` يعني فقدان أرقام الهوية والوصفات والصور والنسخ الاحتياطية نهائياً، ولا توجد طريقة لاستعادتها.

3. طبّق القاعدة وأنشئ أول مدير وانشر:

   ```bash
   npm run db:migrate:remote
   ADMIN_PASSWORD='كلمة-مرور-قوية' node scripts/create-admin.mjs admin "اسم المدير"
   npx wrangler d1 execute ahbab-db --remote --file scripts/out/admin.sql
   rm scripts/out/admin.sql
   npm run deploy
   ```

4. اربط **نطاقاً مخصصاً** بالـ Worker. ذاكرة Cache API لا تعمل على `workers.dev`، فيبقى التطبيق سليماً لكن كل طلب للداشبورد يقرأ من D1.

5. استخدم خطة Workers Paid. المهمة الشهرية للنسخ الاحتياطي تتجاوز حد الطلبات الفرعية في الخطة المجانية.

6. اضبط العملة من `CURRENCY` في `wrangler.jsonc` (القيمة الحالية `د.ع`).

## النسخ الاحتياطي والاستعادة

- **D1 Time Travel:** تلقائي، ويعيد القاعدة إلى أي دقيقة ضمن 30 يوماً: `npx wrangler d1 time-travel restore ahbab-db --timestamp=<وقت>`.
- **التصدير الشهري:** يعمل في اليوم الأول من كل شهر الساعة 01:00 UTC، ويكتب ملفات NDJSON مضغوطة ومشفّرة إلى `backups/<التاريخ>/` في R2، ثم تبدأ الأرشفة بعده.

```bash
npx wrangler r2 object get ahbab-files/backups/<التاريخ>/<الملف> --remote --file part.enc
DATA_KEY=... node scripts/decrypt-backup.mjs part.enc > part.ndjson
```
