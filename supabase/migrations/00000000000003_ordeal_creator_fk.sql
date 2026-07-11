-- Fix caught in Plan-2 e2e walk: custom ordeals are forged DURING onboarding,
-- before the profiles row exists (persona is written at the seal step), so an
-- FK to profiles(id) can never be satisfied at forge time. The creator is an
-- account, not a persona -- reference auth.users directly.
-- ON DELETE SET NULL: account deletion cascade-wipes personal data, but a
-- custom ordeal may be referenced by other users' feuds and must survive as
-- an orphan rather than break those feuds.
alter table ordeals drop constraint ordeals_created_by_fkey;
alter table ordeals
  add constraint ordeals_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;
