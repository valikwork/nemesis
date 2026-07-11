-- Plan 3a: showdown goal completion (contract amendment 2026-07-11).
-- Runs as trigger owner; keep it cheap -- one aggregate per score insert.

create or replace function check_showdown_goal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feud feuds;
  v_total numeric;
begin
  select * into v_feud from feuds where id = new.feud_id for update;
  if v_feud.mode <> 'showdown' or v_feud.status <> 'active' then
    return new;
  end if;
  select coalesce(sum(value), 0) into v_total
  from score_entries
  where feud_id = new.feud_id and author = new.author;
  if v_total >= v_feud.goal_value then
    update feuds
    set status = 'ended', winner = new.author, ended_at = now()
    where id = new.feud_id;
  end if;
  return new;
end;
$$;

create trigger score_entries_goal_check
after insert on score_entries
for each row execute function check_showdown_goal();
