-- =============================================================================
-- MASTERS KATALOGINI js/data.js BILAN SINXRONLASH
--
-- MUHIM: agar sql/catalog_validation_and_limits.sql ishga tushirilgan
-- bo'lsa, `masters` jadvalida FAQAT 'alisher' bor edi — lekin js/data.js
-- (frontend) haqiqatda barber2/barber3/barber4/barber5 ID'lari bilan
-- ishlaydi. Bu holatda validate_booking_against_catalog() trigger HAR
-- QANDAY bronni "Noto'g'ri yoki mavjud bo'lmagan barber" xatosi bilan rad
-- etadi — ya'ni sayt bron qabul qilolmay qoladi.
--
-- Bu faylni ishga tushirish xavfsiz: agar `masters` jadvali umuman mavjud
-- bo'lmasa (catalog_validation_and_limits.sql hali qo'llanilmagan bo'lsa),
-- quyidagi buyruq xato beradi — bu holatda hech narsa qilish shart emas,
-- eski (validatsiyasiz) tizim ishlab turibdi.
-- =============================================================================

insert into masters (id, name) values
  ('barber2', 'Barber 1'),
  ('barber3', 'Barber 2'),
  ('barber4', 'Barber 3'),
  ('barber5', 'Barber 4')
on conflict (id) do update set name = excluded.name, active = true;

-- Namunaviy/eski yozuvni o'chirmaymiz (unga bog'liq eski bronlar bo'lishi
-- mumkin, FK/tarix buzilib qolmasligi uchun), faqat faolsizlantiramiz —
-- shunda yangi bronlarda tanlab bo'lmaydi, lekin eski tarix saqlanadi.
update masters set active = false where id = 'alisher';

-- Tekshirish uchun — bu yerda aynan barber2..barber5 active=true bo'lib
-- ko'rinishi kerak:
--   select id, name, active from masters order by id;
