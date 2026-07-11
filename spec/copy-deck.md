# Nemesis — Copy Deck

**Artifact 4 of 4** · 2026-07-10 · All user-facing strings, EN + UA. **UA strings are drafts — native-speaker (owner) review required before ship.** Register: grim-archaic, deadpan; never corporate.

## 1. Glossary (normative)
| Concept          | EN                    | UA                        |
| ---------------- | --------------------- | ------------------------- |
| Discipline       | Ordeal                | Випробування              |
| Rivalry          | Feud                  | Ворожнеча                 |
| Goal-bound match | Showdown              | Протистояння              |
| Verified entry   | Chronicled            | Закарбовано               |
| Unverified entry | Rumor                 | Чутки                     |
| Top rival        | Arch-Nemesis          | Архіворог                 |
| Custom creation  | Forge your own Ordeal | Викуй власне випробування |
| Friend invite    | Summon                | Поклик                    |
| App tagline      | Iron hardens Iron     | Залізо гартує залізо      |

## 2. Onboarding
| Key | EN | UA (draft) |
| --- | --- | --- |
| welcome_title | Iron makes steel stronger. | Залізо гартує сталь. |
| welcome_body | Complacency will be the death of you. Find a nemesis. | Самовдоволення тебе погубить. Знайди собі ворога. |
| mask_title | Choose thy mask | Обери свою маску |
| name_title | Name thyself | Назви себе |
| name_placeholder | Doomrider Kevin | Вісник Погибелі Толік |
| catchphrase_title | Thy catchphrase | Твоє гасло |
| catchphrase_placeholder | Ahha, we meet again. | Ось ми і зустрілися знову. |
| bio_title | Why would you make a worthy nemesis? | Чому з тебе вийде гідний ворог? |
| ordeals_title | Choose thy ordeals | Обери своє випробування |
| ordeal_forge_cta | Forge your own ordeal | Викуй власне випробування |
| radius_title | How far does thy enmity reach? | Як далеко сягає твоя ворожість? |
| notifications_ask | Allow thy nemesis to disturb thy peace? | Дозволити ворогові порушувати твій спокій? |

### 2b. Plan-2 additions (auth + wizard chrome)

| Key | EN | UA (draft) |
| --- | --- | --- |
| common_next | Onward | Далі |
| common_confirm | So be it | Хай буде так |
| common_cancel | Retreat | Відступити |
| validation_too_short | Too short for legend. | Закоротко для легенди. |
| validation_too_long | Even sagas have limits. | Навіть саги мають межі. |
| auth_enter | Enter | Увійти |
| auth_rise | Rise | Повстати |
| auth_to_sign_up | No account? Rise anew | Немає облікового запису? Повстань |
| auth_to_sign_in | Return to the gate | Повернутися до брами |
| onboarding_skill_hint_title | Name thy prowess | Назви свою майстерність |
| onboarding_seal_title | Seal thy persona | Скріпи свою подобу |
| onboarding_seal_cta | Seal it in blood | Скріпити кров'ю |

(These UA strings are drafts like all others — owner reviews. Note `Скріпити кров'ю` contains an apostrophe — JSON-safe, SQL not involved.)

## 3. Deck & matching
**Invites (primary flow):**

| Key                  | EN                                                         | UA (draft)                                            |
| -------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| summon_cta           | Summon a friend                                            | Поклич друга                                          |
| summon_share_text    | I challenge thee. Download Nemesis and answer for thyself. | Я кидаю тобі виклик. Завантажуй Nemesis і відповідай. |
| summon_pending       | The summons is sent. Awaiting thy foe.                     | Поклик надіслано. Чекаємо на твого ворога.            |
| summon_revoke        | Withdraw summons                                           | Відкликати поклик                                     |
| invite_landing_title | {name} names thee nemesis.                                 | {name} називає тебе своїм ворогом.                    |
| invite_landing_cta   | Answer the challenge                                       | Прийняти виклик                                       |
| invite_dead          | This summons has faded into legend.                        | Цей поклик розчинився в історії.                      |

**Deck (bonus flow):**

| Key               | EN                                                                         | UA (draft)                                                              |
| ----------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| deck_tab          | Hunting grounds                                                            | Мисливські угіддя                                                       |
| deck_location_ask | Reveal thy whereabouts to find nearby foes?                                | Відкрити своє місцеперебування, щоб знайти ворогів поблизу?             |
| deck_empty        | No worthy adversaries within reach. Widen thy radius — or summon a friend. | Гідних суперників поблизу немає. Розшир свій радіус — або поклич друга. |
| deck_spare        | Spare                                                                      | Помилувати                                                              |
| deck_challenge    | Challenge                                                                  | Виклик                                                                  |
| match_title       | AHHA, WE MEET AGAIN.                                                       | АГА, ОСЬ МИ І ЗУСТРІЛИСЯ.                                               |
| match_cta         | Begin the feud                                                             | Розпочати ворожнечу                                                     |
| distance_away     | {km} km away                                                               | за {km} км                                                              |

## 4. Feud
| Key | EN | UA (draft) |
| --- | --- | --- |
| feud_setup_mode_endless | Endless feud | Вічна ворожнеча |
| feud_setup_mode_showdown | Showdown — first to {goal} | Протистояння — хто перший до {goal} |
| feud_awaiting | Thy challenge awaits an answer. | Твій виклик чекає на відповідь. |
| log_score_cta | Log thy deed | Закарбуй свій чин |
| log_proof_hint | Without proof, this is but a rumor. Rumors count all the same. | Без доказу це лише чутки. Та чутки теж рахуються. |
| entry_rumor | rumor | чутки |
| gone_soft | Thy rival has gone soft. | Твій суперник розм'як. |
| forfeit_cta | Claim forfeit | Зарахувати поразку боягуза |
| victory_title | VICTORY | ПЕРЕМОГА |
| victory_rumor_ratio | Built {pct}% on rumors. | Збудовано на {pct}% з чуток. |
| defeat_title | DEFEAT | ПОРАЗКА |
| rematch_cta | Demand a rematch | Вимагати реваншу |
| buried_section | Buried feuds | Поховані ворожнечі |

## 5. Taunt Forge
| Key | EN | UA (draft) |
| --- | --- | --- |
| forge_title | Taunt Forge | Кузня образ |
| forge_subtitle | Compose thy insult | Склади свою образу |
| forge_send | Send message | Надіслати образу |
| forge_spent | Thy venom is spent. Return at dawn. | Твої образи закінчилися. Повертайся на світанку. |
| taunt_received | A message from thy nemesis. | Послання від твого ворога. |

**EN template 1** (4 slots): `{0} {1} {2} {3}.`
- Slot 0: Thy · Your · That · Behold, thy · Even thy
- Slot 1: pitiful · trembling · rusted · feeble · doomed · legendary-in-rumor-only · moss-covered · saga-less · mead-soaked · flea-bitten · thrall-worthy
- Slot 2: effort · progress · discipline · ambition · legacy · spirit · so-called record · attempt · technique · tower
- Slot 3: crumbles before me · feeds the crows · shames thy ancestors · is but a rumor · withers at dawn · amuses my crows · would shame a thrall · shall be sung of in no saga · would not frighten a sheep · melts like snow in spring · is mocked in three villages · belongs in the pig pen · would lose to a turnip

**UA template 1** (4 slots, grammar designed for neuter-form nouns — banks must stay agreement-safe, not translated word-by-word): `{0} {1} {2} {3}.`
- Slot 0: Твоє · Оте · Се · Навіть твоє
- Slot 1: жалюгідне · тремтливе · іржаве · немічне · приречене · трухляве · миршаве · замшіле · скисле · безславне
- Slot 2: махання фігурами · тупцювання · вежування · тренування · так зване досягнення · старання · ремесло · надбання
- Slot 3: розсипається переді мною · годує ворон · ганьбить твій рід · є лише чутками · в'яне на світанку · смішить навіть курей · не налякає й горобця · не варте й дірки з бублика · розвіється, як дим над тином · зів'яне, як трава під косою · не варте й ламаного гроша · славиться хіба в поговорах · програло б і гарбузові

More templates added over time; each language's banks are authored independently. Rule: closed vocabulary only, no free-text slots, agreement must hold for every combination.

## 6. Arch-Nemesis

| Key                   | EN                                                                      | UA (draft)                                                                     |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| declare_confirm_title | There can be only one.                                                  | Лишитися може тільки один.                                                     |
| declare_confirm_body  | Declare thy arch-nemesis. You may do this once. Both shall be unmasked. | Оголоси свого архіворога. Це можна зробити лише раз. Обидва відкриють обличчя. |
| declare_pending       | Thy declaration awaits an answer.                                       | Твоє оголошення чекає на відповідь.                                            |
| declare_received      | {name} names thee arch-nemesis. Accept the unmasking pact?              | {name} називає тебе архіворогом. Прийняти пакт? Маски будуть зняти?            |
| unmask_moment         | The masks fall.                                                         | Маски спадають.                                                                |
| arch_dissolve_confirm | Dissolve the pact? The chronicle freezes. Nothing more is revealed.     | Розірвати пакт? Літопис замерзне. Більше нічого не буде викрито.               |

## 7. Settings & system

| Key              | EN                                                                       | UA (draft)                                                            |
| ---------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| brutality_title  | Brutality                                                                | Брутальність                                                          |
| brutality_1      | Soft                                                                     | М'яко                                                                 |
| brutality_1_desc | I want texts to be legible.                                              | Я хочу мати можливість читати тексти.                                 |
| brutality_2      | Hard                                                                     | Жорстко                                                               |
| brutality_2_desc | The letters begin to sharpen.                                            | Літери починають гострішати.                                          |
| brutality_3      | Hardcore                                                                 | Хардкор                                                               |
| brutality_3_desc | Legibility is for the weak.                                              | Розбірливість — для слабких.                                          |
| brutality_4      | I don't care                                                             | Мені начхати                                                          |
| brutality_4_desc | You will suffer.                                                         | Ти страждатимеш                                                       |
| brutality_5      | I REALLY don't care                                                      | Мені СПРАВДІ начхати                                                  |
| brutality_5_desc | The most brutal choice of all.                                           | Найбрутальніший вибір з усіх.                                         |
| delete_account   | Erase my legend                                                          | Стерти мою легенду                                                    |
| delete_confirm   | Thy chronicle, feuds, and name shall be wiped from all records. Forever. | Твій літопис, ворожнечі та ім'я буде стерто з усіх записів. Назавжди. |
| report_cta       | Report                                                                   | Побідкатися                                                           |
| block_cta        | Banish                                                                   | Вигнати                                                               |
| ordeal_rejected  | This ordeal displeases the elders.                                       | Це випробування не до вподоби старійшинам.                            |
| coexist_joke     | Coexist? NO!                                                             | Coexist? NO! (leave in eng)                                           |

Placement of `coexist_joke`: onboarding final step or About screen — decide at implementation.

## 8. Push notifications

| Key            | EN                                    | UA (draft)                       |
| -------------- | ------------------------------------- | -------------------------------- |
| push_match     | A nemesis has answered thy challenge. | Ворог відповів на твій виклик.   |
| push_taunt     | {name} sends taunt.                   | {name} шле образ.                |
| push_score     | {name}'s tower grows.                 | Вежа {name} росте.               |
| push_declare   | Thou hast been named an arch-nemesis. | Тебе титулували архіворогом.     |
| push_goal_near | Thy nemesis nears the goal.           | Твій ворог наближається до мети. |

## 9. Ordeal seed catalog
All ordeals are cumulative — more is always better (direction concept removed).

| EN | UA | Unit EN / UA |
| --- | --- | --- |
| Running | Біг | km / км |
| Cycling | Велосипед | km / км |
| Swimming | Плавання | km / км |
| Hiking | Похід | km / км |
| Steps walked | Пройдені кроки | steps / кроки |
| Push-ups | Віджимання | reps / рази |
| Pull-ups | Підтягування | reps / рази |
| Gym sessions | Походи в зал | sessions / тренування |
| Climbing routes | Скелелазні траси | routes / траси |
| Cold showers | Крижані душі | showers / душі |
| Chess victories | Шахові звитяги | wins / перемоги |
| Board game victories | Звитяги в настолках | wins / перемоги |
| Poker nights won | Виграні покерні вечори | wins / перемоги |
| Darts victories | Звитяги в дартс | wins / перемоги |
| Bowling victories | Звитяги в боулінг | wins / перемоги |
| Billiards victories | Звитяги в більярд | wins / перемоги |
| Table tennis victories | Звитяги в настільний теніс | wins / перемоги |
| Mario Kart victories | Перемоги в Mario Kart | wins / перемоги |
| FIFA victories | Перемоги у FIFA | wins / перемоги |
| Pages read | Прочитані сторінки | pages / сторінки |
| Books finished | Дочитані книги | books / книги |
| Words written | Написані слова | words / слова |
| Fish caught | Спіймана риба | fish / рибини |
| Sunrises witnessed | Зустрінуті світанки | sunrises / світанки |
| Saunas endured | Пережиті сауни | saunas / сауни |
| Concerts survived | Пережиті концерти | concerts / концерти |
| Countries visited | Відвідані країни | countries / країни |
| Cities conquered | Підкорені міста | cities / міста |
| Beer drunk | Випите пиво | liters / літри |
| Coffee drunk | Випита кава | cups / чашки |
| Pizzas devoured | Поглинуті піци | pizzas / піци |
| Varenyky devoured | Поглинуті вареники | pieces / штуки |
| Days without sugar | Дні без цукру | days / дні |
| Days without alcohol | Дні без алкоголю | days / дні |

Goofier entries are intentionally present at launch — they teach users that custom ordeals may be absurd.
