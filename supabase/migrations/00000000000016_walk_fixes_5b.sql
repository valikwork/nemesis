-- Plan 5b walk findings (owner, 2026-07-12):
-- 1. Proposed feuds were invisible on home: profiles_feud_partner only covered
--    active/ended, so the opponent's persona was unreadable and the client
--    dropped the row. Gauntlets need the proposer's face.
-- 2. Deck card must show the rival's WHOLE ordeal list — shared first, the
--    rest beneath (owner: "show common but then show all else under that").
-- 3. The first swiper never learns of the match (matched=true fires only for
--    the second swiper; push needs real devices). my_matches() lets home list
--    mutual likes that have no feud yet, so either side can throw the glove.

drop policy profiles_feud_partner on profiles;
create policy profiles_feud_partner on profiles for select
  using (exists (select 1 from feuds f
    where f.status in ('proposed','active','ended')
      and ((f.profile_a = profiles.id and f.profile_b = auth.uid())
        or (f.profile_b = profiles.id and f.profile_a = auth.uid()))));

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
    'ordeals', (
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name_en', o.name_en, 'name_uk', o.name_uk,
        'unit_en', o.unit_en, 'unit_uk', o.unit_uk,
        'name_custom', o.name_custom, 'unit_custom', o.unit_custom,
        'is_custom', o.is_custom, 'language', o.language,
        'skill_hint', po.skill_hint,
        'shared', po.ordeal_id in (select ordeal_id from profile_ordeals where profile_id = v_me.id)
      ) order by
        (po.ordeal_id in (select ordeal_id from profile_ordeals where profile_id = v_me.id)) desc)
      from profile_ordeals po
      join ordeals o on o.id = po.ordeal_id
      where po.profile_id = p.id
        and o.moderation_status = 'approved'
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

-- Matches with no feud yet: mutual like, no block, no live/proposed feud.
-- Shape mirrors a deck card (shared ordeals only — the glove needs them).
create or replace function my_matches()
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  return query
  select jsonb_build_object(
    'id', p.id,
    'nemesis_name', p.nemesis_name,
    'catchphrase', p.catchphrase,
    'mask_avatar_id', p.mask_avatar_id,
    'shared_ordeals', (
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name_en', o.name_en, 'name_uk', o.name_uk,
        'unit_en', o.unit_en, 'unit_uk', o.unit_uk,
        'name_custom', o.name_custom, 'unit_custom', o.unit_custom,
        'is_custom', o.is_custom, 'language', o.language
      ))
      from profile_ordeals po
      join ordeals o on o.id = po.ordeal_id and o.moderation_status = 'approved'
      where po.profile_id = p.id
        and po.ordeal_id in (select ordeal_id from profile_ordeals where profile_id = auth.uid())
    )
  )
  from profiles p
  where exists (select 1 from swipes s1
                where s1.swiper = auth.uid() and s1.target = p.id and s1.liked)
    and exists (select 1 from swipes s2
                where s2.swiper = p.id and s2.target = auth.uid() and s2.liked)
    and not exists (select 1 from blocks b
                    where (b.blocker = auth.uid() and b.blocked = p.id)
                       or (b.blocker = p.id and b.blocked = auth.uid()))
    and not exists (select 1 from feuds f
                    where f.status in ('proposed','active')
                      and f.profile_a = least(auth.uid(), p.id)
                      and f.profile_b = greatest(auth.uid(), p.id));
end;
$$;

revoke execute on function my_matches() from public;
grant execute on function my_matches() to authenticated;
