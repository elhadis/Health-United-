# Smart Pharmacy & Warehouse Management System

نظام صيدلية ومستودع متكامل (Offline-First) مبني بـ **Next.js App Router** + **Prisma/Neon** + **Dexie.js**.

## الميزات

- نقطة بيع سريعة (POS) مع سعر بيع يدوي ودعم الوحدات
- مخزون المستودع بالدفعات والصلاحية (بشري / بيطري)
- مسار طلبات: Pending → Approved → Dispatched → Confirmed
- تقارير مبيعات وأرباح مع رسوم بيانية
- عمل دون اتصال عبر IndexedDB ومزامنة تلقائية عند عودة الشبكة
- واجهة عربية RTL بخط Cairo

## التشغيل السريع

```bash
npm install
cp .env.example .env
# ضع رابط Neon PostgreSQL في DATABASE_URL
npx prisma db push
npm run db:seed
npm run dev
```

افتح [http://localhost:3000](http://localhost:3000)

> بدون اتصال Neon يعمل النظام بوضع **Demo** ببيانات محلية عبر الـ API.

## الصفحات

| المسار | الوظيفة |
|--------|---------|
| `/` | لوحة التحكم |
| `/pos` | نقطة البيع |
| `/warehouse` | إدارة المستودع |
| `/orders` | الطلبات والتحويلات |
| `/reports` | التقارير والأرباح |

## API

- `POST /api/sync` — مزامنة المبيعات دون اتصال
- `GET|POST /api/sales`
- `GET|POST /api/products`
- `GET|POST|PATCH /api/orders`
- `GET /api/analytics`

## الأدوار (RBAC)

- **ADMINISTRATOR** — تحكم كامل
- **ADMIN** — مدير فرع/مستودع
- **USER** — كاشير صيدلية
