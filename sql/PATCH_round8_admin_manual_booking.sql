-- =============================================================================
-- ADMIN TOMONIDAN QO'LDA BRON QO'SHISH
--
-- NIMA UCHUN: hozirgi holatda mijoz telefon orqali qo'ng'iroq qilib bron
-- qilmoqchi bo'lsa, admin buni saytga kirita olmaydi — chunki bookings
-- jadvaliga INSERT qilish huquqi faqat "Mijoz: o'ziga va bloklanmagan
-- bo'lsa bron qiladi" siyosati orqali beriladi (sql/auth_and_noshow.sql),
-- u esa auth.uid() = user_id shartini talab qiladi. Admin login qilgan
-- bo'lsa ham, telefon mijozi uchun bron kiritmoqchi bo'lganda uning
-- user_id'si YO'Q (mijoz saytda ro'yxatdan o'tmagan) — shu sabab bu
-- siyosat inserti rad etadi. Natijada: mijoz telefonda "band emas" deb
-- eshitadi, lekin admin buni saytga kiritolmagani uchun keyinroq kimdir
-- xuddi shu vaqtga onlaynda yozilib qolishi (to'qnashuv) xavfi bor edi.
--
-- YECHIM: adminlar uchun alohida, keng INSERT siyosati — user_id NULL
-- (yoki istalgan qiymat) bo'lsa ham ruxsat beradi, lekin FAQAT admins
-- jadvalida ro'yxatdan o'tgan foydalanuvchiga.
--
-- MUHIM: bu siyosat mavjud "Mijoz: ..." siyosatini ALMASHTIRMAYDI — RLS'da
-- bir nechta permissive INSERT siyosati OR mantig'i bilan ishlaydi, ya'ni
-- oddiy mijozlar hamon avvalgidek faqat o'ziga bron qila oladi, admin esa
-- QO'SHIMCHA ravishda istalgan mijoz nomidan ham bron yarata oladi.
--
-- E'TIBOR: katalog validatsiyasi (narx/davomiylik/xizmat/barber mosligi),
-- davomiylikni hisobga oluvchi to'qnashuv tekshiruvi va master_time_off
-- (bandlik) trigger'lari — bularning barchasi allaqachon "before insert"
-- trigger sifatida ishlaydi va KIM insert qilishidan qat'iy nazar (admin
-- bo'lsa ham) avtomatik tatbiq bo'ladi. Ya'ni admin ham band vaqtga yoki
-- ustaning dam olish kuniga bron kirita olmaydi — bu yerda qayta yozish
-- shart emas.
-- =============================================================================

drop policy if exists "Admin: mijoz nomidan qo'lda bron qo'shadi" on bookings;
create policy "Admin: mijoz nomidan qo'lda bron qo'shadi" on bookings
  for insert to authenticated with check (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

-- Tekshirish uchun (admin sifatida kirib, telefon mijozi uchun bron
-- qo'shib ko'ring — user_id ustuni bo'sh qoladi, bu normal, chunki mijoz
-- saytda ro'yxatdan o'tmagan):
--   select id, client_name, client_phone, user_id, status from bookings
--   order by id desc limit 5;
