-- =============================================================================
-- ASOSIY SXEMA: bookings jadvali, RLS policylari, booked_slots view va
-- ikki marta bron qilishning oldini oluvchi UNIQUE cheklov.
--
-- MUHIM: bu fayl loyihada avval umuman mavjud bo'lmagan, lekin kod
-- (js/api.js) ishlashi uchun SHART bo'lgan ikkita narsani hujjatlashtiradi:
--   1) `booked_slots` view'i — mijoz tomonidan band vaqtlarni xavfsiz
--      o'qish uchun (mijoz ismi/telefoni kabi shaxsiy ma'lumotlarsiz).
--   2) UNIQUE cheklov — bir usta bitta sana+vaqtga IKKI marta bron
--      qilinishining (masalan ikki mijoz bir vaqtda "Bron qilish"ni
--      bossa) oldini oladi. js/api.js buni Postgres xatosi 23505 orqali
--      ushlab, mijozga "bu vaqt band bo'lib qoldi" deb ko'rsatadi —
--      lekin bu cheklov bazada YARATILMAGAN bo'lsa, ikkalasi ham
--      muvaffaqiyatli bron bo'lib qolar edi.
--
-- Agar bookings jadvali va policylar allaqachon Supabase'da qo'lda
-- yaratilgan bo'lsa — bu faylni baribir bajarish xavfsiz, chunki har bir
-- buyruqda "if not exists" / "or replace" ishlatilgan.
-- =============================================================================

-- 1) Asosiy jadval (config.js'dagi izohdagi sxema bilan bir xil)
create table if not exists bookings (
  id bigint generated always as identity primary key,
  service_id text not null,
  service_name text not null,
  master_id text not null,
  master_name text not null,
  booking_date date not null,
  booking_time text not null,
  client_name text not null,
  client_phone text not null,
  price bigint not null,
  duration int not null,
  status text default 'new',
  client_chat_id bigint,          -- mijozning Telegram chat_id'si (eslatma uchun)
  reminder_sent boolean default false,
  created_at timestamptz default now()
);

alter table bookings enable row level security;

-- 2) Ommaviy sayt (mijoz): faqat INSERT qila oladi
drop policy if exists "Allow public insert" on bookings;
create policy "Allow public insert" on bookings
  for insert to anon with check (true);

-- 3) Admin panel (Supabase Auth orqali kirgan foydalanuvchi): boshqaruv
--    huquqlari.
--    MUHIM (audit round-3 tuzatishi): bu yerda ILGARI keng ("using(true)"
--    — har qanday login qilgan foydalanuvchi BARCHA bronlarni, jumladan
--    boshqa mijozlarning ism/telefonini ko'ra olardi) policylar
--    yaratilardi. Endi ular FAQAT o'chiriladi (agar mavjud bo'lsa), lekin
--    o'rniga hech narsa yaratilmaydi — chunki sql/auth_and_noshow.sql
--    ularni tor, xavfsiz policylar ("O'qish: o'zi yoki admin", "Yangilash:
--    faqat admin", "O'chirish: faqat admin") bilan ta'minlaydi. Shu sabab
--    BU FAYLDAN KEYIN sql/auth_and_noshow.sql'ni HAM ishga tushirish
--    SHART — aks holda bookings jadvaliga hech qanday SELECT/UPDATE/DELETE
--    huquqi qolmaydi.
drop policy if exists "Allow authenticated select" on bookings;
drop policy if exists "Allow authenticated update" on bookings;
drop policy if exists "Allow authenticated delete" on bookings;

-- 4) IKKI MARTA BRON QILISHNING OLDINI OLISH
--    Bekor qilingan (cancelled) bronlar hisobga olinmaydi — aks holda
--    bekor qilingan vaqt boshqa mijozga qayta bron qilib bo'lmas edi.
drop index if exists bookings_master_slot_unique;
create unique index bookings_master_slot_unique
  on bookings (master_id, booking_date, booking_time)
  where status <> 'cancelled';

-- 5) BOOKED_SLOTS VIEW — mijoz tomondan (anon) xavfsiz o'qiladigan,
--    faqat band vaqtlarni ko'rsatadigan, shaxsiy ma'lumotsiz view.
--    js/api.js -> fetchBookedSlots() aynan shu view'dan o'qiydi.
--    MUHIM (audit round-2, #8): `duration` ustuni qo'shildi — frontend
--    endi bron oralig'ini (start, start+duration) hisoblab, xizmat
--    davomiyligi tufayli kesishadigan slotlarni ham oldindan "band" deb
--    ko'rsatishi mumkin (haqiqiy himoya baribir bazadagi
--    on_booking_no_overlap trigger'da, sql/catalog_validation_and_limits.sql).
create or replace view booked_slots as
  select master_id, booking_date, booking_time, duration
  from bookings
  where status <> 'cancelled';

grant select on booked_slots to anon;

-- Tekshirish uchun:
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'bookings'::regclass;
--   select indexname, indexdef from pg_indexes where tablename = 'bookings';
--   select * from information_schema.views where table_name = 'booked_slots';
