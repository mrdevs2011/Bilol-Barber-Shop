-- =============================================================================
-- PATCH round 18 — Telegram eslatma havolasini BIR MARTALIK qilish +
-- mijozning barcha qurilma/Telegram akkauntlariga AVTOMATIK eslatma.
--
-- MUAMMO 1 (havola qayta ishlatilishi mumkin edi):
--   `https://t.me/bilolbarber_navbat_bot?start=b102` havolasi tasdiqlangan
--   bron uchun ham istalgancha marta qayta ochilaverar, bot har safar qayta
--   javob berardi. Bu yerda kimdir eski/tasodifiy booking_id'larni ketma-ket
--   sinab ko'rishi ("replay") mantiqan xush emas.
--
--   YECHIM: bookings.telegram_link_status ustuni ('new' | 'eskirgan').
--   Bot birinchi marta muvaffaqiyatli bog'lasa — darhol 'eskirgan'ga
--   o'tkazadi. Shundan keyin O'SHA booking_id bilan /start yana kelsa —
--   supabase/functions/telegram-webhook/index.ts endi HECH QANDAY xabar
--   yubormaydi (batafsili o'sha fayldagi yangilangan izohga qarang).
--
--   ESLATMA (muhim cheklov): Telegram deep link (t.me/...) bosilganda bu
--   "sahifadagi tugmadanmi yoki brauzer manzil satridan qo'lda kiritilganmi"
--   degan farqni bizning backend'imiz HECH QACHON bilolmaydi — Telegram bu
--   ma'lumotni webhook'ga umuman yubormaydi (Bot API'da bunday maydon yo'q).
--   Shu sabab "faqat tugmadan bosilsa ishlasin" talabini AYNAN shu ko'rinishda
--   bajarib bo'lmaydi — lekin "bir marta ishlatilgach o'ladi" (shu patch)
--   amalda bir xil natijani beradi: haqiqiy mijoz brondan keyin darhol
--   tugmani bosadi, havola shu zahoti "eskirgan" bo'lib qoladi, undan keyin
--   kim URL'ni qayerdan kiritishidan qat'iy nazar hech narsa sodir bo'lmaydi.
--
-- MUAMMO 2 (har safar qaytadan "Start" bosish kerak edi):
--   Mijoz oldingi bronida botga bir marta ulangan bo'lsa ham, keyingi safar
--   yangi bron qilganda яна tugmani bosishi shart edi — aks holda eslatma
--   kelmasdi.
--
--   YECHIM: telegram_subscribers jadvali — mijozning HISOBIGA (auth
--   user_id) bog'langan barcha chat_id'larni saqlaydi (bitta mijozning
--   nechta telefoni/Telegram akkaunti bo'lsa ham — CHEKSIZ). Mijoz botga
--   birinchi marta ulanganda shu yerga yozib qo'yiladi; keyingi barcha
--   bronlarida (hatto "Telegram orqali eslatma oling" tugmasini bosmasa
--   ham) supabase/functions/send-reminders/index.ts endi shu jadvaldan
--   o'qib, mijozning BARCHA ma'lum chat_id'lariga avtomatik eslatma
--   yuboradi. "Telegram orqali eslatma oling" tugmasi baribir ishlab
--   turaveradi — masalan mijoz yangi telefon/Telegram ochsa, shu tugma
--   orqali yangi chat_id ham xuddi shu hisobga qo'shilib boraveradi.
-- =============================================================================

-- 1) Havola holati — har bir bron uchun bitta marta ishlatiladigan bog'lash
--    havolasi.
alter table bookings
  add column if not exists telegram_link_status text not null default 'new'
    check (telegram_link_status in ('new', 'eskirgan'));

comment on column bookings.telegram_link_status is
  'Telegram bog''lash havolasi (t.me/bot?start=bID) holati: new = hali ishlatilmagan, eskirgan = allaqachon bir marta ishlatilgan (qayta ishlatilsa bot javob bermaydi).';

-- Orqaga moslik: allaqachon chat_id bog'langan eski bronlar bor bo'lsa,
-- ularning havolasi ham "eskirgan" deb belgilanadi (aks holda shu patch
-- ishga tushirilgan zahoti ularning havolasi yana bir marta "yangi" bo'lib
-- qolib, qayta ishlatib bo'lar edi).
update bookings
  set telegram_link_status = 'eskirgan'
  where client_chat_id is not null
    and telegram_link_status = 'new';

-- 2) Mijoz hisobiga bog'langan barcha Telegram chat_id'lar — bitta
--    user_id uchun cheksiz qator (necha qurilma/Telegram bo'lsa ham).
create table if not exists telegram_subscribers (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id bigint not null,
  lang text,
  created_at timestamptz default now(),
  unique (user_id, chat_id)
);

create index if not exists telegram_subscribers_user_idx on telegram_subscribers (user_id);

alter table telegram_subscribers enable row level security;

-- MUHIM: bu jadvalga na "anon", na "authenticated" uchun hech qanday SELECT/
-- INSERT/UPDATE policy yaratilmaydi — faqat Edge Function'lar
-- (SB_SERVICE_ROLE_KEY orqali, RLS'ni chetlab o'tadi) yoza/o'qiy oladi.
-- Bu yerda mijozning telefon/Telegram bog'lanishlari turgani uchun
-- boshqa hech kim (hatto login qilgan boshqa mijoz ham) buni ko'rmasligi
-- shart.

-- Tekshirish uchun:
--   select id, telegram_link_status, client_chat_id from bookings order by id desc limit 5;
--   select * from telegram_subscribers order by created_at desc limit 20;
