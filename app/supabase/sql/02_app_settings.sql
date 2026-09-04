-- ============================================================
-- EduCore CMS — الخطوة 2: جدول إعدادات النظام (المراحل/الصفوف/المواد)
-- نفّذه في: Dashboard > SQL Editor
--
-- هذه النسخة آمنة لإعادة التشغيل.
-- ============================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "authenticated_full_access_app_settings"
  on public.app_settings;
create policy "authenticated_full_access_app_settings"
  on public.app_settings for all to authenticated
  using (true) with check (true);
