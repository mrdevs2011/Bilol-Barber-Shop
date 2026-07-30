


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" bigint NOT NULL,
    "service_id" "text" NOT NULL,
    "service_name" "text" NOT NULL,
    "master_id" "text" NOT NULL,
    "master_name" "text" NOT NULL,
    "booking_date" "date" NOT NULL,
    "booking_time" "text" NOT NULL,
    "client_name" "text" NOT NULL,
    "client_phone" "text" NOT NULL,
    "price" bigint NOT NULL,
    "duration" integer NOT NULL,
    "status" "text" DEFAULT 'new'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "client_chat_id" bigint,
    "reminder_sent" boolean DEFAULT false,
    "reminder_stage" integer DEFAULT 0,
    "user_id" "uuid"
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_edit_booking"("p_booking_id" bigint, "p_service_id" "text", "p_master_id" "text", "p_date" "date", "p_time" "text", "p_client_name" "text", "p_client_phone" "text") RETURNS "public"."bookings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  -- O'ZGARTIRISH: endi faqat "tasdiqlangan" (confirmed) statusidagi bronlar
  -- tahrirlanadi. "Yangi" (new) statusidagi bronni tahrirlab bo'lmaydi.
  if v_row.status <> 'confirmed' then
    raise exception 'Faqat "Tasdiqlangan" holatidagi bronlarni tahrirlash mumkin.';
  end if;

  if v_name = '' or v_phone = '' then
    raise exception 'Mijoz ismi va telefonini kiriting.';
  end if;

  select * into svc from services where id = p_service_id and active = true;
  if not found then
    raise exception 'Noto''g''ri yoki mavjud bo''lmagan xizmat: %', p_service_id;
  end if;

  select * into mst from masters where id = p_master_id and active = true;
  if not found then
    raise exception 'Noto''g''ri yoki mavjud bo''lmagan barber: %', p_master_id;
  end if;

  booking_start := (p_date::text || ' ' || p_time)::timestamp;
  now_tashkent := now() at time zone 'Asia/Tashkent';

  if booking_start < now_tashkent - interval '1 minute' then
    raise exception 'Bu vaqt allaqachon o''tib ketgan. Iltimos, kelajakdagi vaqtni tanlang.';
  end if;
  if booking_start > now_tashkent + interval '90 days' then
    raise exception 'Bron vaqti juda uzoq kelajakka mo''ljallangan (90 kundan ortiq oldindan bo''lmaydi).';
  end if;

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


ALTER FUNCTION "public"."admin_edit_booking"("p_booking_id" bigint, "p_service_id" "text", "p_master_id" "text", "p_date" "date", "p_time" "text", "p_client_name" "text", "p_client_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bookings_before_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  svc record;
  mst record;
  recent_same_phone int;
  recent_total int;
begin
  select id, name, price, duration into svc
  from public.services where id = new.service_id and active = true;
  if not found then
    raise exception 'Noma''lum yoki mavjud bo''lmagan xizmat: %', new.service_id;
  end if;
 
  select id, name into mst
  from public.masters where id = new.master_id and active = true;
  if not found then
    raise exception 'Noma''lum yoki mavjud bo''lmagan barber: %', new.master_id;
  end if;
 
  new.service_name := svc.name;
  new.price         := svc.price;
  new.duration       := svc.duration;
  new.master_name    := mst.name;
  new.status          := 'new';
 
  if length(trim(new.client_name)) < 2 or length(new.client_name) > 100 then
    raise exception 'Ism noto''g''ri kiritilgan.';
  end if;
  if length(trim(new.client_phone)) < 7 or length(new.client_phone) > 20 then
    raise exception 'Telefon raqam noto''g''ri kiritilgan.';
  end if;
  if new.booking_date < current_date then
    raise exception 'O''tgan sanaga bron qilib bo''lmaydi.';
  end if;
 
  select count(*) into recent_same_phone
  from public.bookings
  where client_phone = new.client_phone
    and created_at > now() - interval '2 minutes';
  if recent_same_phone > 0 then
    raise exception 'Siz yaqinda bron yubordingiz. Iltimos, bir necha daqiqadan so''ng qayta urinib ko''ring.';
  end if;
 
  select count(*) into recent_total
  from public.bookings
  where created_at > now() - interval '1 minute';
  if recent_total >= 8 then
    raise exception 'Hozir so''rovlar soni ko''p. Iltimos, bir necha daqiqadan so''ng qayta urinib ko''ring.';
  end if;
 
  return new;
end;
$$;


ALTER FUNCTION "public"."bookings_before_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_own_booking"("p_booking_id" bigint) RETURNS "public"."bookings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."cancel_own_booking"("p_booking_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_active_booking_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  active_count int;
begin
  if new.user_id is null then
    return new;
  end if;

  select count(*) into active_count
  from bookings
  where user_id = new.user_id
    and status in ('new', 'confirmed')
    and (tg_op = 'INSERT' or id <> new.id);

  if active_count >= 2 then
    raise exception 'Sizda allaqachon 2 ta faol bron bor. Yangi bron qilishdan oldin birini bekor qiling yoki kutib turing.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_active_booking_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_booking_time_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  booking_dt timestamp;
  now_local  timestamp;
begin
  booking_dt := (new.booking_date::text || ' ' || new.booking_time::text)::timestamp;
  now_local  := (now() at time zone 'Asia/Tashkent');
 
  -- 1) Yangi bron allaqachon o'tib ketgan vaqtga qilinmasin
  if tg_op = 'INSERT' and booking_dt < now_local then
    raise exception 'Bu vaqt allaqachon o''tib ketgan, bron qilib bo''lmaydi.';
  end if;
 
  -- 2) Kelajakdagi bronni "Bajarilgan" deb bo'lmaydi
  if new.status = 'done' and booking_dt > now_local then
    raise exception 'Hali bo''lib o''tmagan bronni "Bajarilgan" deb belgilab bo''lmaydi.';
  end if;
 
  -- 3) O'tib ketgan bronni "Yangi"/"Tasdiqlangan" deb bo'lmaydi
  if new.status in ('new', 'confirmed') and booking_dt <= now_local then
    raise exception 'Allaqachon o''tib ketgan bronni "%" deb belgilab bo''lmaydi.', new.status;
  end if;
 
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_booking_time_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_no_overlapping_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."enforce_no_overlapping_booking"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, phone, full_name)
  values (new.id, new.raw_user_meta_data ->> 'phone', new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_no_show"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'no_show'
     and (old.status is distinct from 'no_show')
     and new.user_id is not null then
    update profiles
      set no_show_count = no_show_count + 1,
          blocked = (no_show_count + 1) >= 3
      where id = new.user_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_no_show"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (select 1 from admins a where a.user_id = auth.uid()) then
    new.blocked := old.blocked;
    new.no_show_count := old.no_show_count;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_profile_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reviews_protect_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.approved := false;
  elsif not exists (select 1 from admins a where a.user_id = auth.uid()) then
    new.approved := old.approved;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."reviews_protect_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_comment_defaults"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."set_comment_defaults"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_booking_against_catalog"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  svc services%rowtype;
  mst masters%rowtype;
begin
  select * into svc from services where id = new.service_id and active = true;
  if not found then
    raise exception 'Noto''g''ri yoki mavjud bo''lmagan xizmat: %', new.service_id;
  end if;

  select * into mst from masters where id = new.master_id and active = true;
  if not found then
    raise exception 'Noto''g''ri yoki mavjud bo''lmagan barber: %', new.master_id;
  end if;

  -- Narx, davomiylik va nomlarni MIJOZ kiritgan qiymatlar bilan emas,
  -- KATALOGDAGI haqiqiy qiymatlar bilan majburan almashtiramiz —
  -- shunday qilib brauzerdan yuborilgan soxta narx umuman e'tiborga
  -- olinmaydi, xato qaytarish o'rniga har doim to'g'ri qiymat yoziladi.
  new.price := svc.price;
  new.duration := svc.duration;
  new.service_name := svc.name;
  new.master_name := mst.name;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_booking_against_catalog"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_booking_against_time_off"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."validate_booking_against_time_off"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admins" (
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."admins" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."booked_slots" AS
 SELECT "master_id",
    "booking_date",
    "booking_time",
    "duration"
   FROM "public"."bookings"
  WHERE ("status" <> 'cancelled'::"text");


ALTER VIEW "public"."booked_slots" OWNER TO "postgres";


ALTER TABLE "public"."bookings" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."bookings_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_name" "text" NOT NULL,
    "rating" smallint NOT NULL,
    "comment_text" "text" NOT NULL,
    "customer_type" "text" DEFAULT 'yangi'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "comments_comment_text_check" CHECK ((("char_length"(TRIM(BOTH FROM "comment_text")) >= 3) AND ("char_length"(TRIM(BOTH FROM "comment_text")) <= 500))),
    CONSTRAINT "comments_customer_type_check" CHECK (("customer_type" = ANY (ARRAY['yangi'::"text", 'doimiy'::"text"]))),
    CONSTRAINT "comments_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "comments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


ALTER TABLE "public"."comments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."comments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."master_time_off" (
    "id" bigint NOT NULL,
    "master_id" "text" NOT NULL,
    "off_date" "date" NOT NULL,
    "start_time" "text",
    "end_time" "text",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "time_range_valid" CHECK (((("start_time" IS NULL) AND ("end_time" IS NULL)) OR (("start_time" IS NOT NULL) AND ("end_time" IS NOT NULL) AND ("end_time" > "start_time"))))
);


ALTER TABLE "public"."master_time_off" OWNER TO "postgres";


ALTER TABLE "public"."master_time_off" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."master_time_off_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."masters" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "photo_url" "text",
    "description" "text"
);


ALTER TABLE "public"."masters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "phone" "text",
    "full_name" "text",
    "no_show_count" integer DEFAULT 0 NOT NULL,
    "blocked" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_name" "text" NOT NULL,
    "rating" smallint NOT NULL,
    "duration_label" "text" NOT NULL,
    "comment" "text" NOT NULL,
    "approved" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


ALTER TABLE "public"."reviews" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."reviews_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "price" bigint NOT NULL,
    "duration" integer NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."services" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."master_time_off"
    ADD CONSTRAINT "master_time_off_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."masters"
    ADD CONSTRAINT "masters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



CREATE INDEX "bookings_created_at_idx" ON "public"."bookings" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "bookings_master_slot_unique" ON "public"."bookings" USING "btree" ("master_id", "booking_date", "booking_time") WHERE ("status" <> 'cancelled'::"text");



CREATE INDEX "bookings_status_idx" ON "public"."bookings" USING "btree" ("status");



CREATE INDEX "comments_status_created_idx" ON "public"."comments" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "comments_user_idx" ON "public"."comments" USING "btree" ("user_id");



CREATE INDEX "idx_master_time_off_lookup" ON "public"."master_time_off" USING "btree" ("master_id", "off_date");



CREATE OR REPLACE TRIGGER "on_booking_limit_check" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_active_booking_limit"();



CREATE OR REPLACE TRIGGER "on_booking_no_overlap" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_no_overlapping_booking"();



CREATE OR REPLACE TRIGGER "on_booking_no_show" AFTER UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."handle_no_show"();



CREATE OR REPLACE TRIGGER "on_booking_validate_catalog" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_booking_against_catalog"();



CREATE OR REPLACE TRIGGER "on_booking_validate_time_off" BEFORE INSERT OR UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_booking_against_time_off"();



CREATE OR REPLACE TRIGGER "on_comment_insert_defaults" BEFORE INSERT ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_comment_defaults"();



CREATE OR REPLACE TRIGGER "on_profile_update_protect" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_fields"();



CREATE OR REPLACE TRIGGER "on_review_protect" BEFORE INSERT OR UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."reviews_protect_fields"();



CREATE OR REPLACE TRIGGER "trg_bookings_before_insert" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."bookings_before_insert"();



CREATE OR REPLACE TRIGGER "trg_enforce_booking_time_rules" BEFORE INSERT OR UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_booking_time_rules"();



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."master_time_off"
    ADD CONSTRAINT "master_time_off_master_id_fkey" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin: mijoz nomidan qo'lda bron qo'shadi" ON "public"."bookings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admin: sharhni o'chiradi" ON "public"."comments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admin: sharhni yangilaydi" ON "public"."comments" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "Mijoz/Admin: tasdiqlangan, o'zi yoki admin" ON "public"."comments" FOR SELECT TO "authenticated" USING ((("status" = 'approved'::"text") OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"())))));



CREATE POLICY "Mijoz: o'ziga va bloklanmagan bo'lsa bron qiladi" ON "public"."bookings" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."blocked" = true)))))));



CREATE POLICY "Mijoz: sharh qoldiradi" ON "public"."comments" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."blocked" = true)))))));



CREATE POLICY "O'chirish: faqat admin" ON "public"."bookings" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "O'qish: o'zi yoki admin" ON "public"."bookings" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"())))));



CREATE POLICY "Ommaviy: faqat tasdiqlangan sharhlar" ON "public"."comments" FOR SELECT TO "anon" USING (("status" = 'approved'::"text"));



CREATE POLICY "Yangilash: faqat admin" ON "public"."bookings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "admin ko'radi o'zini" ON "public"."admins" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."master_time_off" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."masters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "masters: admin o'chiradi" ON "public"."masters" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "masters: admin qo'shadi" ON "public"."masters" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "masters: admin yangilaydi" ON "public"."masters" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "masters: hammaga o'qish" ON "public"."masters" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "profil: admin yangilaydi" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "profil: o'zi yangilaydi" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profil: o'zini yoki admin ko'radi" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews: admin o'chiradi" ON "public"."reviews" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "reviews: mijoz qo'shadi" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "reviews: o'qish" ON "public"."reviews" FOR SELECT TO "authenticated", "anon" USING ((("approved" = true) OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"())))));



CREATE POLICY "reviews: yangilash" ON "public"."reviews" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "services: admin o'chiradi" ON "public"."services" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "services: admin qo'shadi" ON "public"."services" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "services: admin yangilaydi" ON "public"."services" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "services: hammaga o'qish" ON "public"."services" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "time_off: faqat admin o'chiradi" ON "public"."master_time_off" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "time_off: faqat admin qo'shadi" ON "public"."master_time_off" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."user_id" = "auth"."uid"()))));



CREATE POLICY "time_off: hammaga o'qish" ON "public"."master_time_off" FOR SELECT TO "authenticated", "anon" USING (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";
GRANT INSERT ON TABLE "public"."bookings" TO "anon";



GRANT SELECT("id") ON TABLE "public"."bookings" TO "anon";



GRANT ALL ON FUNCTION "public"."admin_edit_booking"("p_booking_id" bigint, "p_service_id" "text", "p_master_id" "text", "p_date" "date", "p_time" "text", "p_client_name" "text", "p_client_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_edit_booking"("p_booking_id" bigint, "p_service_id" "text", "p_master_id" "text", "p_date" "date", "p_time" "text", "p_client_name" "text", "p_client_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_edit_booking"("p_booking_id" bigint, "p_service_id" "text", "p_master_id" "text", "p_date" "date", "p_time" "text", "p_client_name" "text", "p_client_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."bookings_before_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."bookings_before_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bookings_before_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_own_booking"("p_booking_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_own_booking"("p_booking_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_own_booking"("p_booking_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_active_booking_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_active_booking_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_active_booking_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_booking_time_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_booking_time_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_booking_time_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_no_overlapping_booking"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_no_overlapping_booking"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_no_overlapping_booking"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_no_show"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_no_show"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_no_show"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_profile_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_profile_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_profile_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reviews_protect_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."reviews_protect_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reviews_protect_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_comment_defaults"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_comment_defaults"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_comment_defaults"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_booking_against_catalog"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_booking_against_catalog"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_booking_against_catalog"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_booking_against_time_off"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_booking_against_time_off"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_booking_against_time_off"() TO "service_role";



GRANT ALL ON TABLE "public"."admins" TO "anon";
GRANT ALL ON TABLE "public"."admins" TO "authenticated";
GRANT ALL ON TABLE "public"."admins" TO "service_role";



GRANT ALL ON TABLE "public"."booked_slots" TO "service_role";
GRANT SELECT ON TABLE "public"."booked_slots" TO "anon";
GRANT SELECT ON TABLE "public"."booked_slots" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."bookings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bookings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bookings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."comments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."comments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."comments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."master_time_off" TO "anon";
GRANT ALL ON TABLE "public"."master_time_off" TO "authenticated";
GRANT ALL ON TABLE "public"."master_time_off" TO "service_role";



GRANT ALL ON SEQUENCE "public"."master_time_off_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."master_time_off_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."master_time_off_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."masters" TO "anon";
GRANT ALL ON TABLE "public"."masters" TO "authenticated";
GRANT ALL ON TABLE "public"."masters" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







