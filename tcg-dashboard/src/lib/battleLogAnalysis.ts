import type { BattleAnalysis } from '../types';

// ─── Log pre-processing helpers ───────────────────────────────────────────────

/** Extract all cards that were explicitly revealed in the log (via bullet-point listings). */
function extractRevealedCards(log: string): string[] {
  const cards = new Set<string>();
  const bulletRegex = /^\s+•\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = bulletRegex.exec(log)) !== null) {
    m[1].split(',').map((c) => c.trim()).filter(Boolean).forEach((c) => cards.add(c));
  }
  return [...cards];
}

/**
 * Verify that a claimed evidence quote actually appears in the raw log.
 * We check the first 60 characters to guard against truncated quotes.
 */
function evidenceExistsInLog(evidence: string, log: string): boolean {
  if (!evidence || evidence.length < 5) return false;
  const snippet = evidence.replace(/\s+/g, ' ').trim().slice(0, 60);
  return log.includes(snippet);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyse a raw battle-log text using the Claude API.
 *
 * Anti-hallucination measures:
 *  1. The full log is passed verbatim – Claude cannot invent events.
 *  2. Every item in the response requires an `evidence` field that must be a
 *     word-for-word quote from the log.
 *  3. After parsing we drop every item whose evidence cannot be located in the
 *     raw log text.
 *  4. temperature=0 is used for deterministic output.
 */
export async function analyzeBattleLog(
  log: string,
  playerName: string,
  apiKey: string,
): Promise<BattleAnalysis> {
  const revealedCards = extractRevealedCards(log);
  const now = new Date().toISOString();

  const systemPrompt = `Du bist ein Pokémon TCG Kampfanalyst. Analysiere Kampfprotokolle und gib präzises, datengestütztes Feedback.

PFLICHTREGELN ZUR VERMEIDUNG VON HALLUZINATIONEN:
1. Erwähne NUR Karten und Ereignisse, die wortwörtlich im Protokoll stehen.
2. Jedes "evidence"-Feld MUSS eine wörtliche Textzeile aus dem Protokoll sein (Kopie, kein Paraphrasieren).
3. Schlage als Alternative NUR Karten vor, die im Protokoll explizit auf der Hand des Spielers zu sehen waren (durch Kartenlistungen mit "•" belegt).
4. Bei Unsicherheit: Punkt weglassen statt spekulieren.
5. Deck-Empfehlungen nur für Karten, die im Protokoll tatsächlich vorkommen.
Antworte ausschließlich mit validem JSON, ohne Markdown-Codeblöcke oder Erklärungen.`;

  const userPrompt = `Analysiere folgendes Kampfprotokoll für Spieler "${playerName}":

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
  "analyzedAt": "${now}"
}

Fokus auf wenige, gut belegte Punkte. Qualität vor Quantität.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Anthropic API Fehler ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawText: string = data.content?.[0]?.text ?? '';

  // Strip accidental markdown fences
  const jsonStr = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const analysis: BattleAnalysis = JSON.parse(jsonStr);

  // ── Evidence validation: discard any item whose quote can't be found ─────────
  analysis.keyMoments     = (analysis.keyMoments     ?? []).filter((m) => evidenceExistsInLog(m.evidence, log));
  analysis.playMistakes   = (analysis.playMistakes   ?? []).filter((m) => evidenceExistsInLog(m.evidence, log));
  analysis.cardNotes      = (analysis.cardNotes      ?? []).filter((n) => evidenceExistsInLog(n.evidence, log));
  analysis.deckSuggestions = (analysis.deckSuggestions ?? []).filter((s) => evidenceExistsInLog(s.evidence, log));

  // Ensure arrays exist even if model omitted them
  analysis.keyMoments      ??= [];
  analysis.playMistakes    ??= [];
  analysis.cardNotes       ??= [];
  analysis.deckSuggestions ??= [];

  return analysis;
}
