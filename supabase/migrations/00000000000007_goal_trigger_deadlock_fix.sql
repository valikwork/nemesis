-- Fix (Plan 3a review, live-reproduced): the original trigger took
-- `select ... for update` on the feuds row. Every score insert already holds
-- a FOR KEY SHARE lock on that row (FK reference), so two concurrent inserts
-- from different members acquired locks in opposite orders and deadlocked --
-- on the single most common concurrent action in the product.
--
-- New shape: plain (lockless) read of mode/status/goal, then a single atomic
-- UPDATE guarded by `status = 'active'`. A non-key UPDATE takes FOR NO KEY
-- UPDATE, which is compatible with concurrent FK KEY SHARE locks -- no cycle.
-- If two authors cross the goal simultaneously, both run the UPDATE; the
-- status guard makes exactly one win (first committer sets 'ended', the
-- second matches zero rows).

create or replace function check_showdown_goal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_status text;
  v_goal numeric;
  v_total numeric;
begin
  select mode, status, goal_value into v_mode, v_status, v_goal
  from feuds where id = new.feud_id;

  if v_mode <> 'showdown' or v_status <> 'active' then
    return new;
  end if;

  select coalesce(sum(value), 0) into v_total
  from score_entries
  where feud_id = new.feud_id and author = new.author;

  if v_total >= v_goal then
    update feuds
    set status = 'ended', winner = new.author, ended_at = now()
    where id = new.feud_id and status = 'active';
  end if;
  return new;
end;
$$;
