# Nemesis — Design Spec

**Date:** 2026-07-10 · **Status:** Approved in brainstorm, pending final review
**One-liner:** Tinder for finding a local NEMESIS. Half joke, fully functional rivalry matchmaking.

---

## 1. Concept & tone

Inspired by the Craigslist "arch nemesis wanted" meme ads. The product is simultaneously a joke and a real service for finding someone to compete against in any activity. Not enemies or villains — nemeses in the anime-rivalry-trope sense: mutual respect wearing a hostility costume.

Tonal north stars (from the original ads):
- "Iron makes Steel Stronger."
- "My previous nemesis has become soft."
- "Positions available: One. (There can be only one.)"
- "At the end of the day, I am glad that my nemesis is there."
- "Ahha, we meet again."
- "☪︎☮︎⚤✡︎⛧࿊✞ (Coexist)? NO!" — flavor copy candidate.
- Lovers - leave you behind, Friends - abandon, only Nemesis is always there for you

The app must serve **serious** users (real training rivalry: running, chess) and **goofy** users (beer liters, countries visited) with the same mechanics.


**Addendum (important, 2026-07-10): friends first, strangers as bonus.** The Tinder comparison covers only half the app. The primary flow is **inviting people you already know** — friends, colleagues — into feuds via invite link. The app must not depend on a cold-start pool of anonymous locals; it starts working with two installs in one friend group. The swipe deck for matching with nearby strangers is a **bonus discovery feature**, not the core.

## 2. Glossary / lore naming

| Concept                    | EN                    | UA                        |
| -------------------------- | --------------------- | ------------------------- |
| Competition discipline     | Ordeal                | Випробування              |
| Active rivalry             | Feud                  | Ворожнеча                 |
| Goal-bound match           | Showdown              | Протистояння              |
| Verified result            | Chronicled            | Закарбовано               |
| Self-reported result       | Rumor                 | Чутки                     |
| Top-tier rival (one ever)  | Arch-Nemesis          | Архіворог                 |
| Custom discipline creation | Forge your own Ordeal | Викуй власне випробування |

UA terms are chosen for the same grim-archaic register, not literal translation. Full copy deck is a separate artifact.

## 3. Core loop

1. **Persona creation:** mask avatar (preset illustrated sigils / corpse-paint portraits), nemesis name, catchphrase, "Why I'd make a worthy nemesis" bio, Ordeals picked from catalog or forged custom, skill hints (free label per ordeal: "1450 elo", "23:40"), match radius.
2. **Swipe deck** of local rivals. Card = persona + activity stats (hybrid, stats-leaning). Mutual right-swipe → a Feud ignites.
3. **Feud setup:** parties settle on an Ordeal and a mode — **Endless Feud** or **Showdown** (goal-bound, e.g. "first to 15 km").
4. **Feud screen:** two parallel towers grow as each side logs score. Entry with proof attached = **chronicled**; without = **rumor** (italic + disputed styling). No enforcement — social pressure does the work.
5. **Taunt Forge:** template-column composer (mad-libs style: pick one word per column), 1 taunt per day, delivered as push notification + in-feud missive.
6. **Showdown ends** → victory screen, rematch offer. Endless feuds accumulate milestone markers.
7. **Arch-Nemesis declare** — once per user, ever. Both accept → **unmasking pact**: real names/photos revealed, permanent top slot. There can be only one.

## 4. MVP scope

**In:** everything in the core loop, plus custom ordeal creation (with filter), block/report/unmatch, brutality scale setting, EN+UA localization, push notifications.

**Deferred:** badges/sigil collections, AI-generated persona art, multiple simultaneous ordeals per feud pair, cosmetic IAP (future direction: sigil packs, word-bank packs — never gate mechanics), anything IRL-adjacent.

**Never:** IRL meeting features. The app is arena and ledger only — no scheduling, no meetup brokering, no location sharing beyond distance shown at match time. Anything in real life is the users' own business, outside the app.

**Monetization:** none. Free hobby project.

## 5. Matching
**Primary — friend feuds (invite):**
- "Summon a friend" → shareable invite link / QR (deep link with invite code, optionally pre-selecting an ordeal).
- Recipient with the app: lands directly in feud setup. Without: store page → install → persona creation → feud setup with inviter pre-attached.
- No location required for this flow at all.

**Bonus — local deck (swipe):**
- Tinder-style deck of nearby strangers; radius filter, PostGIS distance query.
- Requires opting into location; onboarding does NOT ask for location — it is requested only when the user first opens the deck.
- Deck query: nearby profiles sharing ≥1 ordeal, not previously swiped, not blocked. Mutual swipe = feud.

The one-time arch-nemesis **declare** works in both flows (friend or deck rival).


**Friend feud terms (decided):** the inviter throws a complete glove — ordeal, mode, and goal are set at summon time and baked into the invite ("Doomrider Kevin challenges thee: Push-ups, first to 1000"). Recipient accepts or declines; no negotiation in MVP. Accepted invite ignites the feud immediately (active, no setup step). Counter-offer round (challenged picks weapons, code-duello style) is a possible post-MVP addition.

## 6. Feuds & scoring
- Two modes: **endless** (towers race forever, milestones) and **showdown** (first to goal value wins).
- Tower heights: normalized cumulative sums — to the leader in endless mode, to the goal in showdown mode. Client-rendered (Reanimated).
- Proof is optional (photo/screenshot upload). Entry with proof = **chronicled**; without = **rumor**.
- **Rumors count exactly the same as chronicled entries** — same tower height, same victory weight. The only difference is rendering: chronicled segments are solid stone, rumor segments are translucent mist. The system and users simply trust each other; it's for fun. No disputing mechanism exists.
- A rumor can be upgraded to chronicled at any time by its author attaching proof.
- Optional flavor stat: victory screen may show rumor ratio ("VICTORY — built 40% on rumors") as a joke, never as an accusation.
- Inactivity: after N days without logging, feud gets a "gone soft" marker and either party may end it as a forfeit.

## 7. Taunt Forge

- No free chat anywhere in the app.
- Taunts are composed from per-language **template skeletons + word-bank columns** (closed vocabulary → zero moderation surface, still feels creative; 4 columns × ~15 words ≈ 50k combinations).
- UA banks are grammatically self-consistent (case/gender agreement designed in), not translations of EN banks.
- Rate limit: 1 per day per feud. Rendered as illuminated-manuscript missives; delivered by push.

## 8. Arch-Nemesis & unmasking

- Profiles are masked by default (no photos, no real names) — anonymity at swipe is core to safety, mystique, and comedy.
- Declare is once-ever; acceptance forms the pact and unmasks both.
- **Safety valve:** arch-nemesis can be unmatched. Pact dissolves instantly, nothing further is revealed, and the declare token returns after a cooldown (proposal: 30 days) so abuse victims are not punished forever.

- **Declare target:** the declare can be aimed at anyone visible — a card in the deck (one-sided, bypasses mutual swipe) or an existing rival in an active feud. The target must accept the challenge for the pact to form; until accepted, the declarer's token is committed but the target sees a pending challenge they can accept or decline. A declined declare returns the token after the same cooldown.

## 9. Safety & moderation

- Block / report / unmatch on every profile and feud.
- Unmatch or block mid-feud → feud dissolved, chronicle frozen, both invisible to each other.
- Profanity wordlist filter (on-device + server-side in Edge Function) on custom ordeal names and free-text fields (catchphrase, bio). LLM screening deferred — local decks keep blast radius small.
- Account deletion → full cascade wipe (store requirement).
- No IRL features → no meetup-safety surface; store review story is simple.

## 10. Aesthetic & brutality scale

**Art direction:** black/death metal. Monochrome ink-illustration base (dense hand-drawn texture, ornate sigil emblems); accent palette of venom purple + blood red on black (deathcore merch style). Anime is a rivalry-trope reference only, not an art style.

**Color rule:** never pure `#fff`. Lightest tones are **bone white** (`#e8e4da` family) and ash; token is named `bone`, not `white`.

**Brutality scale** (replaces a simple TRVE toggle) — 5-tier setting, each with a deadpan description in the picker:

| Tier | Name | Typography |
|---|---|---|
| 1 | Soft | plain but gothic-flavored, fully readable |
| 2 | Hard | heavier blackletter presence |
| 3 | Hardcore | display text approaches illegibility |
| 4 | "I don't care" | most text illegible-style; app deliberately hard to navigate, but possible |
| 5 | "I REALLY don't care" | Party Cannon-style rainbow party font — maximum brutality is childish rainbow letters |

- Fonts affect **as much text as possible** (not just headers). If usability collapses, font usage gets edited later — user's explicit call.
- Other UI elements may mutate per tier (spikier borders, slightly rotated buttons, roman numerals at high tiers). Spec keeps a **per-tier mutation table, extendable**.
- Only Maskdown (user-supplied, at `/Users/valentyn/Downloads/maskdown-font`) is chosen so far — used for the NEMESIS logo. Remaining tier fonts = open task. **Maskdown license must be verified before shipping** (Fontspace fonts are often personal-use only).
- Every tier font needs Cyrillic coverage or a per-language fallback map.


**Additional reference points (2026-07-10):** northern medieval, viking, and Kyivan Rus aesthetics sit alongside the black/death metal base — runes, knotwork, drakkar-prow and spear motifs, birch-bark and chronicle-manuscript textures, Rus' shield shapes and old-Slavic letterforms (в'язь). These traditions blend naturally with black metal iconography and ground the UA voice (герць-adjacent register, chronicle/літопис framing, flyting-style taunts). Illustration prompts and asset briefs should draw from this pool, not only from metal album art.

## 11. Localization

- EN + UA from day one. i18next + expo-localization, `en.json` / `uk.json`, no hardcoded strings.
- Taunt system bypasses i18next: per-language template + bank tables (section 7).
- Ordeal catalog rows carry `name_en` / `name_uk`; custom ordeals exist in the author's language only.
- Locale-aware numerals and dates; high brutality tiers may render numbers as roman numerals in both languages.

## 12. Data model (Supabase Postgres)

- `profiles` — user id, nemesis_name, catchphrase, bio, mask_avatar_id, real_name/photo (hidden until unmasking), geo point + radius, language, brutality_tier
- `ordeals` — catalog + user-forged: name (EN/UA), unit, direction (higher=better), is_custom, created_by, moderation_status
- `profile_ordeals` — chosen ordeals + skill hint label
- `swipes` — swiper, target, direction; mutual right swipe triggers feud creation
- `feuds` — two profiles, ordeal, mode (endless | showdown), goal_value, status (active/ended/dissolved), is_arch, unmasked_at
- `score_entries` — feud, author, value, note, proof_url (nullable → rumor), disputed flag
- `taunts` — feud, author, template_id, word-pick indices, created_at (1/day constraint)
- `taunt_templates`, `taunt_banks` — per-language skeletons + word columns
- `declares` — one-per-user arch declaration + cooldown tracking
- `reports`, `blocks`


Amendment 2026-07-10: `ordeals.direction` removed — all scoring is cumulative, more is always better (inherent to the tower model). See Data Contract §8.

## 13. Architecture

- **Client:** Expo (expo-router, TypeScript), Reanimated for towers/swipes, expo-font for tier fonts, expo-notifications.
- **Backend:** Supabase — auth (email/Apple/Google), Postgres with row-level security, PostGIS `st_dwithin` for deck query, Realtime channel per feud (opponent's tower grows live), Storage for proof photos, Edge Functions for push fan-out and server-side moderation checks.
- **Push:** events (taunt, score, match, declare) → Edge Function → Expo Push API.
- No custom server beyond Edge Functions. Head-to-head aggregates, chronicle/rumor split, brutality font swaps are all client logic over plain queries.
- RLS is the security boundary: e.g. real photo readable only when `feuds.unmasked_at IS NOT NULL` for a shared feud.

## 14. Edge cases
- Feud abandonment → inactivity marker ("thy rival has gone soft"), forfeit option.
- Unmatch/block mid-feud → dissolve + freeze + mutual invisibility.
- Invite expired (14 days) or inviter deleted account → invite link shows themed dead-end state.
- Account deletion → cascade wipe.
- Empty deck → themed empty state ("No worthy adversaries within reach. Widen thy radius.") + reminder that summoning friends exists.
- User without location → deck tab shows location opt-in prompt, never blocks the rest of the app.

## 15. Testing

- **Unit:** score aggregation, taunt assembly in both languages, deck SQL (fixtures or pgTAP), RLS policies (critical: unmasking data provably hidden pre-pact).
- **Component:** feud screen, taunt forge (RTL + jest-expo).
- **E2E:** onboard → swipe → match → log score → send taunt (Maestro).

## 16. Spec-driven development workflow

Four platform-neutral living artifacts, kept in the future repo's `/spec` directory as the single source of truth:

1. **Product spec** — this document.
2. **Data contract** — full SQL schema + RLS policies as code + Edge Function endpoints (name, input/output JSON, errors) + Realtime channel/payload shapes. Any client (RN now, Swift/Kotlin later) is just a consumer of this contract.
3. **Design system spec** — token tables (bone/ash/ink/venom/blood + spacing/radii), typography matrix (5 tiers × font slots × Latin/Cyrillic), per-tier mutation table, screen inventory with states and behavior tables, component list (RivalCard, TowerRace, TauntForge) with props/states in prose.
4. **Copy deck** — all EN/UA strings, flavor text, taunt templates and banks.

Build order: React Native (Expo) app first, built from the artifacts. Later, dedicated native iOS and Android apps are vibecoded from the **same** artifacts against the same Supabase backend — the spec makes them look and behave identically without porting RN code.

## 17. Open questions / later tasks

- Font shortlist for brutality tiers 1–4 (+ Cyrillic coverage check per font); Maskdown license verification.
- UA glossary completion (Showdown, Chronicled, Rumor, Arch-Nemesis terms).
- Arch-nemesis declare cooldown length (proposed 30 days).
- Inactivity threshold N for "gone soft".
- Ordeal catalog seed list (serious + goofy starters).
- Mask avatar preset art source (commissioned vs generated, pre-shipped set).
**Open question added 2026-07-12 (Plan 5 candidate): "measured ordeals" — latest-value aggregation.** Some competitions track a LEVEL, not a count: chess ELO, body weight, fastest 5k, max bench. Proposal: ordeals gain an aggregation mode (`sum` — default, current behavior — vs `latest`); for `latest` ordeals towers show each side's most recent logged value, showdown = "first to REACH goal". Touches: ordeals schema (+aggregation column), goal trigger (latest vs sum comparison), tower-math (heights from latest), forge UI (mode picker), copy. Origin: owner wanted ELO as the chess unit; ELO doesn't sum — cumulative "Chess victories / wins" stays for now, ELO remains a skill-hint.
