-- Owner decision (2026-07-12, P4-6 walk): taunts are unlimited per feud.
-- The daily-limit machinery is removed; send_taunt's unique-violation guard
-- becomes unreachable and stays as a harmless dead path.
drop index if exists taunts_daily;
alter table taunts drop column if exists created_day;
