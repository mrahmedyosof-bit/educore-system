-- ============================================================
-- EduCore CMS — الخطوة 7: مخزون الملزمات والكتب
-- نفّذه في: Dashboard > SQL Editor
--
-- جدول materials:
--   name        اسم الملزمة
--   grade       الصف التابع له
--   subject     المادة
--   price       سعر البيع للقطعة
--   quantity    الكمية المتاحة بالمخزن
--   low_stock   حد التنبيه عند النقص (افتراضي 5)
--
-- آمن لإعادة التشغيل.
-- ============================================================

create table if not exists public.materials (
  id         bigint generated always as identity primary key,
  name       text not null,
  grade      text,
  subject    text,
  price      numeric not null default 0,
  quantity   integer not null default 0,
  low_stock  integer not null default 5,
  created_at timestamptz not null default now()
);

alter table public.materials enable row level security;

drop policy if exists "authenticated_full_access_materials" on public.materials;
create policy "authenticated_full_access_materials"
  on public.materials for all to authenticated
  using (true) with check (true);
