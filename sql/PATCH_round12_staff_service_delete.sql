-- =============================================================================
-- PATCH (round-12): XODIM VA XIZMATNI BUTUNLAY O'CHIRISH (DELETE) HUQUQI.
--
-- NIMA UCHUN: round-11 patch'da masters/services jadvallariga faqat
-- INSERT/UPDATE policy qo'shilgan edi (hard-delete ataylab qilinmagan,
-- soft-delete/"active" bilan cheklangan edi). Endi admin panelda xodim va
-- xizmat kartochkalarida "O'chirish" tugmasi qo'shildi — bu DELETE
-- so'rovi RLS tomonidan bloklanmasligi uchun quyidagi policy'lar zarur.
--
-- MUHIM: agar shu xodim/xizmatga tegishli bronlar mavjud bo'lsa,
-- bookings.master_id / service_id FK cheklovi (agar mavjud bo'lsa)
-- o'chirishga to'sqinlik qilishi mumkin — bu ataylab shunday, admin panel
-- bunday holatda "Nofaol qiling" deb xabar beradi.
--
-- Ishga tushirish: Supabase Dashboard -> SQL Editor -> shu faylning
-- to'liq kodini qo'ying -> Run. Idempotent.
-- =============================================================================

drop policy if exists "masters: admin o'chiradi" on masters;
create policy "masters: admin o'chiradi" on masters
  for delete to authenticated using (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

drop policy if exists "services: admin o'chiradi" on services;
create policy "services: admin o'chiradi" on services
  for delete to authenticated using (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

-- Tekshirish uchun:
--   select policyname, cmd from pg_policies where tablename in ('masters','services');
-- =============================================================================
