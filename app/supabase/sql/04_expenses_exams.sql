-- ============================================================
-- EduCore CMS — الخطوة 4: جدولا المصروفات والاختبارات
-- نفّذه في: Dashboard > SQL Editor
--
-- ينشئ:
--   1) public.expenses  (الخزينة والمصروفات)
--   2) public.exams     (تعريفات الاختبارات)
-- ويضيف عمود exam_id لجدول grades الموجود لربط الدرجات باختبار محدد.
--
-- هذه النسخة آمنة لإعادة التشغيل.
-- ============================================================

-- ---------- 1) جدول المصروفات ----------
create table if not exists public.expenses (
  id         bigint generated always as identity primary key,
  title      text not null,
  amount     numeric not null,
  category   text not null default 'أخرى',
  date       date not null default current_date,
  notes      text,
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

drop policy if exists "authenticated_full_access_expenses"
  on public.expenses;
create policy "authenticated_full_access_expenses"
  on public.expenses for all to authenticated
  using (true) with check (true);

-- ---------- 2) جدول الاختبارات ----------
create table if not exists public.exams (
  id         bigint generated always as identity primary key,
  title      text not null,
  subject    text,
  stage      text,
  max_score  numeric not null default 100,
  exam_date  date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.exams enable row level security;

drop policy if exists "authenticated_full_access_exams"
  on public.exams;
create policy "authenticated_full_access_exams"
  on public.exams for all to authenticated
  using (true) with check (true);

-- ---------- 3) ربط درجات الطلاب بالاختبار ----------
alter table public.grades add column if not exists exam_id bigint;
