-- =============================================================================
-- PATCH (round-4): yangi 4 ta barberni "masters" katalog jadvaliga qo'shish.
--
-- SABAB: js/data.js dagi MASTERS ro'yxatiga 4 ta yangi barber (id: barber2,
-- barber3, barber4, barber5) qo'shildi. Lekin sql/catalog_validation_and_limits.sql
-- dagi validate_booking_against_catalog() trigger'i faqat "masters" jadvalida
-- ro'yxatdan o'tgan (active=true) barberlarga bron qilishga ruxsat beradi.
-- Shu jadvalga qo'shmasak, yangi barberlarga bron qilishga urinish
-- "Noto'g'ri yoki mavjud bo'lmagan barber" xatosi bilan rad etiladi.
--
-- Ishga tushirish: Supabase Dashboard -> SQL Editor -> shu faylning to'liq
-- kodini qo'ying -> Run. Idempotent (on conflict do update).
-- =============================================================================

insert into masters (id, name) values
  ('barber2', '1-barber'),
  ('barber3', '2-barber'),
  ('barber4', '3-barber'),
  ('barber5', '4-barber')
on conflict (id) do update set name = excluded.name;

-- Tekshirish uchun:
--   select * from masters order by id;
-- =============================================================================
