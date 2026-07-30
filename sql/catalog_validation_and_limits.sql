-- =============================================================================
-- SERVER-SIDE KATALOG VALIDATSIYASI + MIJOZ UCHUN FAOL BRON CHEGARASI
-- Xavfsizlik auditi natijasida qo'shildi (H-2 va M-1 tuzatilishi).
--
-- H-2 (YUQORI): oldin bookings.insert paytida price/duration/service_id/
--   master_id qiymatlari HECH QANDAY tekshiruvsiz, to'g'ridan-to'g'ri
--   brauzerdan qabul qilinardi — mijoz narxni "1 so'm" qilib yuborishi
--   mumkin edi. Endi haqiqiy katalog jadvallari yaratiladi va har bir
--   INSERT/UPDATE'da shu katalog bilan solishtirib tekshiriladi.
--
-- M-1 (O'RTA): bitta mijoz cheksiz miqdorda faol bron ochib, barcha
--   vaqtlarni "band" qilib qo'yishi mumkin edi. Endi trigger orqali bitta
--   foydalanuvchi bir vaqtning o'zida ko'pi bilan 2 ta faol (new/confirmed)
--   bronga ega bo'lishi mumkin.
--
-- M-2 (O'RTA, keyinroq qo'shildi): brauzer "hozirgi vaqt"ni mijozning O'Z
--   QURILMA SOATIDAN hisoblardi — mijoz telefon sanasini o'zgartirib,
--   o'tib ketgan yoki o'ta uzoq kelajakdagi (masalan bir necha yildan
--   keyingi) vaqtga bron yaratishi mumkin edi, chunki server tomonda buni
--   hech kim qayta tekshirmasdi. Endi validate_booking_against_catalog()
--   ichida SERVER vaqti (Asia/Tashkent) bilan majburiy solishtiriladi:
--   o'tib ketgan vaqtga va 90 kundan uzoqroqqa bron qilib bo'lmaydi.
--
-- MUHIM: bu fayldagi services/masters qiymatlarini js/data.js dagi
-- SERVICES/MASTERS ro'yxati bilan har doim SINXRON tuting — biror xizmat
-- narxini o'zgartirsangiz, ham data.js'da, ham shu yerda yangilang.
-- =============================================================================

-- 1) XIZMATLAR KATALOGI (haqiqiy manba — narx/davomiylik shu yerdan tekshiriladi)
create table if not exists services (
  id text primary key,
  name text not null,
  duration int not null,
  price bigint not null,
  active boolean not null default true
);

insert into services (id, name, duration, price) values
  ('classic_cut',     'Oddiy soch kesish',      40, 40000),
  ('fade_cut',        'Fade / dizaynli kesish', 50, 60000),
  ('kids_cut',        'Bolalar soch kesish',    30, 30000),
  ('beard_trim',      'Soqol shakllantirish',   25, 30000),
  ('royal_shave',     'Ustara bilan tarash',    30, 35000),
  ('cut_beard_combo', 'Soch + soqol kombosi',   60, 65000)
on conflict (id) do update set
  name = excluded.name, duration = excluded.duration, price = excluded.price;

-- 2) BARBERLAR KATALOGI
create table if not exists masters (
  id text primary key,
  name text not null,
  active boolean not null default true
);

insert into masters (id, name) values
  ('alisher', 'Alisher Yusupov')
on conflict (id) do update set name = excluded.name;

alter table services enable row level security;
alter table masters enable row level security;

drop policy if exists "services: hammaga o'qish" on services;
create policy "services: hammaga o'qish" on services for select to anon, authenticated using (true);

drop policy if exists "masters: hammaga o'qish" on masters;
create policy "masters: hammaga o'qish" on masters for select to anon, authenticated using (true);

-- 3) VALIDATSIYA TRIGGERI: har bir yangi/yangilangan bron uchun
--    service_id/master_id/price/duration haqiqiy katalog bilan mos kelishini
--    majburiy qiladi. Mos kelmasa — butun INSERT/UPDATE rad etiladi (xato
--    qaytaradi), ya'ni firibgarlik urinishi bazaga umuman yozilmaydi.
create or replace function public.validate_booking_against_catalog()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  svc services%rowtype;
  mst masters%rowtype;
  booking_start timestamp;
  now_tashkent timestamp;
begin
  select * into svc from services where id = new.service_id and active = true;
  if not found then
    raise exception 'Noto''g''ri yoki mavjud bo''lmagan xizmat: %', new.service_id;
  end if;

  select * into mst from masters where id = new.master_id and active = true;
  if not found then
    raise exception 'Noto''g''ri yoki mavjud bo''lmagan barber: %', new.master_id;
  end if;

  -- SANA/VAQT TEKSHIRUVI: mijozning brauzeri/telefoni "hozirgi vaqt"ni
  -- o'z qurilma soatidan hisoblab, faqat shu asosda bo'sh/band slotlarni
  -- ko'rsatadi — bu mijoz tomonidan to'liq boshqariladi (masalan telefon
  -- sanasini orqaga surib qo'ysa, sayt "hali vaqt bor" deb ko'rsataveradi).
  -- Shu sabab bu yerda HAQIQIY server vaqti (O'zbekiston zonasida) bilan
  -- qayta tekshiramiz — mijoz kiritgan/yuborgan sana-vaqtga ishonmaymiz.
  booking_start := (new.booking_date::text || ' ' || new.booking_time)::timestamp;
  now_tashkent := now() at time zone 'Asia/Tashkent';

  if booking_start < now_tashkent - interval '1 minute' then
    raise exception 'Bu vaqt allaqachon o''tib ketgan. Iltimos, kelajakdagi vaqtni tanlang.';
  end if;

  if booking_start > now_tashkent + interval '90 days' then
    raise exception 'Bron vaqti juda uzoq kelajakka mo''ljallangan (90 kundan ortiq oldindan bron qilib bo''lmaydi).';
  end if;

  -- Narx, davomiylik va nomlarni MIJOZ kiritgan qiymatlar bilan emas,
  -- KATALOGDAGI haqiqiy qiymatlar bilan majburan almashtiramiz —
  -- shunday qilib brauzerdan yuborilgan soxta narx umuman e'tiborga
  -- olinmaydi, xato qaytarish o'rniga har doim to'g'ri qiymat yoziladi.
  new.price := svc.price;
  new.duration := svc.duration;
  new.service_name := svc.name;
  new.master_name := mst.name;

  return new;
end;
$$;

-- MUHIM (audit round-2 tuzatishi): bu trigger avval "before insert or
-- update" edi. Bu degani — admin panelda eski bronni shunchaki "Bajarildi"/
-- "Kelmadi" deb belgilasangiz ham, trigger yana ishga tushib:
--   (a) narx/xizmat nomi HOZIRGI katalog qiymati bilan qayta yozib
--       qo'yilardi — ya'ni ertaga narxni oshirsangiz, BUGUNGI (eski
--       narxdagi) bronlarning tarixiy narxi ham "jimgina" yangi narxga
--       almashtirilib, tushum hisobotini buzardi;
--   (b) agar xizmat/usta keyinchalik nofaol (active=false) qilingan
--       bo'lsa, o'sha bronni status bo'yicha yangilashning O'ZI xato
--       bilan rad etilardi.
-- Shu sabab endi FAQAT INSERT paytida ishlaydi — narx/nom faqat bron
-- birinchi marta yaratilganda "muhrlanadi", keyin status o'zgarishlarida
-- qayta tekshirilmaydi/qayta yozilmaydi.
drop trigger if exists on_booking_validate_catalog on bookings;
create trigger on_booking_validate_catalog
  before insert on bookings
  for each row execute procedure public.validate_booking_against_catalog();

-- 4) FAOL BRON CHEGARASI: bitta foydalanuvchi bir vaqtning o'zida ko'pi
--    bilan 2 ta faol (new/confirmed) bronga ega bo'lishi mumkin. Bu barcha
--    bo'sh vaqtlarni yakka mijoz "egallab olishi" (DoS)ning oldini oladi.
create or replace function public.enforce_active_booking_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  active_count int;
begin
  if new.user_id is null then
    return new;
  end if;

  select count(*) into active_count
  from bookings
  where user_id = new.user_id
    and status in ('new', 'confirmed')
    and (tg_op = 'INSERT' or id <> new.id);

  if active_count >= 2 then
    raise exception 'Sizda allaqachon 2 ta faol bron bor. Yangi bron qilishdan oldin birini bekor qiling yoki kutib turing.';
  end if;

  return new;
end;
$$;

drop trigger if exists on_booking_limit_check on bookings;
create trigger on_booking_limit_check
  before insert on bookings
  for each row execute procedure public.enforce_active_booking_limit();

-- =============================================================================
-- 5) DAVOMIYLIKNI HISOBGA OLUVCHI DUBL-BRON HIMOYASI (audit round-2, #8)
--
-- OLDINGI MUAMMO (YUQORI DARAJA): bookings_master_slot_unique indeksi
-- (schema.sql) faqat (master_id, booking_date, booking_time) AYNAN bir xil
-- bo'lishini tekshiradi. Xizmat davomiyligi (25/30/40/50/60 daqiqa) hisobga
-- olinmagani uchun, masalan 10:00ga 50 daqiqalik "Fade kesish" bron
-- qilinsa (10:00-10:50 oralig'ini egallaydi), boshqa mijoz 10:30ga xotirjam
-- bron qilib qo'yishi mumkin edi — ustaning oldida ikki mijoz to'qnashardi.
--
-- YECHIM: har bir yangi bron uchun, o'sha kunda o'sha ustaga tegishli barcha
-- bekor qilinmagan bronlar bilan vaqt oralig'i (start, start+duration)
-- kesishmasligini majburiy qiladi. Kesishsa — INSERT butunlay rad etiladi.
-- =============================================================================
create or replace function public.enforce_no_overlapping_booking()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_start time;
  new_end time;
  new_duration int;
  conflict_count int;
begin
  -- Davomiylikni har doim KATALOGDAN olamiz (new.duration'ga ishonmaymiz —
  -- bu trigger boshqa trigger'lar bilan bir xil INSERT hodisasida ishlaydi,
  -- ular ishga tushish tartibiga bog'liq bo'lib qolmaslik uchun mustaqil
  -- hisoblaymiz).
  select duration into new_duration from services where id = new.service_id and active = true;
  if new_duration is null then
    -- Katalog validatsiya trigger allaqachon shu holatni ushlab, aniqroq
    -- xato qaytargan bo'ladi — bu yerda shunchaki xavfsiz to'xtaymiz.
    return new;
  end if;

  new_start := new.booking_time::time;
  new_end := new_start + (new_duration || ' minutes')::interval;

  select count(*) into conflict_count
  from bookings b
  where b.master_id = new.master_id
    and b.booking_date = new.booking_date
    and b.status <> 'cancelled'
    and (tg_op = 'INSERT' or b.id <> new.id)
    and (b.booking_time::time, b.booking_time::time + (b.duration || ' minutes')::interval)
        overlaps (new_start, new_end);

  if conflict_count > 0 then
    raise exception 'Kechirasiz, bu vaqt oralig''ida usta band (avvalgi bronning davomiyligi bilan to''qnashadi). Iltimos, boshqa vaqtni tanlang.';
  end if;

  return new;
end;
$$;

drop trigger if exists on_booking_no_overlap on bookings;
create trigger on_booking_no_overlap
  before insert on bookings
  for each row execute procedure public.enforce_no_overlapping_booking();

-- Tekshirish uchun (masalan 10:00da 50 daqiqalik xizmat band bo'lsa, 10:30ga
-- bron qilishga urinish xato qaytarishi kerak):
--   select id, booking_time, duration, status from bookings
--   where master_id = 'alisher' and booking_date = '2026-08-01' order by booking_time;


-- Tekshirish uchun:
--   select * from services;
--   select * from masters;
--   -- Soxta narx bilan sinash (xato qaytarishi kerak emas, lekin narx
--   -- avtomatik to'g'irlanishi kerak):
--   -- insert into bookings (...) values (... price=1 ...);
--   -- keyin: select price from bookings order by id desc limit 1; -- haqiqiy narx bo'lishi kerak
