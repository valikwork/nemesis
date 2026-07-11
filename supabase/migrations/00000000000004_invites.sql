-- Plan 3a (contract amendment 2026-07-11): invite lifecycle as RPCs.
-- Push notifications for these events arrive in Plan 4 without signature changes.

create or replace function create_invite(p_ordeal_id uuid, p_mode text, p_goal numeric)
returns invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite invites;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'profile_required';
  end if;
  if p_mode not in ('endless','showdown') then
    raise exception 'bad_mode';
  end if;
  if (p_mode = 'showdown') <> (p_goal is not null) then
    raise exception 'bad_goal';
  end if;
  if p_goal is not null and p_goal <= 0 then
    raise exception 'bad_goal';
  end if;
  if not exists (select 1 from ordeals where id = p_ordeal_id and moderation_status = 'approved') then
    raise exception 'bad_ordeal';
  end if;
  if (select count(*) from invites
      where inviter = auth.uid() and status = 'pending' and expires_at > now()) >= 10 then
    raise exception 'too_many_invites';
  end if;

  insert into invites (inviter, ordeal_id, mode, goal_value)
  values (auth.uid(), p_ordeal_id, p_mode, p_goal)
  returning * into v_invite;
  return v_invite;
end;
$$;

create or replace function get_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite invites;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  select * into v_invite from invites where code = p_code;
  if not found then
    raise exception 'invite_dead';
  end if;
  if v_invite.status = 'pending' and v_invite.expires_at <= now() then
    update invites set status = 'expired' where id = v_invite.id;
    v_invite.status := 'expired';
  end if;
  select jsonb_build_object(
    'id', v_invite.id,
    'status', v_invite.status,
    'mode', v_invite.mode,
    'goal_value', v_invite.goal_value,
    'inviter_name', p.nemesis_name,
    'inviter_sigil', p.mask_avatar_id,
    'ordeal', jsonb_build_object(
      'id', o.id, 'name_en', o.name_en, 'name_uk', o.name_uk,
      'unit_en', o.unit_en, 'unit_uk', o.unit_uk,
      'name_custom', o.name_custom, 'unit_custom', o.unit_custom,
      'is_custom', o.is_custom, 'language', o.language
    )
  ) into v_result
  from profiles p, ordeals o
  where p.id = v_invite.inviter and o.id = v_invite.ordeal_id;
  if v_result is null then
    -- inviter account deleted between create and open
    raise exception 'invite_dead';
  end if;
  return v_result;
end;
$$;

create or replace function accept_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite invites;
  v_a uuid;
  v_b uuid;
  v_feud_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'profile_required';
  end if;

  select * into v_invite from invites where code = p_code for update;
  if not found then
    raise exception 'invite_dead';
  end if;
  if v_invite.status <> 'pending' or v_invite.expires_at <= now() then
    if v_invite.status = 'pending' then
      update invites set status = 'expired' where id = v_invite.id;
    end if;
    raise exception 'invite_dead';
  end if;
  if v_invite.inviter = auth.uid() then
    raise exception 'self_accept';
  end if;
  if not exists (select 1 from profiles where id = v_invite.inviter) then
    raise exception 'invite_dead';
  end if;
  if exists (select 1 from blocks
             where (blocker = auth.uid() and blocked = v_invite.inviter)
                or (blocker = v_invite.inviter and blocked = auth.uid())) then
    raise exception 'blocked';
  end if;

  v_a := least(v_invite.inviter, auth.uid());
  v_b := greatest(v_invite.inviter, auth.uid());

  if exists (select 1 from feuds
             where profile_a = v_a and profile_b = v_b and ordeal_id = v_invite.ordeal_id
               and status in ('proposed','active')) then
    raise exception 'feud_exists';
  end if;

  insert into feuds (profile_a, profile_b, ordeal_id, mode, goal_value, status)
  values (v_a, v_b, v_invite.ordeal_id, v_invite.mode, v_invite.goal_value, 'active')
  returning id into v_feud_id;

  update invites set status = 'accepted', accepted_by = auth.uid() where id = v_invite.id;
  return v_feud_id;
end;
$$;

create or replace function revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  update invites set status = 'revoked'
  where id = p_invite_id and inviter = auth.uid() and status = 'pending';
  if not found then
    raise exception 'invite_dead';
  end if;
end;
$$;

revoke execute on function create_invite(uuid, text, numeric) from public;
revoke execute on function get_invite(text) from public;
revoke execute on function accept_invite(text) from public;
revoke execute on function revoke_invite(uuid) from public;
grant execute on function create_invite(uuid, text, numeric) to authenticated;
grant execute on function get_invite(text) to authenticated;
grant execute on function accept_invite(text) to authenticated;
grant execute on function revoke_invite(uuid) to authenticated;
