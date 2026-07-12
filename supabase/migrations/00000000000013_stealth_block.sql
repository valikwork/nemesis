-- Stealth block (owner decision 2026-07-12): a blocked party must not learn
-- they were blocked. get_invite and accept_invite now raise 'invite_dead' for
-- a blocked pair — indistinguishable from an expired/revoked summons. The
-- invite row itself stays pending so the blocker's own pending list is intact.
-- Blocks are permanent by design (no unblock).

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
  if exists (select 1 from blocks
             where (blocker = auth.uid() and blocked = v_invite.inviter)
                or (blocker = v_invite.inviter and blocked = auth.uid())) then
    raise exception 'invite_dead';
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
    raise exception 'invite_dead'; -- stealth: never reveal the block
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
