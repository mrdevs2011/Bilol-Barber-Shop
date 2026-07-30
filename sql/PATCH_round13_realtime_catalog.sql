-- =============================================================================
-- PATCH (round-13): XODIM/XIZMAT O'ZGARISHLARINI REALTIME QILISH.
--
-- NIMA UCHUN: admin panelda xodim yoki xizmat qo'shilsa, tahrirlansa,
-- o'chirilsa yoki faol/nofaol qilinsa — bu o'zgarish endi HAM asosiy
-- saytda (mijozlar ko'radigan qism), HAM boshqa ochiq admin oynalarida
-- sahifani yangilamasdan (F5 bosmasdan) darhol ko'rinishi kerak.
--
-- Buning uchun kod tomoni (js/main.js, admin/admin.js) allaqachon
-- Supabase Realtime kanaliga ulangan — lekin bu FAQAT "masters" va
-- "services" jadvallari uchun Realtime YOQILGAN bo'lsagina ishlaydi.
-- "bookings" jadvali uchun bu allaqachon yoqilgan edi; bu yerda xuddi
-- shu narsa "masters" va "services" uchun qo'shiladi.
--
-- Ishga tushirish: Supabase Dashboard -> SQL Editor -> shu faylning
-- to'liq kodini qo'ying -> Run. Idempotent (qayta ishga tushirsa ham
-- xato bermaydi).
--
-- MUQOBIL YO'L (agar SQL orqali xato chiqsa): Supabase Dashboard ->
-- Database -> Replication -> "supabase_realtime" ro'yxatida "masters"
-- va "services" katakchalarini yoqing.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'masters'
  ) then
    alter publication supabase_realtime add table masters;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'services'
  ) then
    alter publication supabase_realtime add table services;
  end if;
end $$;

-- Tekshirish uchun:
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
-- ("masters", "services" va "bookings" ro'yxatda bo'lishi kerak)
-- =============================================================================
