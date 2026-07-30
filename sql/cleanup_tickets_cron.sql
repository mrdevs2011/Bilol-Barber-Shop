-- =============================================================================
-- "tickets" STORAGE BUCKET'INI AVTOMATIK TOZALASH — cron job
-- Bu faylni Supabase Dashboard -> SQL Editor -> "New query" ga qo'yib,
-- to'liq RUN qiling. Hech qanday to'lov kerak emas — pg_cron va pg_net
-- Supabase'ning bepul (Free) tarifida ham mavjud.
--
-- Ishlash mantig'i:
--   Mijoz botga "Start" bosmasa (yoki deleteTicketPng() tarmoq xatosi bilan
--   muvaffaqiyatsiz bo'lsa), booking-<id>.png fayli "tickets" bucket'ida
--   abadiy qolib ketishi mumkin edi. Quyidagi cron job har kuni bir marta
--   ishlaydi va supabase/functions/cleanup-tickets funksiyasini chaqiradi —
--   o'sha funksiya 3 kundan eski BARCHA booking-*.png fayllarini (ishlatilgan
--   yoki ishlatilmaganidan qat'iy nazar) Storage'dan o'chirib tashlaydi.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Har kuni soat 04:00 da (server vaqti bo'yicha) ishlaydi.
--    MUHIM: pastdagi ikkita joyni almashtiring:
--      <PROJECT_REF>            -> js/config.js dagi Supabase loyiha manzilidan
--                                   (masalan riyanrmrjrartdmwzymt)
--      <SB_SERVICE_ROLE_KEY>    -> Dashboard -> Settings -> API -> service_role kaliti
select cron.schedule(
  'cleanup-ticket-pngs',
  '0 4 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/cleanup-tickets',
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
-- Qo'lda sinash uchun (kutmasdan):
--   curl -X POST https://<PROJECT_REF>.functions.supabase.co/cleanup-tickets \
--     -H "Authorization: Bearer <SB_SERVICE_ROLE_KEY>"
--   Javobda {"ok":true,"scanned":N,"deleted":M} chiqishi kerak.
--
-- To'xtatish kerak bo'lsa:
--   select cron.unschedule('cleanup-ticket-pngs');
