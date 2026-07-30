-- =============================================================================
-- AVTOMATIK "KELMADI" — bron vaqti o'tib, 1 soat ichida admin panelda na
-- "Keldi" na "Kelmadi" bosilmasa, bron avtomatik "no_show" (Kelmadi) deb
-- belgilanadi.
--
-- Bu fayl sql/auth_and_noshow.sql'dagi handle_no_show() trigger'iga
-- tayanadi: o'sha trigger status='no_show' bo'lganda mijozning
-- no_show_count'ini +1 qiladi va 3 taga yetganda avtomatik bloklaydi.
-- Demak bu faylda faqat "status='no_show' qilib UPDATE qilish" kifoya —
-- hisoblash/bloklash logikasi allaqachon mavjud.
--
-- MUHIM: sql/auth_and_noshow.sql avval ishga tushirilgan bo'lishi shart
-- (profiles, admins jadvallari va handle_no_show() trigger'i kerak).
-- =============================================================================

create or replace function public.auto_mark_no_shows()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  now_tashkent timestamp;
begin
  now_tashkent := now() at time zone 'Asia/Tashkent';

  update bookings
  set status = 'no_show'
  where status in ('new', 'confirmed')
    and (booking_date::text || ' ' || booking_time)::timestamp < (now_tashkent - interval '1 hour');
end;
$$;

-- Har 5 daqiqada tekshirib turadigan cron job (bepul, pg_cron Supabase
-- Free tarifida ham mavjud — agar sql/reminders.sql orqali allaqachon
-- yoqilgan bo'lsa, quyidagi "create extension" xavfsiz o'tkazib yuboriladi).
create extension if not exists pg_cron;

select cron.schedule(
  'auto-mark-no-shows',
  '*/5 * * * *',
  $$ select public.auto_mark_no_shows(); $$
);

-- Tekshirish uchun:
--   select public.auto_mark_no_shows();          -- qo'lda bir marta ishga tushirish
--   select * from cron.job where jobname = 'auto-mark-no-shows';
--   select * from cron.job_run_details order by start_time desc limit 10;
--
-- To'xtatish kerak bo'lsa:
--   select cron.unschedule('auto-mark-no-shows');
