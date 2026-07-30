-- =============================================================================
-- ADMIN TOMONIDAN MAVJUD BRONNI TAHRIRLASH
--
-- NIMA UCHUN RPC FUNKSIYA (to'g'ridan-to'g'ri UPDATE emas)?
-- Bu muhim: sql/catalog_validation_and_limits.sql va
-- sql/PATCH_round7_master_time_off.sql'dagi tekshiruv trigger'lari —
-- katalogga moslik, davomiylikni hisobga oluvchi to'qnashuv, o'tib ketgan
-- vaqt/90 kunlik chegara — bularning aksariyati ATAYLAB faqat "before
-- INSERT" paytida ishlaydi (round-2 tuzatishi, sabab: admin oddiy status
-- almashtirsa ham — masalan "Yangi" -> "Bajarilgan" — narx/nom eski katalog
-- qiymati bilan "jimgina" qayta yozilib ketmasligi kerak edi).
--
-- Bu degani: agar admin panelda bronni oddiy `.update()` chaqirig'i orqali
-- tahrirlasak (masalan sana/vaqtni o'zgartirsak), HECH QANDAY to'qnashuv
-- yoki bandlik tekshiruvi ishlamaydi — admin bilmasdan ustani ikki marta
-- band qilib qo'yishi mumkin bo'lardi. Shu sabab tahrirlash alohida,
-- SECURITY DEFINER funksiya orqali amalga oshiriladi — funksiya ichida
-- INSERT trigger'laridagi barcha tekshiruvlar QAYTA takrorlanadi.
-- =============================================================================

create or replace function public.admin_edit_booking(
  p_booking_id bigint,
  p_service_id text,
  p_master_id text,
  p_date date,
  p_time text,
  p_client_name text,
  p_client_phone text
)
returns bookings
language plpgsql
security definer set search_path = public
as $$
declare
  v_row bookings%rowtype;
  svc services%rowtype;
  mst masters%rowtype;
  booking_start timestamp;
  now_tashkent timestamp;
  new_start int;
  new_end int;
  off_row master_time_off%rowtype;
  off_start int;
  off_end int;
  conflict_count int;
  v_name text := trim(p_client_name);
  v_phone text := trim(p_client_phone);
begin
  if not exists (select 1 from admins a where a.user_id = auth.uid()) then
    raise exception 'Bu amal faqat admin uchun.';
  end if;

  select * into v_row from bookings where id = p_booking_id;
  if v_row.id is null then
    raise exception 'Bron topilmadi.';
  end if;
  if v_row.status <> 'confirmed' then
    raise exception 'Faqat "Tasdiqlangan" holatidagi bronlarni tahrirlash mumkin.';
  end if;

  if v_name = '' or v_phone = '' then
    raise exception 'Mijoz ismi va telefonini kiriting.';
  end if;

  -- 1) Katalog (xizmat va barber real va faol ekanini tekshiramiz, narx/
  --    davomiylik/nomlarni doim shu yerdan olamiz — mijoz/admin kiritgan
  --    qiymatlarga ishonmaymiz).
  select * into svc from services where id = p_service_id and active = true;
  if not found then
    raise exception 'Noto''g''ri yoki mavjud bo''lmagan xizmat: %', p_service_id;
  end if;

  select * into mst from masters where id = p_master_id and active = true;
  if not found then
    raise exception 'Noto''g''ri yoki mavjud bo''lmagan barber: %', p_master_id;
  end if;

  -- 2) Sana/vaqt oralig'ini tekshirish (server vaqti bilan, insert
  --    trigger'idagi bilan bir xil mantiq).
  booking_start := (p_date::text || ' ' || p_time)::timestamp;
  now_tashkent := now() at time zone 'Asia/Tashkent';

  if booking_start < now_tashkent - interval '1 minute' then
    raise exception 'Bu vaqt allaqachon o''tib ketgan. Iltimos, kelajakdagi vaqtni tanlang.';
  end if;
  if booking_start > now_tashkent + interval '90 days' then
    raise exception 'Bron vaqti juda uzoq kelajakka mo''ljallangan (90 kundan ortiq oldindan bo''lmaydi).';
  end if;

  -- 3) Ustaning dam olish/bandlik kuni bilan to'qnashuvni tekshirish.
  new_start := (split_part(p_time, ':', 1)::int * 60) + split_part(p_time, ':', 2)::int;
  new_end := new_start + svc.duration;

  for off_row in
    select * from master_time_off where master_id = p_master_id and off_date = p_date
  loop
    if off_row.start_time is null then
      raise exception 'Ushbu sanada bu barber ishlamaydi. Iltimos, boshqa sana yoki barberni tanlang.';
    end if;
    off_start := (split_part(off_row.start_time, ':', 1)::int * 60) + split_part(off_row.start_time, ':', 2)::int;
    off_end := (split_part(off_row.end_time, ':', 1)::int * 60) + split_part(off_row.end_time, ':', 2)::int;
    if new_start < off_end and new_end > off_start then
      raise exception 'Ushbu vaqt oralig''ida bu barber band. Iltimos, boshqa vaqt yoki barberni tanlang.';
    end if;
  end loop;

  -- 4) Davomiylikni hisobga oluvchi to'qnashuv (o'zining eski qatorini
  --    hisobga olmaymiz — chunki hozir aynan shu qatorni yangilayapmiz).
  select count(*) into conflict_count
  from bookings b
  where b.master_id = p_master_id
    and b.booking_date = p_date
    and b.status <> 'cancelled'
    and b.id <> p_booking_id
    and (b.booking_time::time, b.booking_time::time + (b.duration || ' minutes')::interval)
        overlaps (p_time::time, (p_time::time + (svc.duration || ' minutes')::interval));

  if conflict_count > 0 then
    raise exception 'Kechirasiz, bu vaqt oralig''ida usta band (boshqa bronning davomiyligi bilan to''qnashadi). Iltimos, boshqa vaqtni tanlang.';
  end if;

  -- 5) Hammasi tekshirildi — endi yangilaymiz. price/duration/nomlar doim
  --    katalogdan (svc/mst), mijoz kiritgan qiymat emas.
  update bookings set
    service_id = svc.id,
    service_name = svc.name,
    master_id = mst.id,
    master_name = mst.name,
    price = svc.price,
    duration = svc.duration,
    booking_date = p_date,
    booking_time = p_time,
    client_name = v_name,
    client_phone = v_phone
  where id = p_booking_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.admin_edit_booking(bigint, text, text, date, text, text, text) to authenticated;

-- Tekshirish uchun (o'zingizning admin hisobingiz bilan, login holatida):
--   select * from admin_edit_booking(123, 'fade_cut', 'alisher', '2026-08-05', '11:00', 'Test Mijoz', '998901112233');
