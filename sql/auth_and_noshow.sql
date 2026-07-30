-- =============================================================================
-- MIJOZ HISOBI (telefon + parol) + "KELMADI" KUZATUVI + AVTOMATIK BLOKLASH
-- Bu fayl SQL Editor'da to'liq ishga tushiring (Supabase Dashboard -> SQL Editor).
--
-- NIMA O'ZGARADI:
--  1) Endi mijoz FAQAT ro'yxatdan o'tib/kirib bron qila oladi (anonim bron
--     yopiladi). Telefon raqam "email"ga aylantiriladi (masalan
--     998901234567@bilolbarber.client) va Supabase Auth'ning bepul
--     email+parol tizimidan foydalaniladi — SMS/pullik xizmat kerak emas.
--  2) `profiles` jadvali — har bir mijozning ismi, telefoni va necha marta
--     "Kelmadi" bo'lganini saqlaydi.
--  3) Admin panelda bronni "Kelmadi" deb belgilasa — trigger avtomatik
--     shu mijozning hisobini +1 qiladi va 3 martaga yetganda `blocked=true`
--     qilib qo'yadi. Bloklangan mijoz yangi bron QILA OLMAYDI (RLS orqali).
--
-- MUHIM QO'LDA QILINADIGAN QADAM (bepul, lekin SQL emas):
--   Supabase Dashboard -> Authentication -> Providers -> Email ->
--   "Confirm email" ni OFF qiling. Chunki biz haqiqiy email ishlatmaymiz
--   (u yerga hech qanday tasdiqlash xati bormaydi) — aks holda mijozlar
--   ro'yxatdan o'tgandan keyin hech qachon kira olmay qoladi.
-- =============================================================================

-- 1) ADMIN RO'YXATI — bookings/profiles jadvallarida "bu foydalanuvchi admin
--    yoki yo'q" tekshiruvi shu jadval orqali (profiles ichida emas — aks
--    holda RLS o'z-o'ziga bog'lanib chalkashib ketardi).
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table admins enable row level security;

drop policy if exists "admin ko'radi o'zini" on admins;
create policy "admin ko'radi o'zini" on admins
  for select to authenticated using (user_id = auth.uid());

-- Mavjud admin hisobingizni (config.js dagi ADMIN_EMAIL) shu ro'yxatga
-- qo'shamiz — bu buyruq xavfsiz, agar admin@bilolbarber.uz hali umuman
-- ro'yxatdan o'tmagan bo'lsa hech narsa qilmaydi.
insert into admins (user_id)
select id from auth.users where email = 'admin@bilolbarber.uz'
on conflict do nothing;

-- 2) MIJOZLAR PROFILI
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique,
  full_name text,
  no_show_count int not null default 0,
  blocked boolean not null default false,
  created_at timestamptz default now()
);
alter table profiles enable row level security;

drop policy if exists "profil: o'zini yoki admin ko'radi" on profiles;
create policy "profil: o'zini yoki admin ko'radi" on profiles
  for select to authenticated using (
    id = auth.uid() or exists (select 1 from admins a where a.user_id = auth.uid())
  );

drop policy if exists "profil: admin yangilaydi" on profiles;
create policy "profil: admin yangilaydi" on profiles
  for update to authenticated using (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

-- Mijoz o'zi ham ism/telefonini "Sozlamalar" bo'limidan o'zgartira oladi —
-- lekin `blocked` / `no_show_count` ustunlarini o'zi o'zgartira olmasligi
-- kerak (aks holda brauzer konsolidan o'zini blokdan chiqarib olishi
-- mumkin edi). Shu sabab pastdagi trigger bilan himoyalanadi.
drop policy if exists "profil: o'zi yangilaydi" on profiles;
create policy "profil: o'zi yangilaydi" on profiles
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (select 1 from admins a where a.user_id = auth.uid()) then
    new.blocked := old.blocked;
    new.no_show_count := old.no_show_count;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_update_protect on profiles;
create trigger on_profile_update_protect
  before update on profiles
  for each row execute procedure public.protect_profile_fields();

-- Yangi mijoz ro'yxatdan o'tganda (auth.users'ga yozilganda) profiles'da
-- ham avtomatik qator yaratiladi — js/auth.js signUp() da yuboradigan
-- phone/full_name metama'lumotidan olinadi.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, phone, full_name)
  values (new.id, new.raw_user_meta_data ->> 'phone', new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3) BOOKINGS: qaysi mijozga tegishli ekanini bilish uchun user_id
alter table bookings add column if not exists user_id uuid references auth.users(id);

-- 4) BRON QILISH ENDI FAQAT RO'YXATDAN O'TGAN (VA BLOKLANMAGAN) MIJOZ UCHUN
drop policy if exists "Allow public insert" on bookings;
drop policy if exists "Mijoz: o'ziga va bloklanmagan bo'lsa bron qiladi" on bookings;
create policy "Mijoz: o'ziga va bloklanmagan bo'lsa bron qiladi" on bookings
  for insert to authenticated with check (
    auth.uid() = user_id
    and not exists (select 1 from profiles p where p.id = auth.uid() and p.blocked = true)
  );

-- 5) O'QISH: mijoz faqat o'z bronlarini, admin esa hammasini ko'radi
drop policy if exists "Allow authenticated select" on bookings;
drop policy if exists "O'qish: o'zi yoki admin" on bookings;
create policy "O'qish: o'zi yoki admin" on bookings
  for select to authenticated using (
    user_id = auth.uid() or exists (select 1 from admins a where a.user_id = auth.uid())
  );

-- 6) STATUS O'ZGARTIRISH VA O'CHIRISH — faqat admin (mijoz o'zi status
--    o'zgartira olmaydi, aks holda "Kelmadi"ni o'zi "Bajarilgan"ga
--    almashtirib qo'yishi mumkin edi)
drop policy if exists "Allow authenticated update" on bookings;
drop policy if exists "Yangilash: faqat admin" on bookings;
create policy "Yangilash: faqat admin" on bookings
  for update to authenticated using (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

drop policy if exists "Allow authenticated delete" on bookings;
drop policy if exists "O'chirish: faqat admin" on bookings;
create policy "O'chirish: faqat admin" on bookings
  for delete to authenticated using (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

-- 7) "KELMADI" TRIGGERI: admin bronni no_show deb belgilasa, mijozning
--    hisobiga +1, 3 taga yetganda avtomatik bloklaydi.
create or replace function public.handle_no_show()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'no_show'
     and (old.status is distinct from 'no_show')
     and new.user_id is not null then
    update profiles
      set no_show_count = no_show_count + 1,
          blocked = (no_show_count + 1) >= 3
      where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_booking_no_show on bookings;
create trigger on_booking_no_show
  after update on bookings
  for each row execute procedure public.handle_no_show();

-- Tekshirish uchun:
--   select * from profiles order by no_show_count desc;
--   select b.id, b.status, p.phone, p.no_show_count, p.blocked
--     from bookings b join profiles p on p.id = b.user_id;
--
-- Qo'lda blokdan chiqarish kerak bo'lsa (masalan mijoz uzrli sabab bilan
-- kelmagan bo'lsa):
--   update profiles set blocked = false, no_show_count = 0 where phone = '998901234567';
