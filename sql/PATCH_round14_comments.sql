-- =============================================================================
-- MIJOZ SHARHLARI (comments): saytdagi "Sharhlar" bo'limidagi qo'lda yozilgan
-- soxta sharhlar o'rniga, endi FAQAT tizimga kirgan (login qilgan) haqiqiy
-- mijozlar o'z qurilmasidan sharh va yulduzcha (reyting) qoldira oladi.
--
-- NIMA O'ZGARADI:
--  1) `comments` jadvali yaratiladi — har bir sharh: kim yozgani (user_id),
--     ismi (profildan avtomatik olinadi), reytingi (1-5), matni, "doimiy
--     mijoz" yoki "yangi mijoz" belgisi (bookings tarixidan avtomatik
--     hisoblanadi) va holati (pending/approved/rejected).
--  2) Sharh yozilganda ISM MIJOZ TOMONDAN YOZILMAYDI — profiles jadvalidan
--     serverda (trigger orqali) olinadi, shu sabab birov boshqa birovning
--     nomidan soxta sharh yoza olmaydi.
--  3) "Doimiy mijoz" / "Yangi mijoz" ham mijoz o'zi tanlamaydi — bookings
--     tarixidan (necha marta xizmatdan foydalangani va birinchi bronidan
--     necha kun o'tgani) serverda avtomatik hisoblanadi.
--  4) Sayt (public) faqat status='approved' bo'lgan sharhlarni ko'radi.
--     Yangi yozilgan sharh avval 'pending' holatda turadi va saytda
--     ko'rinmaydi — admin panelning "Sharhlar" bo'limida ko'rib chiqib,
--     "Tasdiqlash" tugmasini bossagina ommaviy sahifada chiqadi.
--
-- Ushbu faylni sql/schema.sql va sql/auth_and_noshow.sql BAJARILGANDAN KEYIN
-- Supabase Dashboard -> SQL Editor'da ishga tushiring (chunki profiles,
-- bookings va admins jadvallariga tayanadi).
-- =============================================================================

create table if not exists comments (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_name text not null,
  rating smallint not null check (rating between 1 and 5),
  comment_text text not null check (char_length(trim(comment_text)) between 3 and 500),
  customer_type text not null default 'yangi' check (customer_type in ('yangi', 'doimiy')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now()
);

alter table comments enable row level security;

-- ---------------------------------------------------------------------------
-- 1) SHARH YOZISHDAN OLDIN: ism/mijoz-turi/holatni SERVERDA belgilaymiz —
--    mijoz tomonidan yuborilgan qiymatlar (agar bo'lsa ham) e'tiborga
--    olinmaydi. Bloklangan mijoz sharh qoldira olmaydi.
-- ---------------------------------------------------------------------------
create or replace function public.set_comment_defaults()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_full_name text;
  v_blocked boolean;
  v_first_booking date;
  v_done_count int;
begin
  new.user_id := auth.uid();

  select full_name, blocked into v_full_name, v_blocked
    from profiles where id = auth.uid();

  if v_blocked then
    raise exception 'Bloklangan hisob sharh qoldira olmaydi.';
  end if;

  -- Ism har doim profildan olinadi (mijoz o'zi kiritolmaydi).
  new.client_name := coalesce(nullif(trim(v_full_name), ''), 'Mijoz');

  -- Yangi sharh har doim moderatsiya kutadi.
  new.status := 'pending';

  -- "Necha vaqtdan beri shu yerda soch oldirishi": tugallangan
  -- bronlari soni va birinchi bronidan necha kun o'tgani asosida.
  select min(booking_date), count(*) filter (where status = 'done')
    into v_first_booking, v_done_count
    from bookings where user_id = auth.uid();

  if v_done_count >= 3 or (v_first_booking is not null and v_first_booking <= (current_date - interval '60 days')) then
    new.customer_type := 'doimiy';
  else
    new.customer_type := 'yangi';
  end if;

  return new;
end;
$$;

drop trigger if exists on_comment_insert_defaults on comments;
create trigger on_comment_insert_defaults
  before insert on comments
  for each row execute procedure public.set_comment_defaults();

-- ---------------------------------------------------------------------------
-- 2) O'QISH: ommaviy sayt (anon) faqat tasdiqlangan sharhlarni ko'radi;
--    login qilgan mijoz o'zining hali tasdiqlanmagan sharhini ham, admin
--    esa hammasini (pending/approved/rejected) ko'radi.
-- ---------------------------------------------------------------------------
drop policy if exists "Ommaviy: faqat tasdiqlangan sharhlar" on comments;
create policy "Ommaviy: faqat tasdiqlangan sharhlar" on comments
  for select to anon using (status = 'approved');

drop policy if exists "Mijoz/Admin: tasdiqlangan, o'zi yoki admin" on comments;
create policy "Mijoz/Admin: tasdiqlangan, o'zi yoki admin" on comments
  for select to authenticated using (
    status = 'approved'
    or user_id = auth.uid()
    or exists (select 1 from admins a where a.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3) YOZISH: faqat login qilgan va bloklanmagan mijoz. user_id albatta
--    o'zinikiga teng bo'lishi shart (trigger baribir bunga majburlaydi).
-- ---------------------------------------------------------------------------
drop policy if exists "Mijoz: sharh qoldiradi" on comments;
create policy "Mijoz: sharh qoldiradi" on comments
  for insert to authenticated with check (
    user_id = auth.uid()
    and not exists (select 1 from profiles p where p.id = auth.uid() and p.blocked = true)
  );

-- ---------------------------------------------------------------------------
-- 4) TASDIQLASH/RAD ETISH VA O'CHIRISH — faqat admin. Mijoz o'z sharhini
--    o'zi tasdiqlay olmaydi (aks holda moderatsiya ma'nosiz bo'lardi).
-- ---------------------------------------------------------------------------
drop policy if exists "Admin: sharhni yangilaydi" on comments;
create policy "Admin: sharhni yangilaydi" on comments
  for update to authenticated using (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

drop policy if exists "Admin: sharhni o'chiradi" on comments;
create policy "Admin: sharhni o'chiradi" on comments
  for delete to authenticated using (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

create index if not exists comments_status_created_idx on comments (status, created_at desc);
create index if not exists comments_user_idx on comments (user_id);

-- Tekshirish uchun:
--   select id, client_name, rating, customer_type, status, created_at from comments order by created_at desc;
--   update comments set status = 'approved' where id = 1;  -- qo'lda tasdiqlash namunasi
