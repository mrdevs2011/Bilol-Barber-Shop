-- =============================================================================
-- WEB PUSH NOTIFICATION (bepul, brauzer push xabarnomalari)
-- Bu faylni Supabase Dashboard -> SQL Editor -> "New query" ga qo'yib RUN qiling.
--
-- NIMA UCHUN KERAK: Telegram'ga obuna bo'lmagan mijozlar ham, hatto telefon
-- yopiq/qulflangan holatda ham (PWA o'rnatilgan bo'lsa) bron eslatmasini
-- oladi. Admin esa yangi bron tushganda darhol xabar oladi — sayt yoki
-- Telegram ochiq bo'lishi shart emas.
--
-- Ishlash mantig'i:
--  1) Mijoz/admin brauzerda "Push xabarnomalarni yoqish" tugmasini bosadi.
--  2) Brauzer PushManager orqali obuna (subscription) yaratadi (endpoint +
--     shifrlash kalitlari p256dh/auth) — bu maxfiy KALIT EMAS, faqat shu
--     qurilmaga xabar yuborish uchun "manzil".
--  3) Shu obuna quyidagi push_subscriptions jadvaliga yoziladi.
--  4) Server tomon (Vercel /api/notify-admin va Supabase send-reminders
--     funksiyasi) VAPID kaliti bilan shifrlab, to'g'ridan-to'g'ri brauzer
--     push xizmatiga (Google/Mozilla/Apple) yuboradi — hech qanday to'lov
--     yoki uchinchi tomon SMS xizmati kerak emas.
-- =============================================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  is_admin boolean not null default false,
  lang text default 'uz',
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on push_subscriptions(user_id);
create index if not exists push_subscriptions_is_admin_idx on push_subscriptions(is_admin) where is_admin = true;

alter table push_subscriptions enable row level security;

-- Mijoz/Admin FAQAT o'ziga tegishli obunani yaratadi (user_id = auth.uid()).
-- is_admin=true faqat `admins` jadvalida bo'lgan foydalanuvchi uchun
-- ruxsat etiladi — aks holda oddiy mijoz o'zini soxta ravishda admin qilib
-- belgilab, adminga kelayotgan xabarlarni ko'rib turishi mumkin edi.
drop policy if exists "push: o'zi yaratadi" on push_subscriptions;
create policy "push: o'zi yaratadi" on push_subscriptions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      is_admin = false
      or exists (select 1 from admins a where a.user_id = auth.uid())
    )
  );

-- O'zi o'z obunalarini ko'radi (masalan "yoqilganmi" holatini tekshirish uchun).
drop policy if exists "push: o'zi ko'radi" on push_subscriptions;
create policy "push: o'zi ko'radi" on push_subscriptions
  for select to authenticated using (user_id = auth.uid());

-- O'zi o'z obunasini o'chira oladi (masalan "xabarnomalarni o'chirish").
drop policy if exists "push: o'zi o'chiradi" on push_subscriptions;
create policy "push: o'zi o'chiradi" on push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- MUHIM: bu jadvalni server tomon (Vercel /api/notify-admin,
-- Supabase Edge Function send-reminders) SERVICE ROLE kaliti bilan
-- o'qiydi/yozadi (masalan eskirgan/bekor qilingan obunani o'chirish uchun)
-- — service role RLS'ni chetlab o'tadi, shuning uchun bu yerda alohida
-- policy kerak emas.
