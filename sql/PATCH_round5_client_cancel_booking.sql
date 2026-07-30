-- =============================================================================
-- MIJOZ O'ZI BRONINI BEKOR QILISHI ("Mening bronlarim" bo'limi uchun)
-- Supabase SQL Editor'da ishga tushiring.
--
-- NEGA TO'G'RIDAN-TO'G'RI UPDATE POLICY EMAS, RPC FUNKSIYA?
-- sql/auth_and_noshow.sql'da bookings uchun UPDATE huquqi FAQAT adminga
-- berilgan ("Yangilash: faqat admin") — bu ataylab shunday, chunki mijoz
-- o'zi status'ni "Kelmadi"dan "Bajarilgan"ga yoki narxni o'zgartirib qo'yishi
-- mumkin edi. Shu himoyani saqlab qolgan holda mijozga FAQAT bitta tor
-- amalni (o'z bronini "cancelled" qilish) ruxsat berish uchun SECURITY
-- DEFINER funksiya ishlatiladi — funksiya o'zi barcha tekshiruvlarni
-- (egalik, joriy holat) bajaradi, keyin RLS'ni chetlab o'tib yozadi.
-- =============================================================================

-- Mijoz bronni bekor qilishi mumkin bo'lgan eng kech muddat — boshlanishiga
-- shu qadar (soat) qolmagan bo'lishi kerak. Ustaning vaqti oxirgi daqiqada
-- bekor qilinib, bo'sh qolib ketmasligi uchun. Kerak bo'lsa shu yerdagi
-- interval qiymatini o'zgartiring (masalan '1 hour' yoki '4 hours').
create or replace function public.cancel_own_booking(p_booking_id bigint)
returns bookings
language plpgsql
security definer set search_path = public
as $$
declare
  v_row bookings;
  v_starts_at timestamptz;
  v_min_notice interval := interval '2 hours';
begin
  select * into v_row from bookings where id = p_booking_id;

  if v_row.id is null then
    raise exception 'Bron topilmadi.';
  end if;

  if v_row.user_id is distinct from auth.uid() then
    raise exception 'Bu bronni bekor qilish huquqingiz yo''q.';
  end if;

  if v_row.status not in ('new', 'confirmed') then
    raise exception 'Bu bronni endi bekor qilib bo''lmaydi.';
  end if;

  v_starts_at := (v_row.booking_date::text || ' ' || v_row.booking_time)::timestamptz;
  if v_starts_at - now() < v_min_notice then
    raise exception 'Bronni faqat boshlanishiga kamida 2 soat qolganda bekor qilish mumkin. Iltimos, administrator bilan bog''laning.';
  end if;

  update bookings set status = 'cancelled' where id = p_booking_id
  returning * into v_row;

  return v_row;
end;
$$;

-- Faqat login qilgan (authenticated) foydalanuvchilar chaqira oladi —
-- funksiya ichida yana egalik tekshiruvi ham bor, shuning uchun ikki
-- qatlamli himoya.
grant execute on function public.cancel_own_booking(bigint) to authenticated;

-- Tekshirish uchun (o'zingizning bron ID'ingiz bilan, login holatida):
--   select * from cancel_own_booking(123);
