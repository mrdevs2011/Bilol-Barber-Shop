-- =============================================================================
-- "tickets" STORAGE BUCKET — TUZATILGAN VERSIYA (xavfsizlik auditidan keyin)
--
-- OLDINGI MUAMMO (H-1, YUQORI DARAJA):
--   Bucket public=true edi va "anon" (login qilinmagan) foydalanuvchi hech
--   qanday egalik tekshiruvisiz istalgan faylni yozishi/o'qishi mumkin edi.
--   Fayl nomlari (booking-<id>.png) ketma-ket sonlar bo'lgani uchun,
--   HAR KIM booking-1.png, booking-2.png, ... deb sanab, barcha mijozlarning
--   ismi va telefon raqamini (rasm ichida yozilgan) yuklab olishi mumkin edi.
--   Bundan tashqari, anon UPDATE huquqi tufayli boshqa mijozning rasmini
--   qayta yozib (deface) qo'yish ham mumkin edi.
--
-- YECHIM:
--   1) Bucket PRIVATE qilinadi (public=false).
--   2) Yozish (INSERT/UPDATE) FAQAT authenticated foydalanuvchiga, va FAQAT
--      o'ZINING bronigagina tegishli fayl nomi uchun ruxsat beriladi —
--      buni bookings jadvali bilan bog'lab tekshiramiz (user_id = auth.uid()).
--   3) O'qish (SELECT) ham xuddi shunday — faqat o'z bronini yoki admin
--      hammasini ko'ra oladi.
--   4) Telegram Edge Function (send-reminders/telegram-webhook) rasimni
--      SERVICE ROLE kaliti bilan o'qiydi — service role RLS'ni chetlab
--      o'tadi, shuning uchun bucket private bo'lsa ham funksiya ishlayveradi.
-- =============================================================================

-- 1) Bucket'ni PRIVATE qilamiz
insert into storage.buckets (id, name, public)
values ('tickets', 'tickets', false)
on conflict (id) do update set public = false;

-- 2) Eski, xavfli policy'larni butunlay olib tashlaymiz
drop policy if exists "tickets: anon upload" on storage.objects;
drop policy if exists "tickets: anon upsert" on storage.objects;
drop policy if exists "tickets: public read" on storage.objects;

-- 3) YUKLASH (INSERT): faqat authenticated, va faqat fayl nomi
--    ("booking-<id>.png") aynan shu foydalanuvchiga tegishli bron bilan
--    mos kelsa.
drop policy if exists "tickets: owner upload" on storage.objects;
create policy "tickets: owner upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tickets'
    and exists (
      select 1 from bookings b
      where b.user_id = auth.uid()
        and storage.objects.name = 'booking-' || b.id || '.png'
    )
  );

-- 4) QAYTA YOZISH (UPDATE/upsert): xuddi shu qoida
drop policy if exists "tickets: owner upsert" on storage.objects;
create policy "tickets: owner upsert"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'tickets'
    and exists (
      select 1 from bookings b
      where b.user_id = auth.uid()
        and storage.objects.name = 'booking-' || b.id || '.png'
    )
  )
  with check (
    bucket_id = 'tickets'
    and exists (
      select 1 from bookings b
      where b.user_id = auth.uid()
        and storage.objects.name = 'booking-' || b.id || '.png'
    )
  );

-- 5) O'QISH (SELECT): o'zining bron rasmini yoki admin — hammasini
drop policy if exists "tickets: owner or admin read" on storage.objects;
create policy "tickets: owner or admin read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'tickets'
    and (
      exists (
        select 1 from bookings b
        where b.user_id = auth.uid()
          and storage.objects.name = 'booking-' || b.id || '.png'
      )
      or exists (select 1 from admins a where a.user_id = auth.uid())
    )
  );

-- Tekshirish uchun:
--   select id, public from storage.buckets where id = 'tickets';
--   select policyname, cmd, roles from pg_policies
--     where schemaname = 'storage' and tablename = 'objects';
