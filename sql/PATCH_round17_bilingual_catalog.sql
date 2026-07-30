-- =============================================================================
-- KATALOG UCHUN IKKINCHI TIL (name_ru) — 2-bosqich
--
-- MUAMMO (1-bosqich audit davomida topilgan): `services` va `masters`
-- jadvallarida nom/tavsif faqat BITTA ustunda ("name", "description")
-- saqlanadi va u har doim o'zbek tilida kiritiladi. Natijada sayt
-- interfeysi RU rejimiga o'tkazilganda ham xizmat nomlari ("Oddiy soch
-- kesish") va barber ismlari tarjima qilinmay, xom o'zbekcha ko'rinardi.
--
-- YECHIM: har bir jadvalga ixtiyoriy *_ru ustunlar qo'shamiz. Bo'sh
-- qoldirilsa (admin hali RU nomini kiritmagan bo'lsa), frontend avtomatik
-- asosiy (uz) nomga qaytadi (js/data.js -> pickLang()) — sayt hech qachon
-- bo'sh matn ko'rsatmaydi.
-- =============================================================================

alter table services
  add column if not exists name_ru text,
  add column if not exists description_ru text;

alter table masters
  add column if not exists name_ru text,
  add column if not exists description_ru text;

comment on column services.name_ru is
  'Xizmat nomining ruscha tarjimasi. Bo''sh bo''lsa, RU foydalanuvchiga ham "name" (uz) ko''rsatiladi.';
comment on column services.description_ru is
  'Xizmat tavsifining ruscha tarjimasi (ixtiyoriy).';
comment on column masters.name_ru is
  'Barber ismining ruscha yozilishi (masalan, "Алишер Юсупов"). Bo''sh bo''lsa "name" (uz) ko''rsatiladi.';
comment on column masters.description_ru is
  'Barber tavsifi/mutaxassisligining ruscha tarjimasi (ixtiyoriy).';
