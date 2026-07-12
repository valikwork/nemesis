-- Plan 5b-2: the target of a pending declare must see the declarer's persona
-- (name/sigil in the "X names thee arch-nemesis" banner) — and vice versa —
-- even when no feud connects them yet (deck stranger declare). Mirrors
-- profiles_feud_partner.

create policy profiles_declare_party on profiles for select
  using (exists (
    select 1 from declares d
    where d.status in ('pending','accepted')
      and ((d.declarer = profiles.id and d.target = auth.uid())
        or (d.target = profiles.id and d.declarer = auth.uid()))));
