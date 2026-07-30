-- =============================================================================
-- MIJOZ TILI (client_lang) — Telegram xabarlari (bot tasdiqi, eslatmalar)
-- endi mijoz saytda tanlagan tilda ('uz' yoki 'ru') yuborilishi uchun.
--
-- MUAMMO (audit): sayt interfeysi (js/i18n.js) allaqachon to'liq ikki tilli
-- edi, LEKIN bu tanlov hech qayerda saqlanmas edi — bookings jadvalida
-- "qaysi tilda yozilgan bron" degan ustun umuman yo'q edi. Natijada:
--   - supabase/functions/telegram-webhook/index.ts (mijozga ketadigan
--     "Bron tasdiqlandi" xabari va karta rasmi)
--   - supabase/functions/send-reminders/index.ts (mijozga ketadigan
--     eslatma xabarlari)
-- doim faqat o'zbek tilida yozilardi — rus tilini tanlagan mijoz ham
-- botdan faqat o'zbekcha xabar olardi.
--
-- YECHIM: bron yaratilganda js/api.js endi joriy tilni (getLang()) shu
-- ustunga yozadi; ikkala Edge Function esa shu ustunni o'qib, mos tilda
-- javob beradi (kod supabase/functions/... ichida yangilangan).
--
-- Ishga tushirish: Supabase SQL Editor'da shu faylni bir marta bajaring.
-- =============================================================================

alter table bookings
  add column if not exists client_lang text not null default 'uz'
    check (client_lang in ('uz', 'ru'));

comment on column bookings.client_lang is
  'Mijoz saytda bron paytida tanlagan interfeys tili — Telegram bot xabarlari (tasdiq, eslatma) shu tilda yuboriladi.';
