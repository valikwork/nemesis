-- Account erasure was blocked by FKs referencing profiles with no ON DELETE
-- action: any user who ever accepted an invite (or was reported) could not be
-- deleted. Found live in the P5a-7 walk. Referencing rows must outlive the
-- erased profile with the reference nulled:
--   invites.accepted_by — the inviter keeps their invite history
--   reports.target      — reports are moderation records; keep them, anonymized
--   feuds.winner        — consistency; in practice the feud row cascades first
--                         (winner is always a feud party)

alter table invites
  drop constraint invites_accepted_by_fkey,
  add constraint invites_accepted_by_fkey
    foreign key (accepted_by) references profiles(id) on delete set null;

alter table reports
  alter column target drop not null,
  drop constraint reports_target_fkey,
  add constraint reports_target_fkey
    foreign key (target) references profiles(id) on delete set null;

alter table feuds
  drop constraint feuds_winner_fkey,
  add constraint feuds_winner_fkey
    foreign key (winner) references profiles(id) on delete set null;
