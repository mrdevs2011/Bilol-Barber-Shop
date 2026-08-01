-- =============================================================================
-- PATCH (round-20): KATALOG UCHUN ARZON "O'ZGARISHNI TEKSHIRISH" MEXANIZMI.
--
-- NIMA UCHUN: mijoz sayti (index.html) ham, admin panel ham har safar
-- ochilganda services/masters jadvallarini TO'LIQ (barcha ustunlar: nom,
-- tavsif — 3 tilda, narx, davomiylik, rasm manzili) qayta so'rar edi —
-- hatto admin hech narsa o'zgartirmagan bo'lsa ham. Bu Supabase'ga keraksiz
-- borib-kelish va trafik sarflaydi.
--
-- YECHIM: har ikkala jadvalga "updated_at" ustuni qo'shiladi va u har bir
-- UPDATE'da avtomatik yangilanadi (trigger). Endi sahifa ochilganda avval
-- FAQAT id + active + updated_at (juda kichik, bir necha bayt/qator)
-- so'raladi — agar bu "imzo" oxirgi saqlangan bilan bir xil bo'lsa, katalog
-- o'zgarmagan deb hisoblanadi va to'liq ma'lumot QAYTA so'ralmaydi (js/data.js:
-- loadCatalogSmart). Imzo farq qilsagina to'liq so'rov yuboriladi.
--
-- Ishga tushirish: Supabase Dashboard -> SQL Editor -> shu faylning to'liq
-- kodini qo'ying -> Run. Idempotent (qayta ishga tushirish xavfsiz).
-- =============================================================================

-- 1) Ustunni qo'shish (mavjud bo'lsa, xato bermaydi)
alter table "public"."services" add column if not exists "updated_at" timestamptz not null default now();
alter table "public"."masters"  add column if not exists "updated_at" timestamptz not null default now();

-- 2) Mavjud qatorlar uchun boshlang'ich qiymat (default'ni bir martalik to'ldirish)
update "public"."services" set "updated_at" = now() where "updated_at" is null;
update "public"."masters"  set "updated_at" = now() where "updated_at" is null;

-- 3) Har bir UPDATE'da avtomatik yangilanadigan trigger funksiyasi
--    (admin panelda narx/nom/tavsif/rasm/active o'zgartirilganda ishga tushadi)
create or replace function "public"."set_updated_at"()
returns trigger
language plpgsql
as $$
begin
  new."updated_at" := now();
  return new;
end;
$$;

drop trigger if exists "services_set_updated_at" on "public"."services";
create trigger "services_set_updated_at"
  before update on "public"."services"
  for each row execute function "public"."set_updated_at"();

drop trigger if exists "masters_set_updated_at" on "public"."masters";
create trigger "masters_set_updated_at"
  before update on "public"."masters"
  for each row execute function "public"."set_updated_at"();

-- 4) Tezkor tekshiruv so'rovi (id+active+updated_at, faqat active=true)
--    juda tez ishlashi uchun indeks — kichik jadvallarda shart emas, lekin
--    kelajakda xizmat/xodim soni ko'paysa ham tezlikni kafolatlaydi.
create index if not exists "services_active_idx" on "public"."services" ("active");
create index if not exists "masters_active_idx"  on "public"."masters"  ("active");

-- Tekshirish uchun:
--   select id, active, updated_at from services order by updated_at desc limit 5;
--   select id, active, updated_at from masters  order by updated_at desc limit 5;
-- =============================================================================
