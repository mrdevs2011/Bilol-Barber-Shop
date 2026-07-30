-- =============================================================================
-- PATCH (round-11): ADMIN PANELDAN XODIMLAR (barberlar) VA XIZMATLARNI
-- BOSHQARISH (qo'shish / tahrirlash / faol-nofaol qilish).
--
-- NIMA UCHUN: hozirgacha masters/services jadvallariga faqat SQL Editor
-- orqali qo'lda yozuv qo'shish mumkin edi (PATCH_round4, round6 va
-- catalog_validation_and_limits.sql'dagi INSERT'lar). Endi admin panelning
-- o'zidan (login qilingan holda) xodim/xizmat qo'sha, tahrirlay va
-- faollik holatini o'zgartira oladi.
--
-- BU FAYL 3 QISMDAN IBORAT:
--   1) masters/services jadvallariga yangi ustunlar (rasm, tavsif).
--   2) admin uchun INSERT/UPDATE huquqi beruvchi RLS policylar (faqat
--      admins jadvalida ro'yxatdan o'tgan foydalanuvchi uchun — anon yoki
--      oddiy mijoz HECH QACHON xodim/xizmat qo'sha olmaydi).
--   3) xodim rasmlari uchun PUBLIC (hammaga ochiq o'qish, faqat admin
--      yozadigan) "staff-photos" storage bucket.
--
-- MUHIM: hard DELETE ataylab QILINMAYDI — chunki bookings.master_id /
-- service_id jadvalga bog'liq (garchi haqiqiy FK bo'lmasa ham) va eski
-- bronlar tarixi buzilib qolishi mumkin. Buning o'rniga faqat "active"
-- ustuni orqali faollik/nofaollik boshqariladi (soft-delete).
--
-- Ishga tushirish: Supabase Dashboard -> SQL Editor -> shu faylning
-- to'liq kodini qo'ying -> Run. Idempotent.
-- =============================================================================

-- 1) YANGI USTUNLAR -----------------------------------------------------------
alter table masters add column if not exists photo_url text;
alter table masters add column if not exists description text;

alter table services add column if not exists description text;

-- 2) ADMIN UCHUN YOZISH HUQUQI (RLS) ------------------------------------------
-- MUHIM: "select" policylari (services/masters: hammaga o'qish) ALLAQACHON
-- mavjud (sql/catalog_validation_and_limits.sql) — bu yerda ularga
-- tegilmaydi, faqat INSERT/UPDATE qo'shiladi.

drop policy if exists "masters: admin qo'shadi" on masters;
create policy "masters: admin qo'shadi" on masters
  for insert to authenticated with check (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

drop policy if exists "masters: admin yangilaydi" on masters;
create policy "masters: admin yangilaydi" on masters
  for update to authenticated using (
    exists (select 1 from admins a where a.user_id = auth.uid())
  ) with check (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

drop policy if exists "services: admin qo'shadi" on services;
create policy "services: admin qo'shadi" on services
  for insert to authenticated with check (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

drop policy if exists "services: admin yangilaydi" on services;
create policy "services: admin yangilaydi" on services
  for update to authenticated using (
    exists (select 1 from admins a where a.user_id = auth.uid())
  ) with check (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

-- 3) XODIM RASMLARI UCHUN STORAGE BUCKET --------------------------------------
-- PUBLIC bucket — mijozlar (anon) saytda xodim rasmini ko'rishi kerak,
-- shuning uchun "tickets" bucketidan farqli, bu yerda public=true.
insert into storage.buckets (id, name, public)
values ('staff-photos', 'staff-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "staff-photos: admin yuklaydi" on storage.objects;
create policy "staff-photos: admin yuklaydi" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'staff-photos'
    and exists (select 1 from admins a where a.user_id = auth.uid())
  );

drop policy if exists "staff-photos: admin yangilaydi" on storage.objects;
create policy "staff-photos: admin yangilaydi" on storage.objects
  for update to authenticated using (
    bucket_id = 'staff-photos'
    and exists (select 1 from admins a where a.user_id = auth.uid())
  ) with check (
    bucket_id = 'staff-photos'
    and exists (select 1 from admins a where a.user_id = auth.uid())
  );

drop policy if exists "staff-photos: admin o'chiradi" on storage.objects;
create policy "staff-photos: admin o'chiradi" on storage.objects
  for delete to authenticated using (
    bucket_id = 'staff-photos'
    and exists (select 1 from admins a where a.user_id = auth.uid())
  );

-- Tekshirish uchun:
--   select column_name from information_schema.columns where table_name = 'masters';
--   select policyname, cmd from pg_policies where tablename in ('masters','services');
--   select id, public from storage.buckets where id = 'staff-photos';
-- =============================================================================
