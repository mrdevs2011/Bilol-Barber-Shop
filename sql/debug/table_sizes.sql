select
  t.relname as jadval,
  pg_size_pretty(pg_total_relation_size(t.relid)) as jami_hajm,
  pg_size_pretty(pg_relation_size(t.relid)) as jadval_hajmi,
  pg_size_pretty(pg_total_relation_size(t.relid) - pg_relation_size(t.relid)) as indeks_hajmi,
  t.n_live_tup as qator_soni
from pg_stat_user_tables t
where t.schemaname = 'public'
order by pg_total_relation_size(t.relid) desc;
