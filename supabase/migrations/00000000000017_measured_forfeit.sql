-- Plan 5c: measured ordeals (latest-value aggregation) + inactivity forfeit.
-- design-spec §17 open question resolved: ordeals carry an aggregation mode.
-- 'sum' (default) = deeds add up. 'latest' = level tracking (rating, max
-- bench): towers show the most recent value, showdown = first to REACH goal.
-- §14 forfeit: opponent silent 14+ days on an active feud → either party may
-- claim it. N=14 (open question resolved).

alter table ordeals
  add column aggregation text not null default 'sum'
    check (aggregation in ('sum','latest'));

-- Goal trigger learns 'latest': the row being inserted IS the newest value,
-- so the comparison is simply new.value >= goal. Same lockless shape as 0007.
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
  v_agg text;
  v_total numeric;
begin
  select f.mode, f.status, f.goal_value, o.aggregation
  into v_mode, v_status, v_goal, v_agg
  from feuds f join ordeals o on o.id = f.ordeal_id
  where f.id = new.feud_id;

  if v_mode <> 'showdown' or v_status <> 'active' then
    return new;
  end if;

  if v_agg = 'latest' then
    v_total := new.value;
  else
    select coalesce(sum(value), 0) into v_total
    from score_entries
    where feud_id = new.feud_id and author = new.author;
  end if;

  if v_total >= v_goal then
    update feuds
    set status = 'ended', winner = new.author, ended_at = now()
    where id = new.feud_id and status = 'active';
  end if;
  return new;
end;
$$;

-- forge_ordeal gains the aggregation choice (4-arg replaces 3-arg).
drop function forge_ordeal(text, text, text);
create or replace function forge_ordeal(
  p_name text, p_unit text, p_language text, p_aggregation text default 'sum'
)
returns ordeals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordeal ordeals;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if p_language not in ('en','uk') then
    raise exception 'bad_language';
  end if;
  if p_aggregation not in ('sum','latest') then
    raise exception 'bad_aggregation';
  end if;
  if char_length(trim(p_name)) not between 2 and 40 then
    raise exception 'ordeal_rejected';
  end if;
  if char_length(trim(p_unit)) not between 1 and 20 then
    raise exception 'ordeal_rejected';
  end if;
  if exists (
    select 1 from banned_words b
    where lower(p_name) like '%' || b.word || '%'
       or lower(p_unit) like '%' || b.word || '%'
  ) then
    raise exception 'ordeal_rejected' using errcode = 'P0002';
  end if;

  insert into ordeals (name_custom, unit_custom, is_custom, created_by, language, moderation_status, aggregation)
  values (trim(p_name), trim(p_unit), true, auth.uid(), p_language, 'approved', p_aggregation)
  returning * into v_ordeal;
  return v_ordeal;
end;
$$;

revoke execute on function forge_ordeal(text, text, text, text) from public;
grant execute on function forge_ordeal(text, text, text, text) to authenticated;

-- Inactivity forfeit: the opponent's last logged deed (or the feud's start if
-- they never logged) must be 14+ days old. Winner = the claimant. Atomic
-- status guard, same reasoning as the goal trigger.
create or replace function forfeit_feud(p_feud_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feud feuds;
  v_opponent uuid;
  v_last timestamptz;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  select * into v_feud from feuds where id = p_feud_id;
  if not found or auth.uid() not in (v_feud.profile_a, v_feud.profile_b)
     or v_feud.status <> 'active' then
    raise exception 'feud_dead';
  end if;
  v_opponent := case when v_feud.profile_a = auth.uid() then v_feud.profile_b else v_feud.profile_a end;

  select coalesce(max(created_at), v_feud.created_at) into v_last
  from score_entries
  where feud_id = p_feud_id and author = v_opponent;

  if v_last > now() - interval '14 days' then
    raise exception 'not_gone_soft';
  end if;

  update feuds
  set status = 'ended', winner = auth.uid(), ended_at = now()
  where id = p_feud_id and status = 'active';
end;
$$;

revoke execute on function forfeit_feud(uuid) from public;
grant execute on function forfeit_feud(uuid) to authenticated;
