# Plan 5b-1: Deck + Arch-Nemesis — backend

**2026-07-12 · Owner-approved lean mode:** direct implementation (no subagent ceremony), integration tests are the quality gate. UI (5b-2) next week. Sources: design-spec §5/§8, data-contract §1-§3 + amendments, copy-deck §3/§6.

## Contract amendments this plan introduces (append to data-contract on completion)

1. **Deck match ≠ feud.** Mutual like is recorded in `swipes` only. Either matched party then proposes terms — `propose_feud(p_target, p_ordeal_id, p_mode, p_goal)` creates a feud with `status='proposed'` and a new `feuds.proposed_by uuid` column; the other party calls `respond_feud(p_feud_id, p_accept)` → `active` or `dissolved`. Mirrors the invite glove-throw: one side sets terms, other answers. This is what the friends-first amendment's "deck feuds keep `proposed` for their setup step" means concretely.
2. **`swipe_rival(p_target, p_liked) returns jsonb {matched}`** — security definer; inserts the swipe, reports mutual like. Validates: not self, target exists, no block either direction, not already swiped.
3. **`get_deck(max_cards int default 20)`** — as contracted (§3): needs caller location else raises `location_required`; nearby via `st_dwithin` of both radii; shares ≥1 approved ordeal; not swiped by caller; no block; no live feud with caller (any ordeal); no pending proposed feud between pair. Returns persona + `distance_km` + shared ordeals with skill hints. Never location.
4. **Arch ops are RPCs** (forge_ordeal precedent — no external I/O):
   - `declare_arch(p_target)` — validates: not self, target has profile, no block, caller has no live declare (`declares_one_live` index), caller's token not cooling (`token_available_at > now()` on latest resolved declare → `token_cooling`), caller has no active arch feud (`arch_exists`).
   - `resolve_declare(p_declare_id, p_accept)` — target only, pending only. Accept: if a live feud exists between the pair, the **oldest active** one becomes the pact (`is_arch=true, unmasked_at=now()`); else a new active arch feud is created on the pair's first shared ordeal (`mode='endless'`) — deck visibility guarantees ≥1 shared; if truly none (declare landed cross-context), raise `no_shared_ordeal`, token stays committed until decline. Decline: `status='declined'`, `token_available_at = now() + 30 days`.
   - `dissolve_arch(p_feud_id)` — either member; feud `dissolved` + `ended_at`; the accepted declare row → `dissolved`, declarer's `token_available_at = now() + 30 days`. Dissolution ends `unmask_pact` visibility (policy requires `status='active'`).
5. **`notify` EF gains profile-scoped kinds**: `deck_match` and `declare` take `target_profile_id` instead of `feud_id`; EF verifies a mutual swipe / pending declare exists between caller and target before pushing (`push_match` reused for deck match, `push_declare` for declare). Fire-and-forget by acting client, same trade-off as Plan 4.
6. **`unmask-photos` bucket** — private; path `{profile_id}/{filename}`; owner writes own folder; SELECT mirrors `unmask_pact` (active arch feud, unmasked, with the folder's profile).

## Tasks

- [ ] **T1 Migration 0014**: `feuds.proposed_by` column; RPCs `get_deck`, `swipe_rival`, `propose_feud`, `respond_feud`, `declare_arch`, `resolve_declare`, `dissolve_arch`; per-function EXECUTE grants; `unmask-photos` bucket + policies; `feuds` realtime already published (0008 — verify covers new rows, it does: table-level).
- [ ] **T2 Integration tests** (new files `deck.integration.test.ts`, `arch.integration.test.ts`): deck happy path + location_required + exclusions (swiped/blocked/feuding/no-shared-ordeal/self); swipe match detection + double-swipe rejection; propose/respond accept & decline; declare token lifecycle (declare → decline → cooling → available), pact via existing feud, pact via created feud, unmask visibility flips (unmasked_identities readable only post-pact, dead post-dissolve — THE critical RLS test), dissolve returns token after 30d (clock-shift via admin update).
- [ ] **T3 notify EF**: extend for `deck_match`/`declare`; unit of verification = integration test hitting EF with real JWTs.
- [ ] **T4 Client lib** `src/lib/deck.ts` + arch functions in `src/lib/feuds.ts`, typed like existing (`DeckCard`, `DeclareRow`); no UI.
- [ ] **T5 Contract sync**: append amendment block to `spec/data-contract.md` + Obsidian vault copy.
- [ ] **T6 Verify + commit**: full jest (app + integration), tsc, push.

Out of scope (5b-2, next week): hunting-grounds screen, swipe cards UI, location permission flow, match moment, proposed-feud home cards, rival profile, declare/unmask/dissolve UI, two-sim walk, new i18n screen strings.
