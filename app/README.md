# EduCore CMS — نظام إدارة المركز التعليمي

نظام إدارة مراكز الدروس والتعليم بالعربية (RTL) مبني على Next.js 16 + Supabase.

## المميزات

- 📊 **لوحة تحكم**: إحصائيات حية (الطلاب، المحصل، الديون، حضور اليوم حسب المجموعة)
- 👨‍🎓 **إدارة الطلاب**: CRUD كامل مع بيانات ولي الأمر، فلاتر ديناميكية، بحث، بطاقة QR للطباعة، تصدير Excel/PDF
- 📸 **الحضور بالباركود**: تسجيل حضور بمسح كود QR أو يدوياً، مع منع التكرار
- 💰 **المالية**: تسجيل الاشتراكات والتحصيلات وسجل كامل بالعمليات
- 📝 **الدرجات**: رصد درجات الاختبارات + كاشف التعثر الدراسي
- 📈 **التقارير**: إحصائيات حقيقية من قاعدة البيانات
- ⚙️ **إعدادات النظام**: إدارة المراحل/الصفوف/المواد محفوظة في قاعدة البيانات
- 🔐 **مصادقة**: تسجيل دخول + RLS على مستوى قاعدة البيانات

## التشغيل

```bash
cd app
npm install
npm run dev
```

ثم افتح http://localhost:3000 — أو استخدم `start-educore.bat` في المجلد الرئيسي (دبل كليك).

## الإعداد الأولي

1. أنشئ ملف `app/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=<رابط مشروعك>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<مفتاح anon>
```

2. أنشئ مستخدم الأدمن من: Supabase Dashboard > Authentication > Users > Add user (مع ✅ Auto Confirm User)

3. نفّذ سكريبتات SQL بالترتيب من `app/supabase/sql/`:
   - `01_enable_rls.sql` — حماية الجداول (مستخدم مسجل فقط)
   - `02_app_settings.sql` — جدول إعدادات المراحل/الصفوف/المواد
   - `03_attendance_unique.sql` — منع تكرار الحضور (اختياري)
   - `09_student_name_subject_group_unique.sql` — نفس الاسم مسموح في مادة/مجموعة مختلفة

## التقنيات

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Supabase (Auth + Postgres + RLS) · html5-qrcode · jspdf + html2canvas-pro · xlsx

## بنية المشروع

```
app/
├── app/              # صفحات Next.js (layout + page)
├── components/       # التابات والمكونات + Auth/App Context
├── hooks/            # useCurriculumSettings
├── lib/
│   ├── services/     # طبقة الوصول لـ Supabase (students, attendance, grades, payments, settings)
│   ├── supabase.ts   # عميل Supabase
│   ├── calculations.ts
│   └── exportUtils.ts
├── supabase/sql/     # سكريبتات الإعداد
└── types/            # أنواع قاعدة البيانات
```
