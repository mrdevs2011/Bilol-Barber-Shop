-- =============================================================================
-- MASTER DAM OLISH / BANDLIK KUNLARI (time off)
--
-- NIMA UCHUN: admin panelda hozircha faqat mavjud bronlarni ko'rish/holat
-- almashtirish bor edi — lekin agar biror barber kasal bo'lib qolsa yoki
-- ta'til olsa, buni tizimga kiritishning HECH QANDAY yo'li yo'q edi. Natijada
-- mijozlar o'sha kunga bemalol yozilaverar edi va real hayotda to'qnashuv
-- (mijoz kelib, usta yo'qligini bilib qoladi) yuzaga kelishi mumkin edi.
--
-- Bu fayl `master_time_off` jadvalini yaratadi — admin bir ustaning muayyan
-- sanasini (butun kun) yoki soat oralig'ini "band" deb belgilay oladi.
-- Bron oynasi (js/booking.js) shu yozuvlarni band vaqtlar bilan birga o'qib,
-- mijozga umuman ko'rsatmaydi — server tomonda esa quyidagi trigger orqali
-- HAM qat'iy taqiqlanadi (frontendni chetlab o'tib to'g'ridan-to'g'ri API
-- chaqirilsa ham bron yaratilmaydi).
-- =============================================================================

create table if not exists master_time_off (
  id bigint generated always as identity primary key,
  master_id text not null references masters(id) on delete cascade,
  off_date date not null,
  -- start_time/end_time NULL bo'lsa — BUTUN KUN band (masalan ta'til/kasallik).
  -- Ikkalasi ham to'ldirilsa — faqat shu oraliq band (masalan "14:00-16:00
  -- shifokorga borib keladi").
  start_time text,
  end_time text,
  reason text,
  created_at timestamptz default now(),
  constraint time_range_valid check (
    (start_time is null and end_time is null) or
    (start_time is not null and end_time is not null and end_time > start_time)
  )
);

create index if not exists idx_master_time_off_lookup on master_time_off (master_id, off_date);

alter table master_time_off enable row level security;

-- Mijoz sayti (anon) ham, login qilgan mijoz ham — band kunlarni bilishi
-- SHART (aks holda bo'sh vaqt sifatida ko'rsatib qo'yadi), shaxsiy ma'lumot
-- bu jadvalda umuman yo'q (faqat sana/vaqt/sabab), shuning uchun ochiq o'qish
-- xavfsiz.
drop policy if exists "time_off: hammaga o'qish" on master_time_off;
create policy "time_off: hammaga o'qish" on master_time_off
  for select to anon, authenticated using (true);

drop policy if exists "time_off: faqat admin qo'shadi" on master_time_off;
create policy "time_off: faqat admin qo'shadi" on master_time_off
  for insert to authenticated with check (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

drop policy if exists "time_off: faqat admin o'chiradi" on master_time_off;
create policy "time_off: faqat admin o'chiradi" on master_time_off
  for delete to authenticated using (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

-- SERVER TOMON KAFOLATI: mijoz (yoki botlashtirilgan so'rov) frontendni
-- butunlay chetlab o'tib, to'g'ridan-to'g'ri bookings jadvaliga yozishga
-- urinsa ham, ustaning band vaqtiga bron tushib qolmasligi kerak.
create or replace function public.validate_booking_against_time_off()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  conflict_row master_time_off%rowtype;
  new_start int;
  new_end int;
  off_start int;
  off_end int;
begin
  new_start := (split_part(new.booking_time, ':', 1)::int * 60) + split_part(new.booking_time, ':', 2)::int;
  new_end := new_start + coalesce(new.duration, 30);

  for conflict_row in
    select * from master_time_off
    where master_id = new.master_id and off_date = new.booking_date
  loop
    if conflict_row.start_time is null then
      -- Butun kun band
      raise exception 'Ushbu sanada bu barber ishlamaydi. Iltimos, boshqa sana yoki barberni tanlang.';
    end if;

    off_start := (split_part(conflict_row.start_time, ':', 1)::int * 60) + split_part(conflict_row.start_time, ':', 2)::int;
    off_end := (split_part(conflict_row.end_time, ':', 1)::int * 60) + split_part(conflict_row.end_time, ':', 2)::int;

    if new_start < off_end and new_end > off_start then
      raise exception 'Ushbu vaqt oralig''ida bu barber band. Iltimos, boshqa vaqt yoki barberni tanlang.';
    end if;
  end loop;

  return new;
end;
$$;

-- MUHIM (trigger tartibi): Postgres bir nechta BEFORE trigger'ni nom
-- alifbo tartibida ishga tushiradi. Trigger nomi ataylab
-- "on_booking_validate_time_off" deb tanlangan — bu "on_booking_validate_
-- catalog"dan (sql/catalog_validation_and_limits.sql) ALIFBO BO'YICHA
-- KEYIN keladi ("...catalog" < "...time_off"), shuning uchun bu trigger
-- ishga tushganda new.duration allaqachon katalogdan olingan HAQIQIY
-- qiymatga ega bo'ladi (mijoz yuborgan soxta duration emas). Trigger
-- nomini o'zgartirsangiz, shu tartibni buzmaslikka e'tibor bering.
drop trigger if exists on_booking_validate_time_off on bookings;
create trigger on_booking_validate_time_off
  before insert or update on bookings
  for each row execute function public.validate_booking_against_time_off();

-- Tekshirish uchun:
--   select * from master_time_off order by off_date;
