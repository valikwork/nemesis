# NEMESIS

Know thy enemy. Half-joke, fully functional rivalry app: summon friends (or nearby
strangers) into Feuds, race score towers in any Ordeal, exchange forged taunts.

Spec-driven: `/spec` holds the four canonical artifacts (synced from the owner's
Obsidian vault, folder `NEMESIS/`). Code must not contradict them; change the spec
first, then the code.

- Client: Expo (React Native, expo-router, TypeScript)
- Backend: Supabase (Postgres, RLS, Edge Functions) — migrations in `/supabase`
- Localization: EN + UA from day one
