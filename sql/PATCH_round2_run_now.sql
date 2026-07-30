-- =============================================================================
-- PATCH (audit round-2): jonli (allaqachon sozlangan) Supabase loyihangizga
-- FAQAT yangi tuzatishlarni qo'llash uchun. Boshqa sql/*.sql fayllarni qayta
-- ishga tushirishning HOJATI YO'Q — bu fayl mustaqil va xavfsiz (idempotent).
--
-- Nimalarni tuzatadi:
--   #8  — xizmat davomiyligi hisobga olinmagani sabab yuzaga kelishi mumkin
--         bo'lgan dubl-bron xavfi (endi vaqt oralig'i to'liq tekshiriladi)
--   #9  — katalog validatsiya trigger UPDATE'da ham ishlab, narx
--         o'zgartirilganda eski bronlarning tarixiy narxini "jimgina"
--         qayta yozib qo'yishi (endi faqat INSERT'da ishlaydi)
--   (#8 uchun) booked_slots view'ga `duration` ustuni qo'shiladi
--
-- Ishga tushirish: Supabase Dashboard -> SQL Editor -> shu faylning
-- to'liq kodini qo'ying -> Run.
-- =============================================================================

-- 1) booked_slots view'ga duration qo'shamiz (frontend endi xizmat
--    davomiyligini hisobga olib, kesishadigan slotlarni oldindan "band"
--    deb ko'rsata oladi).
create or replace view booked_slots as
  select master_id, booking_date, booking_time, duration
  from bookings
  where status <> 'cancelled';

grant select on booked_slots to anon;

-- 2) Katalog validatsiya trigger'ni FAQAT INSERT'ga cheklaymiz (avval
--    "before insert or update" edi — shu sabab narx o'zgarganda eski
--    bronlar tarixi buzilardi, yoki nofaol xizmat/ustaga bog'liq eski
--    bronni yangilab bo'lmay qolardi).
drop trigger if exists on_booking_validate_catalog on bookings;
create trigger on_booking_validate_catalog
  before insert on bookings
  for each row execute procedure public.validate_booking_against_catalog();

-- 3) Davomiylikni hisobga oluvchi dubl-bron himoyasi (yangi trigger).
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
  select duration into new_duration from services where id = new.service_id and active = true;
  if new_duration is null then
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

-- =============================================================================
-- TEKSHIRISH:
--   -- 1) view yangilanganini ko'rish:
--   select * from booked_slots limit 5;
--
--   -- 2) trigger ro'yxatini tekshirish (ikkalasi ham ko'rinishi kerak):
--   select tgname, tgrelid::regclass, tgtype
--   from pg_trigger
--   where tgrelid = 'bookings'::regclass and not tgisinternal;
--
--   -- 3) real sinov: bitta ustaga, bitta kunga, 50 daqiqalik xizmatdan
--   --    10:00ga bron qiling, keyin xuddi shu kun/ustaga 10:30ga bron
--   --    qilishga urining — ikkinchisi xato bilan rad etilishi kerak.
-- =============================================================================
