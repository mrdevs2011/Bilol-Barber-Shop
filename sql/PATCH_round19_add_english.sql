-- =============================================================================
-- INGLIZ TILINI QO'SHISH (uz/ru dan keyin uchinchi til) — round 19
--
-- Bu patch sayt endi UZ/RU bilan bir qatorda EN tilini ham qo'llab-quvvatlashi
-- uchun kerak bo'lgan bazadagi o'zgarishlarni qo'shadi. Frontend tarafidagi
-- o'zgarishlar (js/i18n.js, js/data.js, index.html) allaqachon EN'ga tayyor —
-- shu SQL faylni Supabase SQL Editor'da BIR MARTA ishga tushirgach, katalog
-- (xizmat/barber) va bron (booking) darajasida ham EN to'liq ishlaydi.
--
-- 1) services / masters jadvallariga name_ru/description_ru bilan bir xil
--    naqshda name_en/description_en ustunlari qo'shiladi (PATCH_round17ga
--    o'xshab). Bular ixtiyoriy — bo'sh qoldirilsa, sayt avtomatik ravishda
--    asosiy (uz) matnga qaytadi (js/data.js -> pickLang()).
-- 2) bookings.client_lang ustunidagi CHECK cheklovi 'en' qiymatini ham
--    qabul qilishi uchun yangilanadi (PATCH_round16 bilan qo'shilgan edi) —
--    aks holda ingliz tilini tanlagan mijoz bron yuborganda xatolik oladi.
--
-- HOLATI: bu patch Supabase SQL Editor'da allaqachon ishga tushirilgan
-- (loyihaga fayl sifatida keyinroq qo'shildi — boshqa patch fayllar bilan
-- birga arxivda saqlanishi va kelajakda boshqa muhitga joylashtirishda
-- qayta ishlatilishi uchun).
-- =============================================================================

alter table services
  add column if not exists name_en text,
  add column if not exists description_en text;

alter table masters
  add column if not exists name_en text,
  add column if not exists description_en text;

comment on column services.name_en is
  'Xizmat nomining inglizcha varianti (ixtiyoriy) — bo''sh bo''lsa saytda asosiy (uz) nom ko''rsatiladi.';
comment on column services.description_en is
  'Xizmat tavsifining inglizcha varianti (ixtiyoriy) — bo''sh bo''lsa saytda asosiy (uz) tavsif ko''rsatiladi.';
comment on column masters.name_en is
  'Barber ismining inglizcha varianti (ixtiyoriy) — bo''sh bo''lsa saytda asosiy (uz) ism ko''rsatiladi.';
comment on column masters.description_en is
  'Barber tavsifining inglizcha varianti (ixtiyoriy) — bo''sh bo''lsa saytda asosiy (uz) tavsif ko''rsatiladi.';

-- CHECK cheklovni yangilash uchun avval eskisini o'chirish kerak (Postgres'da
-- CHECK to'g'ridan-to'g'ri o'zgartirilmaydi). Cheklov nomi PATCH_round16'da
-- avtomatik berilgan standart nom bo'lishi mumkin — shu sabab nomi bo'yicha
-- emas, ustun ta'rifi orqali qidiramiz va universal usulda qayta yaratamiz.
alter table bookings
  drop constraint if exists bookings_client_lang_check;
alter table bookings
  add constraint bookings_client_lang_check
    check (client_lang in ('uz', 'ru', 'en'));
