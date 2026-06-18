// Provider-agnostic battle-log analysis: result types + the pure anti-hallucination
// engine (prompt building, evidence extraction/validation). The LLM HTTP call lives
// in a provider adapter (apps/api/src/ai) that reuses these helpers, so every
// provider enforces the same grounding guarantees.

// ─── Result types ──────────────────────────────────────────────────────────────

export interface BattleAnalysisPlay {
  turn: number;
  observation: string;
  evidence: string;
  suggestion?: string;
  impact: 'high' | 'medium' | 'low';
}

export interface BattleAnalysisCardNote {
  card: string;
  observation: string;
  evidence: string;
  deckSuggestion?: 'add' | 'remove' | 'increase' | 'decrease' | null;
  deckSuggestionReason?: string;
}

export interface BattleAnalysisDeckSuggestion {
  action: 'add' | 'remove' | 'increase' | 'decrease';
  card: string;
  reasoning: string;
  evidence: string;
}

export interface BattleAnalysis {
  playerName: string;
  opponentName: string;
  summary: string;
  keyMoments: BattleAnalysisPlay[];
  playMistakes: BattleAnalysisPlay[];
  cardNotes: BattleAnalysisCardNote[];
  deckSuggestions: BattleAnalysisDeckSuggestion[];
  analyzedAt: string;
}

/** Wire contract for GET/PUT /api/analysis/settings. The API key is never returned. */
export interface AiSettings {
  provider: string;
  model: string | null;
  hasApiKey: boolean;
}

// ─── Anti-hallucination engine (pure) ───────────────────────────────────────────

/** Extract all cards explicitly revealed in the log via bullet-point listings ("  • Card, Card"). */
export function extractRevealedCards(log: string): string[] {
  const cards = new Set<string>();
  const bulletRegex = /^\s+•\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = bulletRegex.exec(log)) !== null) {
    m[1]
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .forEach((c) => cards.add(c));
  }
  return [...cards];
}

/**
 * Verify that a claimed evidence quote actually appears in the raw log. Checks the
 * first 60 characters (normalised whitespace) to guard against truncated quotes.
 */
export function evidenceExistsInLog(evidence: string, log: string): boolean {
  if (!evidence || evidence.length < 5) return false;
  const snippet = evidence.replace(/\s+/g, ' ').trim().slice(0, 60);
  return log.includes(snippet);
}

/**
 * Build the (German) system + user prompts. Anti-hallucination rules are baked in:
 * only cards/events present in the log, every `evidence` a verbatim quote, suggested
 * cards only when shown in hand, omit-on-uncertainty.
 */
export function buildAnalysisPrompts(
  log: string,
  playerName: string,
  analyzedAt: string,
): { system: string; user: string } {
  const revealedCards = extractRevealedCards(log);

  const system = `Du bist ein Pokémon TCG Kampfanalyst. Analysiere Kampfprotokolle und gib präzises, datengestütztes Feedback.

PFLICHTREGELN ZUR VERMEIDUNG VON HALLUZINATIONEN:
1. Erwähne NUR Karten und Ereignisse, die wortwörtlich im Protokoll stehen.
2. Jedes "evidence"-Feld MUSS eine wörtliche Textzeile aus dem Protokoll sein (Kopie, kein Paraphrasieren).
3. Schlage als Alternative NUR Karten vor, die im Protokoll explizit auf der Hand des Spielers zu sehen waren (durch Kartenlistungen mit "•" belegt).
4. Bei Unsicherheit: Punkt weglassen statt spekulieren.
5. Deck-Empfehlungen nur für Karten, die im Protokoll tatsächlich vorkommen.
Antworte ausschließlich mit validem JSON, ohne Markdown-Codeblöcke oder Erklärungen.`;

  const user = `Analysiere folgendes Kampfprotokoll für Spieler "${playerName}":

--- PROTOKOLL START ---
${log}
--- PROTOKOLL ENDE ---

Im Protokoll explizit sichtbare Handkarten: ${revealedCards.length > 0 ? revealedCards.join(', ') : '(keine explizit gelistet)'}

Antworte im folgenden JSON-Schema (alle Felder außer optionale sind Pflicht):
{
  "playerName": "string — erkannter Name des analysierten Spielers",
  "opponentName": "string — erkannter Name des Gegners",
  "summary": "string — 2-3 Sätze Kampfzusammenfassung",
  "keyMoments": [
    {
      "turn": 0,
      "observation": "string — was ist passiert",
      "evidence": "string — WÖRTLICHES Zitat aus dem Protokoll",
      "suggestion": "string (optional) — Alternativzug, NUR wenn Handkarten belegt",
      "impact": "high|medium|low"
    }
  ],
  "playMistakes": [
    {
      "turn": 0,
      "observation": "string — suboptimaler Spielzug",
      "evidence": "string — WÖRTLICHES Zitat aus dem Protokoll",
      "suggestion": "string (optional) — konkreter Verbesserungsvorschlag",
      "impact": "high|medium|low"
    }
  ],
  "cardNotes": [
    {
      "card": "string — Kartenname exakt wie im Protokoll",
      "observation": "string — Wie hat sich die Karte verhalten",
      "evidence": "string — WÖRTLICHES Zitat aus dem Protokoll",
      "deckSuggestion": "add|remove|increase|decrease|null",
      "deckSuggestionReason": "string (optional)"
    }
  ],
  "deckSuggestions": [
    {
      "action": "add|remove|increase|decrease",
      "card": "string — Kartenname exakt wie im Protokoll",
      "reasoning": "string — Begründung auf Basis des Protokolls",
      "evidence": "string — WÖRTLICHES Zitat das die Empfehlung stützt"
    }
  ],
  "analyzedAt": "${analyzedAt}"
}

Fokus auf wenige, gut belegte Punkte. Qualität vor Quantität.`;

  return { system, user };
}

/**
 * Drop every item whose evidence quote cannot be located verbatim in the raw log,
 * and guarantee all arrays exist. This is the final, provider-independent grounding
 * gate: an unverifiable claim never reaches the user.
 */
export function validateAnalysis(analysis: BattleAnalysis, log: string): BattleAnalysis {
  return {
    ...analysis,
    keyMoments: (analysis.keyMoments ?? []).filter((m) => evidenceExistsInLog(m.evidence, log)),
    playMistakes: (analysis.playMistakes ?? []).filter((m) => evidenceExistsInLog(m.evidence, log)),
    cardNotes: (analysis.cardNotes ?? []).filter((n) => evidenceExistsInLog(n.evidence, log)),
    deckSuggestions: (analysis.deckSuggestions ?? []).filter((s) =>
      evidenceExistsInLog(s.evidence, log),
    ),
  };
}

/** Strip accidental markdown code fences around a JSON payload from the model. */
export function stripJsonFences(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}
