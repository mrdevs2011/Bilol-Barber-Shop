-- =============================================================================
-- BEPUL AVTOMATIK OVOZLI ESLATMA TIZIMI
-- Bu faylni Supabase Dashboard -> SQL Editor -> "New query" ga qo'yib,
-- to'liq RUN qiling. Hech qanday to'lov kerak emas — pg_cron va pg_net
-- Supabase'ning bepul (Free) tarifida ham mavjud.
--
-- Ishlash mantig'i:
--  1) Mijoz bron qilgandan keyin "Telegram orqali bepul eslatma oling"
--     tugmasini bosadi -> botga /start b<booking_id> yuboradi.
--  2) supabase/functions/telegram-webhook shu xabarni ushlab, mijozning
--     chat_id'sini o'sha bronga yozib qo'yadi.
--  3) Quyidagi cron job har 5 daqiqada ishlaydi va
--     supabase/functions/send-reminders funksiyasini chaqiradi. O'sha funksiya
--     navbat vaqti yaqinlashgan sari bir necha bosqichda (2 soat -> ovozli,
--     1 soat -> matn, 30 daqiqa -> matn, 10 daqiqa -> yana ovozli) Telegram
--     bot orqali mijozga to'g'ridan-to'g'ri eslatma yuboradi. Har bir bosqich
--     faqat bir marta yuboriladi — mijoz spam bilan bezovta qilinmaydi.
--
-- MUHIM: TTS (ovoz yasash) qismi WebSocket orqali ishlaydi, shuning uchun
-- uni faqat Deno Edge Function ichida (pg_net emas) bajarish mumkin. Shu
-- sababli bu SQL faylning vazifasi — funksiyani vaqti-vaqti bilan chaqirib
-- turish, xolos.
-- =============================================================================

-- 1) Kerakli ustunlar (agar config.js'dagi asosiy jadval sxemasida hali yo'q bo'lsa)
alter table bookings add column if not exists client_chat_id bigint;
-- reminder_stage: 0 = hali eslatma yuborilmagan, 1 = 2 soatlik, 2 = 1 soatlik,
-- 3 = 30 daqiqalik, 4 = 10 daqiqalik eslatma yuborilgan (eng oxirgi bosqich).
alter table bookings add column if not exists reminder_stage int default 0;

-- Eski (bitta eslatmali) tizimdan o'tayotgan bo'lsangiz: agar avval
-- reminder_sent=true bo'lgan bronlar bo'lsa, ularni "2 soatlik eslatma
-- allaqachon yuborilgan" deb belgilab qo'yamiz, aks holda ularga birdan
-- barcha bosqichlar yuborilib ketishi mumkin. (Column mavjud bo'lmasa,
-- bu blok hech narsa qilmaydi.)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'bookings' and column_name = 'reminder_sent'
  ) then
    execute 'update bookings set reminder_stage = 1 where reminder_stage = 0 and reminder_sent is true';
  end if;
end $$;

-- 2) Kerakli extensionlar (bepul, Supabase loyihasida standart mavjud)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3) Har 5 daqiqada send-reminders Edge Function'ni chaqiruvchi job
--    MUHIM: pastdagi ikkita joyni almashtiring:
--      <PROJECT_REF>            -> js/config.js dagi Supabase loyiha manzilidan
--                                   (masalan riyanrmrjrartdmwzymt)
--      <SB_SERVICE_ROLE_KEY>    -> Dashboard -> Settings -> API -> service_role kaliti
select cron.schedule(
  'send-booking-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SB_SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Ishlayotganini tekshirish uchun:
--   select * from cron.job;                    -- job ro'yxati
--   select * from cron.job_run_details          -- oxirgi ishga tushishlar
--   order by start_time desc limit 10;
--
-- To'xtatish kerak bo'lsa:
--   select cron.unschedule('send-booking-reminders');
