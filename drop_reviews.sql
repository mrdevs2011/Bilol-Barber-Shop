-- ixtiyoriy: o'chirishdan oldin zaxira
create table if not exists public.reviews_backup_20260730 as select * from public.reviews;

-- asosiy amal
drop table if exists public.reviews cascade;
