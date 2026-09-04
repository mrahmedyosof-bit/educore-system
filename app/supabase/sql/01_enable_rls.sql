-- ============================================================
-- EduCore CMS — الخطوة 1: تفعيل RLS وحماية الجداول
-- ------------------------------------------------------------
-- خطوات التطبيق بالترتيب:
--
-- 1) أنشئ مستخدم الأدمن من لوحة Supabase:
--    Dashboard > Authentication > Users > Add user
--    (أدخل البريد وكلمة المرور، وعلّم "Auto Confirm User")
--
-- 2) نفّذ هذا السكريبت كاملاً في:
--    Dashboard > SQL Editor > New query
--
-- ملاحظة مهمة: بعد تنفيذ السكريبت، لن يستطيع أي شخص غير مسجّل
-- الدخول قراءة أو تعديل أي بيانات عبر الـ API مباشرة.
--
-- هذه النسخة آمنة لإعادة التشغيل (drop if exists + create).
-- ============================================================

alter table public.students    enable row level security;
alter table public.attendance  enable row level security;
alter table public.grades      enable row level security;
alter table public.payments    enable row level security;

drop policy if exists "authenticated_full_access_students"
  on public.students;
create policy "authenticated_full_access_students"
  on public.students for all to authenticated
  using (true) with check (true);

drop policy if exists "authenticated_full_access_attendance"
  on public.attendance;
create policy "authenticated_full_access_attendance"
  on public.attendance for all to authenticated
  using (true) with check (true);

drop policy if exists "authenticated_full_access_grades"
  on public.grades;
create policy "authenticated_full_access_grades"
  on public.grades for all to authenticated
  using (true) with check (true);

drop policy if exists "authenticated_full_access_payments"
  on public.payments;
create policy "authenticated_full_access_payments"
  on public.payments for all to authenticated
  using (true) with check (true);
