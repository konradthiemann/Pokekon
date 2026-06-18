# Plan — B6: Provider-agnostische LLM-Analyse (serverseitig)

> Quelle: implementation-prompt B6 + evolution-plan §6.3 Phase A.
> Branch: `feat/b6-llm-analysis` (off main, nach Merge von A+B+Trophy).
> **Entscheidungen (User, 2026-06-17):** Key **pro Nutzer, verschlüsselt in Postgres** (BYOK). Adapter **vorerst nur GitHub Models** (Default) hinter der Abstraktion.

## Belegte Fakten (gelesen)
- Bestehend `apps/web/src/lib/battleLogAnalysis.ts`: Browser→Anthropic, Key aus `localStorage` (Alt-Schuld). Anti-Halluzination: `extractRevealedCards` (Bullet-Listen), `evidenceExistsInLog` (wörtliches Zitat, erste 60 Zeichen), deutscher System/User-Prompt, `temperature=0`, Items ohne Evidence im Log werden verworfen.
- Result-Typen `BattleAnalysis`/`BattleAnalysisPlay`/`BattleAnalysisCardNote` in `apps/web/src/types/index.ts`; UI: `MatchDetailModal` (Key-Input + analyze) + `MatchStatsTab`.
- GitHub Models API (verifiziert): `POST https://models.github.ai/inference/chat/completions`, Header `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version`, OpenAI-kompatibel: `model: "{publisher}/{model}"` (z. B. `openai/gpt-4.1`), `messages`, `temperature` [0,1], `response_format: { type: 'json_object' }`.
- API-Tests: PGlite + Migrationen + DI (Session/DB). Provider-Call wird in Tests gemockt (kein echter Netzcall).

## Architektur
- **Pure Engine + Typen → `@pokekon/shared`** (`battleAnalysis.ts`): `BattleAnalysis*`-Typen, `extractRevealedCards`, `evidenceExistsInLog`, `buildAnalysisPrompts`, `validateAnalysis`. Provider-unabhängig, unit-testbar. Web re-exportiert die Typen aus `../types` (kein Bruch bestehender Importe).
- **Provider-Abstraktion** `apps/api/src/ai/`: `interface AnalysisProvider { analyze(input): Promise<BattleAnalysis> }`; `getAnalysisProvider(name, { apiKey, model })` (nur `github-models`). Adapter `githubModels.ts` nutzt die shared Engine + HTTP, `temperature=0`, `response_format json_object`, Evidence-Validierung.
- **Key serverseitig, verschlüsselt:** `lib/crypto.ts` AES-256-GCM mit `ENCRYPTION_KEY` (32 Bytes, hex/base64) aus env. Format `v1:<iv>:<tag>:<ct>` (base64). `env.ts` getter, wirft bei Zugriff ohne Key (wie `databaseUrl`).
- **Schema** `user_ai_settings`: `userId` (FK, unique), `provider` (text, default 'github-models'), `model` (text, nullable), `encryptedApiKey` (text, nullable), timestamps. Migration `0003`.
- **Routen** `routes/analysis.ts`:
  - `GET /api/analysis/settings` → `{ provider, model, hasApiKey }` (nie den Key zurückgeben).
  - `PUT /api/analysis/settings` → upsert; `apiKey` weglassen = behalten, `""` = löschen; sonst verschlüsselt speichern.
  - `POST /api/analysis/log` → Settings laden, Key entschlüsseln, `provider.analyze`, `BattleAnalysis` zurück; 400 wenn kein Key.
  - Wiring in `app.ts` unter `/api/analysis`.

## Frontend
- `api.ts`: `getAiSettings`, `updateAiSettings`, `analyzeBattleLogViaApi`.
- AI-Settings-UI (Anbieter + Token) — Key nur serverseitig.
- `MatchDetailModal`: Analyse über Server-Route statt Browser-Anthropic; Key-Input entfällt (Verweis auf Settings). Browser-`battleLogAnalysis.ts` wird abgelöst.

## Nicht live schalten
Implementierung + Tests grün, aber **kein Deploy/Aktivierung** ohne Freigabe. Aktivierung braucht: `ENCRYPTION_KEY` als Railway-Var + Nutzer hinterlegt seinen GitHub-Models-Token in den Settings. Im PR-Text dokumentieren.

## Gates
typecheck+lint+test grün; neue Logik mit Tests (shared Engine unit; Routen integration mit gemocktem Provider). Migration via PGlite-Harness geprüft.
