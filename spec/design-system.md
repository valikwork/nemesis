# Nemesis — Design System Spec

**Artifact 3 of 4** · 2026-07-10 · Makes any client (RN or native) look identical without porting styling code.

## 1. Color tokens

Never pure `#fff` or `#000`. Lightest value is bone; darkest is void.

| Token | Hex | Role |
|---|---|---|
| `void` | `#060507` | app background (deepest) |
| `ink` | `#0a0510` | screen background |
| `crypt` | `#100a1a` | card / surface background |
| `crypt-raised` | `#140d21` | elevated surface (card image area, modals) |
| `bone` | `#e8e4da` | primary text, primary icons |
| `ash` | `#a8a29a` | secondary text |
| `smoke` | `#5c5450` | muted text, placeholders, disabled |
| `venom` | `#8a3aa8` | secondary accent (sigils, links, info) |
| `venom-dim` | `#3a2454` | borders, dividers |
| `venom-deep` | `#6d5a86` | tertiary text on dark (taglines) |
| `blood` | `#c9203a` | primary accent (CTAs, challenge, logo) |
| `blood-deep` | `#6e1111` | pressed states, badges bg |
| `blood-mist` | `#4a0d18` | badge/chip backgrounds |

Semantic mapping: `bg=ink`, `surface=crypt`, `border=venom-dim`, `text=bone`, `text-2=ash`, `text-3=smoke`, `accent=blood`, `accent-2=venom`. Danger shares `blood` (thematically everything is danger). Tier 5 (brutality) swaps accent pair to rainbow party palette (defined in mutation table).

## 2. Spacing, radii, shape

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32.
- Radii: cards 14, buttons 6, chips 3, phone-frame irrelevant. Higher brutality tiers may reduce radii toward 0 (spikier world, see mutation table).
- Borders: 1px `venom-dim` default; important cards may add 1px outline offset 3px (double-border ritual frame).
- Dividers: jagged SVG strip (mountain-line path), not straight rules, from tier 2 up.

## 3. Typography matrix
Font slots: `logo`, `display` (screen titles, rival names), `label` (section headers, badges), `body` (everything else), `numeral` (stats, tower values).

**Tier fonts (picked 2026-07-10):** T1 Pickyside · T2 Soulside Betrayed · T3 Arathos · T4 Maskdown · T5 Bagel Fat One. Files currently at `/Users/valentyn/Downloads/{pickyside-font, soulside-betrayed-font, arathos-font, maskdown-font, Bagel_Fat_One}`.

| Tier | Name | logo | display | label | body | numeral |
|---|---|---|---|---|---|---|
| 1 | Soft | Maskdown | Pickyside | Pickyside | readable sans — **TBD** | body font, arabic digits |
| 2 | Hard | Maskdown | Soulside Betrayed | Soulside Betrayed | readable sans — **TBD** | arabic digits |
| 3 | Hardcore | Maskdown | Arathos | Arathos | Pickyside | arabic digits |
| 4 | "I don't care" | Maskdown | Maskdown | Maskdown | Soulside Betrayed | roman numerals |
| 5 | "I REALLY don't care" | Bagel Fat One | Bagel Fat One | Bagel Fat One | Bagel Fat One | arabic digits, Bagel Fat One |

Rules:
- Fonts apply to as much text as possible per tier. Tier 4 must be genuinely hard to navigate but possible; tier 5 is fully readable and maximally ridiculous.
- **Cyrillic coverage unverified for all five fonts** — verify each; expected mostly Latin-only. Per-language fallback map (UA column) required before implementation.
- **Licenses:** Pickyside, Soulside Betrayed, Arathos, Maskdown are Fontspace downloads — often personal-use only; verify each before shipping. Bagel Fat One is Google Fonts (OFL) — safe.
- Base body sans (T1–T2) still TBD.

## 4. Per-tier mutation table (extendable)

| Mutation | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|
| Dividers | straight | jagged | jagged | jagged, doubled | streamers |
| Corner radii | full | full | −25% | 0 (spikes) | full + 20% |
| Button rotation | 0° | 0° | ±1° random | ±3° random | ±5° random |
| Numerals | arabic | arabic | arabic | roman | arabic |
| Accent palette | blood/venom | blood/venom | blood/venom | blood only | rainbow party |
| Distance units | km | km | km | "km hence" | km + balloons icon |
| Logo treatment | static | static | slight displacement | heavy displacement | bouncing |

## 5. Screen inventory
Each screen lists states; behavior tables are normative. (Consolidated with 2026-07-10 amendments: friends-first home, invite screens, no location in onboarding, no disputes.)

**Home = Feud list** — active feuds ranked, arch-nemesis pinned top with permanent slot styling; ended/dissolved in "Buried feuds" section. Primary CTA: "Summon a friend". Secondary tab: "Hunting grounds" (deck).

**Onboarding** — steps: auth → mask picker → nemesis name + catchphrase → bio → ordeal picker (+forge) → skill hints → notifications permission. No location step. States: fresh, resumed-incomplete. Skippable: catchphrase, bio; everything else required.

**Summon sheet (invite create)** — ordeal picker + mode toggle + goal input (showdown only) → share link/QR. Pending summons list with terms and revoke.

**Invite landing** — full challenge terms shown prominently ("{name} challenges thee: Push-ups, first to 1000"). Controls: "Answer the challenge" / decline. Accept → Match Moment → active feud screen. Dead-invite state (expired/revoked): "This summons has faded into legend."

**Deck ("Hunting grounds")** — states: location opt-in prompt (if not granted), cards, empty (widen radius + summon reminder), loading, offline.

| Gesture | Behavior |
|---|---|
| swipe left | spare; next card |
| swipe right | challenge; on mutual → Match Moment |
| tap card | flip persona/stats |
| long-press | declare arch-nemesis entry point (if token available) |

**Match Moment** — full-screen interstitial: both sigils clash, "AHHA, WE MEET AGAIN." Fires on mutual swipe AND invite acceptance. Deck path continues to feud setup; invite path continues straight to the active feud.

**Feud setup (deck feuds only)** — pick shared ordeal, mode, goal value if showdown. Proposal sent; other party accepts (proposed → active). Friend feuds skip this screen entirely (terms came with the invite).

**Feud screen** — TowerRace center; log-score CTA; missives (taunt) feed; chronicle timeline below (chronicled = solid stone, rumor = translucent mist); inactivity marker ("Thy rival has gone soft") after N=14 days; forfeit option. States: active, awaiting-accept, ended (victory/defeat/forfeit), dissolved (frozen, read-only).

**Log score sheet** — value + unit, optional note, optional proof photo. Copy: "Without proof, this is but a rumor. Rumors count all the same."

**Taunt Forge** — column word picker (per language of author), live assembled preview, send (1/day; spent state: "Thy venom is spent. Return at dawn.").

**Rival profile** — persona, shared ordeals, head-to-head record, block/report, declare entry point.

**Declare flow** — confirm ("There can be only one."), pending state, target's accept/decline screen, unmasking reveal moment on accept.

**Settings** — brutality picker (5 tiers, deadpan descriptions, live preview), language EN/UA, radius (deck), notifications, account deletion ("Erase my legend"), licenses.

**Report/Block sheets** — standard, themed copy, immediate effect.

## 6. Components
- **RivalCard** — props: persona, sharedOrdeals[], distanceKm, flipped. States: front (persona), back (stats).
- **TowerRace** — props: myTotal, theirTotal, target (leader|goal), entries[]. Two vertical towers, animated growth on new entries; goal line drawn in showdown mode; milestone runes on endless towers. Chronicled segments solid stone, rumor segments translucent mist — equal height and weight.
- **TauntForge** — props: template, banks[][], picks[], onSend. Live preview; disabled/spent state.
- **MissiveCard** — a received/sent taunt as illuminated-manuscript / birch-bark strip; author sigil, timestamp.
- **ChronicleEntry** — value + note + proof thumbnail; rumor = mist styling + "rumor" rune; chronicled = solid.
- **BrutalityPicker** — 5 rows, each rendered in its own tier fonts (self-demonstrating), deadpan descriptions.
- **MaskAvatarPicker** — grid of preset sigil/corpse-paint illustrations.
- **SigilDivider** — jagged divider element, tier-aware (knotwork variants at lower tiers).
- **DeclareBanner** — arch-nemesis pending/active states.
- **SummonSheet** — invite composer: ordeal + mode + goal + share; pending list with revoke.

## 7. Motion

- Tower growth: 600ms ease-out rise + brief shake at settle.
- Match Moment: sigil clash, 1.2s, skippable on tap.
- Card swipe physics: standard tinder-like, rotation follows drag.
- Tier 5 adds confetti burst on taunt send (and nowhere else — restraint even in chaos).

## 8. Assets

- Mask avatar preset set (12–20 illustrations, ink style) — source TBD (open question in product spec §17).
- Sigil/emblem art for match moment and feud headers.
- Jagged divider SVGs (3 variants), milestone runes, disputed/rumor marks.
- App icon: skull sigil in pentagon frame, bone-on-void.

## 9. Amendments — 2026-07-10 (friends-first + disputes removed)

- **Home restructure:** feud list is the home screen. Primary CTA: "Summon a friend" (invite flow). Deck lives in a secondary tab ("Hunting grounds"); shows location opt-in prompt if no location granted.
- **New screens:** Invite create/share sheet (QR + share link, pending invites list with revoke); invite landing (accept → feud setup with inviter pre-attached); dead-invite state (expired/revoked, themed).
- **Onboarding change:** location/radius step removed from onboarding; radius setting appears in Settings and deck opt-in only.
- **ChronicleEntry / TowerRace:** disputed state deleted. Two states only — chronicled (solid stone) and rumor (translucent mist). Equal heights, equal weight.
- Match Moment interstitial also fires on invite acceptance (friend feuds deserve the sigil clash too).
- **Aesthetic reference pool expanded:** northern medieval / viking / Kyivan Rus added alongside black metal — runes and old-Slavic в'язь for decorative marks, knotwork borders as divider variants, chronicle-manuscript (літопис) texture for missives and the chronicle timeline, shield/spear/drakkar motifs for sigils and milestone runes. Mask avatar set and app icon briefs draw from both pools.
- **Invite flow finalized (glove throw):** summon sheet = ordeal picker + mode toggle + goal input (showdown only) + share. Invite landing shows the full challenge terms prominently; recipient's only controls are "Answer the challenge" / decline. On accept → Match Moment → straight into the active feud screen. Pending-invites list shows terms per invite.

- **Onboarding revision (2026-07-11, e2e feedback):** steps now auth → sigil picker → name (centered layout, name only) → ordeal picker → seal. Catchphrase defaults to the stock line, bio defaults empty — both edited in Settings later. "Mask picker" renamed **sigil picker** everywhere in UI (avatar glyphs are sigils, not masks; the arch-nemesis "unmasking" concept is unaffected). Sigil glyphs must use emoji-safe codepoints (runes/alchemical symbols; append U+FE0E text-presentation selector where a codepoint has an emoji variant) — no color emoji rendering. Ordeal picker: plain-register subtitle explaining what's being chosen; selection capped at 5 with themed limit message. Forge sheet: labeled fields (activity name / unit of measurement).

- **Forge → skill hint (2026-07-11):** confirming a forged custom ordeal opens the skill-hint sheet immediately (creator states their level right away; confirming selects the ordeal, retreat leaves it available unselected). Skill-hint placeholder is a bare number ("1450") — the unit/measurement context comes from the ordeal itself. The 5-ordeal cap applies on hint confirmation too.
