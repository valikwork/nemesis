# Plan 5c: Measured ordeals + inactivity forfeit

**2026-07-12 · Lean mode (owner-approved for Plan 5):** direct implementation, integration + unit tests gate. Closes Plan 5. Sources: design-spec §6/§14/§17 open question, contract amendments.

## Contract amendments introduced

1. **`ordeals.aggregation text not null default 'sum' check in ('sum','latest')`.** `sum` = current behavior (deeds add up). `latest` = level tracking (chess rating, max bench): towers show each side's most recent logged value; showdown = first to REACH goal (`new.value >= goal` in the trigger — the newest entry IS the latest value). Direction stays "higher is better" (direction column stayed removed; lower-is-better remains unsupported).
2. **`forge_ordeal` gains `p_aggregation text default 'sum'`** (4-arg signature replaces 3-arg; old signature dropped).
3. **`forfeit_feud(p_feud_id) returns void`** — member-only, active feuds. Eligible when the OPPONENT's last score entry (or the feud's `created_at` if they never logged) is older than **14 days** (design-spec open question "N" resolved: 14). Ends the feud with `winner = caller`, atomic `status='active'` guard. Ineligible → `not_gone_soft`.
4. **Gone-soft marker is client-derived** (opponent's last entry age > 14d, active feuds) — no schema flag; the marker and the forfeit button appear from the same computation.

## Tasks

- [ ] T1 Migration 0017: aggregation column; goal trigger handles `latest`; forge_ordeal 4-arg; forfeit_feud + grants.
- [ ] T2 Tests: trigger latest-mode (sum would have ended, latest doesn't; reaching value ends), forfeit eligibility/ineligibility (backdate via admin), forge aggregation; unit: tower-math latest geometry.
- [ ] T3 Client: tower-math `aggregation` arg (latest → height/totals from last entry, single segment); feudTotals/listFeudsWithMeta aggregation-aware + `goneSoft` flag; forge sheet aggregation picker; FeudRowCard gone-soft marker; feud screen forfeit button + confirm.
- [ ] T4 i18n EN/UA; contract sync repo + vault; full verify; commit.

Out of scope: lower-is-better metrics, radius editing UI (still deferred), push on device.
