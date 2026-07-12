-- Plan 5b-1: deck (hunting grounds) + arch-nemesis backend.
-- Contract amendments 2026-07-12: deck match creates no feud — matched party
-- proposes terms (proposed_by), other responds. Arch ops are RPCs (forge_ordeal
-- precedent). Stealth rules carry over: blocks never reveal themselves — a
-- blocked target is indistinguishable from a vanished one.

alter table feuds
  add column proposed_by uuid references profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- get_deck: nearby strangers sharing >=1 approved ordeal. Never returns location.
-- search_path includes extensions: PostGIS lives there (0001 hardening).
create or replace function get_deck(max_cards int default 20)
returns setof jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_me profiles;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  select * into v_me from profiles where id = auth.uid();
  if not found then
    raise exception 'profile_required';
  end if;
  if v_me.location is null or v_me.radius_km is null then
    raise exception 'location_required';
  end if;

  return query
  select jsonb_build_object(
    'id', p.id,
    'nemesis_name', p.nemesis_name,
    'catchphrase', p.catchphrase,
    'bio', p.bio,
    'mask_avatar_id', p.mask_avatar_id,
    'distance_km', round((st_distance(v_me.location, p.location) / 1000.0)::numeric, 1),
    'shared_ordeals', (
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name_en', o.name_en, 'name_uk', o.name_uk,
        'unit_en', o.unit_en, 'unit_uk', o.unit_uk,
        'name_custom', o.name_custom, 'unit_custom', o.unit_custom,
        'is_custom', o.is_custom, 'language', o.language,
        'skill_hint', po.skill_hint
      ))
      from profile_ordeals po
      join ordeals o on o.id = po.ordeal_id
      where po.profile_id = p.id
        and o.moderation_status = 'approved'
        and po.ordeal_id in (select ordeal_id from profile_ordeals where profile_id = v_me.id)
    )
  )
  from profiles p
  where p.id <> v_me.id
    and p.location is not null
    and p.radius_km is not null
    and st_dwithin(v_me.location, p.location, v_me.radius_km * 1000.0)
    and st_dwithin(v_me.location, p.location, p.radius_km * 1000.0)
    and exists (
      select 1 from profile_ordeals po
      join ordeals o on o.id = po.ordeal_id
      where po.profile_id = p.id
        and o.moderation_status = 'approved'
        and po.ordeal_id in (select ordeal_id from profile_ordeals where profile_id = v_me.id))
    and not exists (
      select 1 from swipes s where s.swiper = v_me.id and s.target = p.id)
    and not exists (
      select 1 from blocks b
      where (b.blocker = v_me.id and b.blocked = p.id)
         or (b.blocker = p.id and b.blocked = v_me.id))
    and not exists (
      select 1 from feuds f
      where f.status in ('proposed','active')
        and f.profile_a = least(v_me.id, p.id)
        and f.profile_b = greatest(v_me.id, p.id))
  order by st_distance(v_me.location, p.location)
  limit max_cards;
end;
$$;

-- ---------------------------------------------------------------------------
-- swipe_rival: record verdict, report mutual like. A block silently yields
-- matched=false — stealth, never confirms a block exists.
create or replace function swipe_rival(p_target uuid, p_liked boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'profile_required';
  end if;
  if p_target = auth.uid() then
    raise exception 'self_swipe';
  end if;
  if not exists (select 1 from profiles where id = p_target) then
    raise exception 'target_dead';
  end if;

  begin
    insert into swipes (swiper, target, liked) values (auth.uid(), p_target, p_liked);
  exception when unique_violation then
    raise exception 'already_swiped';
  end;

  return jsonb_build_object('matched',
    p_liked
    and exists (select 1 from swipes s
                where s.swiper = p_target and s.target = auth.uid() and s.liked)
    and not exists (select 1 from blocks b
                    where (b.blocker = auth.uid() and b.blocked = p_target)
                       or (b.blocker = p_target and b.blocked = auth.uid())));
end;
$$;

-- ---------------------------------------------------------------------------
-- propose_feud: a matched party throws the glove with concrete terms.
-- 'no_match' covers missing mutual like AND blocked pairs (stealth).
create or replace function propose_feud(p_target uuid, p_ordeal_id uuid, p_mode text, p_goal numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feud_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'profile_required';
  end if;
  if p_target = auth.uid() then
    raise exception 'self_feud';
  end if;
  if p_mode not in ('endless','showdown')
     or (p_mode = 'showdown') <> (p_goal is not null)
     or (p_goal is not null and p_goal <= 0) then
    raise exception 'bad_terms';
  end if;
  if not exists (select 1 from swipes s1
                 where s1.swiper = auth.uid() and s1.target = p_target and s1.liked)
     or not exists (select 1 from swipes s2
                    where s2.swiper = p_target and s2.target = auth.uid() and s2.liked)
     or exists (select 1 from blocks b
                where (b.blocker = auth.uid() and b.blocked = p_target)
                   or (b.blocker = p_target and b.blocked = auth.uid())) then
    raise exception 'no_match';
  end if;
  if not exists (select 1 from profile_ordeals where profile_id = auth.uid() and ordeal_id = p_ordeal_id)
     or not exists (select 1 from profile_ordeals where profile_id = p_target and ordeal_id = p_ordeal_id) then
    raise exception 'ordeal_not_shared';
  end if;
  if exists (select 1 from feuds
             where profile_a = least(auth.uid(), p_target)
               and profile_b = greatest(auth.uid(), p_target)
               and ordeal_id = p_ordeal_id
               and status in ('proposed','active')) then
    raise exception 'feud_exists';
  end if;

  insert into feuds (profile_a, profile_b, ordeal_id, mode, goal_value, status, proposed_by)
  values (least(auth.uid(), p_target), greatest(auth.uid(), p_target),
          p_ordeal_id, p_mode, p_goal, 'proposed', auth.uid())
  returning id into v_feud_id;
  return v_feud_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- respond_feud: the non-proposer answers. Decline dissolves the row.
create or replace function respond_feud(p_feud_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feud feuds;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  select * into v_feud from feuds where id = p_feud_id for update;
  if not found or auth.uid() not in (v_feud.profile_a, v_feud.profile_b)
     or v_feud.status <> 'proposed' then
    raise exception 'feud_dead';
  end if;
  if v_feud.proposed_by = auth.uid() then
    raise exception 'not_thine_to_answer';
  end if;

  if p_accept then
    update feuds set status = 'active' where id = p_feud_id;
  else
    update feuds set status = 'dissolved', ended_at = now() where id = p_feud_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- declare_arch: the once-ever declaration. Token returns 30 days after a
-- decline or dissolution (design-spec §8 safety valve).
create or replace function declare_arch(p_target uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_declare_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'profile_required';
  end if;
  if p_target = auth.uid() then
    raise exception 'self_declare';
  end if;
  if not exists (select 1 from profiles where id = p_target)
     or exists (select 1 from blocks b
                where (b.blocker = auth.uid() and b.blocked = p_target)
                   or (b.blocker = p_target and b.blocked = auth.uid())) then
    raise exception 'target_dead'; -- stealth: blocked == vanished
  end if;
  if exists (select 1 from feuds
             where is_arch and status = 'active'
               and auth.uid() in (profile_a, profile_b)) then
    raise exception 'arch_exists';
  end if;
  if exists (select 1 from declares
             where declarer = auth.uid() and status in ('pending','accepted')) then
    raise exception 'declare_pending';
  end if;
  if exists (select 1 from declares
             where declarer = auth.uid() and token_available_at > now()) then
    raise exception 'token_cooling';
  end if;

  insert into declares (declarer, target) values (auth.uid(), p_target)
  returning id into v_declare_id;
  return v_declare_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_declare: target answers the pact. Accept: the oldest live feud
-- between the pair becomes the pact; else a new arch feud ignites on the
-- pair's first shared approved ordeal (deck visibility guarantees one).
create or replace function resolve_declare(p_declare_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_declare declares;
  v_feud_id uuid;
  v_ordeal uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  select * into v_declare from declares where id = p_declare_id for update;
  if not found or v_declare.target <> auth.uid() or v_declare.status <> 'pending' then
    raise exception 'declare_dead';
  end if;

  if not p_accept then
    update declares
    set status = 'declined', resolved_at = now(),
        token_available_at = now() + interval '30 days'
    where id = p_declare_id;
    return null;
  end if;

  -- either side already pacted elsewhere?
  if exists (select 1 from feuds
             where is_arch and status = 'active'
               and (v_declare.declarer in (profile_a, profile_b)
                 or v_declare.target in (profile_a, profile_b))) then
    raise exception 'arch_exists';
  end if;

  select id into v_feud_id from feuds
  where profile_a = least(v_declare.declarer, v_declare.target)
    and profile_b = greatest(v_declare.declarer, v_declare.target)
    and status = 'active'
  order by created_at
  limit 1;

  if v_feud_id is not null then
    update feuds set is_arch = true, unmasked_at = now() where id = v_feud_id;
  else
    select po1.ordeal_id into v_ordeal
    from profile_ordeals po1
    join profile_ordeals po2 on po2.ordeal_id = po1.ordeal_id and po2.profile_id = v_declare.target
    join ordeals o on o.id = po1.ordeal_id and o.moderation_status = 'approved'
    where po1.profile_id = v_declare.declarer
    limit 1;
    if v_ordeal is null then
      raise exception 'no_shared_ordeal';
    end if;
    insert into feuds (profile_a, profile_b, ordeal_id, mode, status, is_arch, unmasked_at)
    values (least(v_declare.declarer, v_declare.target),
            greatest(v_declare.declarer, v_declare.target),
            v_ordeal, 'endless', 'active', true, now())
    returning id into v_feud_id;
  end if;

  update declares set status = 'accepted', resolved_at = now() where id = p_declare_id;
  return v_feud_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- dissolve_arch: safety valve. Pact dies instantly, unmask visibility ends
-- (unmask_pact policy requires status='active'), declarer's token returns
-- after the cooldown.
create or replace function dissolve_arch(p_feud_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feud feuds;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  select * into v_feud from feuds where id = p_feud_id for update;
  if not found or auth.uid() not in (v_feud.profile_a, v_feud.profile_b)
     or not v_feud.is_arch or v_feud.status <> 'active' then
    raise exception 'feud_dead';
  end if;

  update feuds set status = 'dissolved', ended_at = now() where id = p_feud_id;

  update declares
  set status = 'dissolved', resolved_at = now(),
      token_available_at = now() + interval '30 days'
  where status = 'accepted'
    and ((declarer = v_feud.profile_a and target = v_feud.profile_b)
      or (declarer = v_feud.profile_b and target = v_feud.profile_a));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated only, per-function (0001 rule: no blanket routine grants).
revoke execute on function get_deck(int) from public;
grant execute on function get_deck(int) to authenticated;
revoke execute on function swipe_rival(uuid, boolean) from public;
grant execute on function swipe_rival(uuid, boolean) to authenticated;
revoke execute on function propose_feud(uuid, uuid, text, numeric) from public;
grant execute on function propose_feud(uuid, uuid, text, numeric) to authenticated;
revoke execute on function respond_feud(uuid, boolean) from public;
grant execute on function respond_feud(uuid, boolean) to authenticated;
revoke execute on function declare_arch(uuid) from public;
grant execute on function declare_arch(uuid) to authenticated;
revoke execute on function resolve_declare(uuid, boolean) from public;
grant execute on function resolve_declare(uuid, boolean) to authenticated;
revoke execute on function dissolve_arch(uuid) from public;
grant execute on function dissolve_arch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- unmask-photos bucket: private; {profile_id}/{filename}; readable by the
-- owner and by an active unmasked arch partner (mirrors unmask_pact).
insert into storage.buckets (id, name, public)
values ('unmask-photos', 'unmask-photos', false)
on conflict (id) do nothing;

create policy unmask_photos_own_write on storage.objects for insert
  with check (
    bucket_id = 'unmask-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy unmask_photos_read on storage.objects for select
  using (
    bucket_id = 'unmask-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.feuds f
        where f.is_arch and f.unmasked_at is not null and f.status = 'active'
          and ((f.profile_a::text = (storage.foldername(name))[1] and f.profile_b = auth.uid())
            or (f.profile_b::text = (storage.foldername(name))[1] and f.profile_a = auth.uid()))
      )
    )
  );
