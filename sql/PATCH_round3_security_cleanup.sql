-- =============================================================================
-- PATCH (audit round-3): xavfsizlik tozalash.
--
-- KONTEKST: Bu fayl avval CLAUDE_CODE_FIXLAR.md hujjatida "allaqachon
-- tayyor" deb ta'riflangan edi, lekin repo ichida haqiqatda mavjud emas
-- edi. Quyidagi tuzatish Claude tomonidan repo'ni to'liq tekshirib
-- chiqqandan keyin YOZILDI (audit hujjatidagi barcha 4 band emas, faqat
-- haqiqatda tasdiqlangan muammo):
--
--   1) "Allow authenticated select" policy (bookings) — ESKIRGAN, XAVFLI.
--      sql/schema.sql da yaratiladi (using(true) — har qanday login qilgan
--      foydalanuvchi BARCHA bronlarni, jumladan boshqa mijozlarning
--      ism/telefon raqamini ko'ra oladi). sql/auth_and_noshow.sql bu
--      policy'ni allaqachon o'chirib, tor policy ("O'qish: o'zi yoki
--      admin") bilan almashtiradi — LEKIN agar kimdir kelajakda
--      schema.sql'ni auth_and_noshow.sql'dan KEYIN qayta ishga tushirsa,
--      xavfli policy qaytadan tiklanadi. Xuddi shu muammo "Allow
--      authenticated update/delete" policylarida ham bor.
--
--   2) send_booking_reminders() funksiyasi va undagi ochiq bot tokeni —
--      TEKSHIRILDI, kodda (js/*.js, admin/*.js, sql/*.sql) hech qanday
--      bog'liqlik topilmadi, funksiya allaqachon mavjud emas. Bu faylda
--      hech narsa qilinmaydi.
--
--   3) booked_slots view huquqlari — TEKSHIRILDI, js/api.js (fetchBookedSlots)
--      aynan shu view'dan anon sifatida o'qiydi va bu ATAYLAB shunday
--      loyihalashtirilgan (PII'siz, faqat band vaqtlar). CHEKLANMAYDI —
--      cheklansa ommaviy bron sahifasi ishlamay qoladi.
--
--   4) Dublikat index — TEKSHIRILDI, topilmadi.
--
-- Ishga tushirish: Supabase Dashboard -> SQL Editor -> shu faylning
-- to'liq kodini qo'ying -> Run. Idempotent — istalgan tartibda va necha
-- marta ishga tushirish xavfsiz.
-- =============================================================================

-- Xavfli, keng huquqli eski policylarni butunlay olib tashlaymiz (agar
-- hali mavjud bo'lsa — masalan hali auth_and_noshow.sql ishga
-- tushirilmagan loyihalarda).
drop policy if exists "Allow authenticated select" on bookings;
drop policy if exists "Allow authenticated update" on bookings;
drop policy if exists "Allow authenticated delete" on bookings;

-- MUHIM: bu policylarni O'RNIGA HECH NARSA YARATMAYMIZ — chunki
-- auth_and_noshow.sql allaqachon to'g'ri, tor policylarni ("O'qish: o'zi
-- yoki admin", "Yangilash: faqat admin", "O'chirish: faqat admin")
-- ta'minlaydi. Agar sizning loyihangizda auth_and_noshow.sql hali ISHGA
-- TUSHIRILMAGAN bo'lsa — bookings jadvaliga SELECT/UPDATE/DELETE huquqi
-- umuman qolmaydi (faqat admin panel emas, sayt ham SELECT qila
-- olmaydi). Shu sabab BU PATCH'NI sql/auth_and_noshow.sql BILAN BIRGA
-- (undan keyin) ishga tushiring, aks holda admin panel ishlamay qoladi.

-- Tekshirish uchun (faqat auth_and_noshow.sql'dagi tor policylar
-- qolganini tasdiqlaydi):
--   select policyname, cmd, roles from pg_policies
--   where schemaname = 'public' and tablename = 'bookings';
-- =============================================================================
