// Seed a few matches (with German battle logs) for a test account, via the real API.
// Going through the API means the parse-on-write pipeline runs (match_log_parsed is
// filled) and the logs are ready for the server-side LLM analysis.
//
// Usage (credentials stay in your shell, never committed):
//   API_URL=https://api-production-4f160.up.railway.app \
//   TEST_EMAIL=test@test.de TEST_PASSWORD='…' PLAYER_NAME=Ash \
//   node scripts/seed-test-matches.mjs
//
// PLAYER_NAME must match the local player's name used in the battle logs below
// (default "Ash") so the parser pins "you" correctly.

const API = process.env.API_URL;
const EMAIL = process.env.TEST_EMAIL ?? 'test@test.de';
const PASSWORD = process.env.TEST_PASSWORD;
const PLAYER = process.env.PLAYER_NAME ?? 'Ash';

if (!API || !PASSWORD) {
  console.error(
    'Missing env. Required: API_URL, TEST_PASSWORD (TEST_EMAIL defaults to test@test.de).',
  );
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
let cookie = '';

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      // Better Auth / CORS expect a same-origin Origin header (single-origin deploy).
      Origin: API,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  return res;
}

// ── German battle logs (PTCG-Live style). Local player = PLAYER (here "Ash"). ──
const MATCHES = [
  {
    archetype: 'charizard-ex',
    result: 'W',
    log: `Vorbereitung
Ash hat den Münzwurf gewonnen.
Ash hat für die Starthand 7 Karten gezogen.
Leon hat für die Starthand 7 Karten gezogen.

Zug von Ash
Ash hat Nest Ball gespielt.
Ash hat Dreepy auf die Bank gelegt.
Ash hat Iono gespielt.
   • Rare Candy, Dragapult ex, Boss's Orders
Ash hat Psycho-Energie an Dreepy angelegt.

Zug von Leon
Leon hat Glumanda auf die Bank gelegt.
Leon hat Professor's Research gespielt.
Leon hat Feuer-Energie an Glumanda angelegt.

Zug von Ash
Ash hat Rare Candy gespielt.
Dragapult-ex von Ash hat Phantomschwarm für 120 Schadenspunkte eingesetzt.
Glumanda von Leon wurde kampfunfähig gemacht!
Ash hat eine Preiskarte aufgenommen.

Zug von Leon
Glurak-ex von Leon hat Brandklaue für 180 Schadenspunkte eingesetzt.

Zug von Ash
Ash hat Boss's Orders gespielt.
Dragapult-ex von Ash hat Phantomschwarm für 200 Schadenspunkte eingesetzt.
Glurak-ex von Leon wurde kampfunfähig gemacht!
Ash hat 2 Preiskarten aufgenommen.

Zug von Ash
Dragapult-ex von Ash hat Phantomschwarm für 200 Schadenspunkte eingesetzt.
Pidgey von Leon wurde kampfunfähig gemacht!
Ash hat 3 Preiskarten aufgenommen.

Ash hat gewonnen!`,
  },
  {
    archetype: 'gardevoir-ex',
    result: 'L',
    log: `Vorbereitung
Cynthia hat den Münzwurf gewonnen.
Ash hat für die Starthand 7 Karten gezogen.
Cynthia hat für die Starthand 7 Karten gezogen.

Zug von Cynthia
Cynthia hat Kirlia auf die Bank gelegt.
Cynthia hat Iono gespielt.
Cynthia hat Psycho-Energie an Kirlia angelegt.

Zug von Ash
Ash hat Nest Ball gespielt.
Ash hat Pokégear 3.0 gespielt.
Ash hat Psycho-Energie an Dreepy angelegt.

Zug von Cynthia
Cynthia hat Rare Candy gespielt.
Gardevoir-ex von Cynthia hat Psyschnitt für 130 Schadenspunkte eingesetzt.
Dreepy von Ash wurde kampfunfähig gemacht!
Cynthia hat eine Preiskarte aufgenommen.

Zug von Ash
Ash hat Professor's Research gespielt.
Dragapult-ex von Ash hat Phantomschwarm für 120 Schadenspunkte eingesetzt.

Zug von Cynthia
Gardevoir-ex von Cynthia hat Miraklanz für 200 Schadenspunkte eingesetzt.
Dragapult-ex von Ash wurde kampfunfähig gemacht!
Cynthia hat 2 Preiskarten aufgenommen.

Zug von Cynthia
Gardevoir-ex von Cynthia hat Miraklanz für 200 Schadenspunkte eingesetzt.
Drakloak von Ash wurde kampfunfähig gemacht!
Cynthia hat 3 Preiskarten aufgenommen.

Cynthia hat gewonnen!`,
  },
  {
    archetype: 'raging-bolt-ex',
    result: 'W',
    log: `Vorbereitung
Ash hat den Münzwurf gewonnen.
Ash hat für die Starthand 7 Karten gezogen.
Red hat für die Starthand 7 Karten gezogen.

Zug von Ash
Ash hat Iono gespielt.
   • Nest Ball, Dragapult ex, Rare Candy
Ash hat Dreepy auf die Bank gelegt.
Ash hat Psycho-Energie an Dreepy angelegt.

Zug von Red
Red hat Professor's Research gespielt.
Red hat Doppelschlag-Energie an Wummer angelegt.
Wummer-ex von Red hat Brüllender Donner für 70 Schadenspunkte eingesetzt.

Zug von Ash
Ash hat Rare Candy gespielt.
Ash hat Boss's Orders gespielt.
Dragapult-ex von Ash hat Phantomschwarm für 200 Schadenspunkte eingesetzt.
Wummer-ex von Red wurde kampfunfähig gemacht!
Ash hat 2 Preiskarten aufgenommen.

Zug von Red
Red hat Iono gespielt.
Teddiursa von Red hat Kratzer für 20 Schadenspunkte eingesetzt.

Zug von Ash
Dragapult-ex von Ash hat Phantomschwarm für 200 Schadenspunkte eingesetzt.
Teddiursa von Red wurde kampfunfähig gemacht!
Ash hat eine Preiskarte aufgenommen.

Zug von Ash
Dragapult-ex von Ash hat Phantomschwarm für 200 Schadenspunkte eingesetzt.
Ogerpon von Red wurde kampfunfähig gemacht!
Ash hat 3 Preiskarten aufgenommen.

Ash hat gewonnen!`,
  },
];

async function main() {
  // 1. Sign in (Better Auth email/password) and capture the session cookie.
  const signIn = await fetch(`${API}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: API },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!signIn.ok) {
    console.error(`Sign-in failed (${signIn.status}): ${await signIn.text().catch(() => '')}`);
    process.exit(1);
  }
  const setCookies = signIn.headers.getSetCookie?.() ?? [];
  cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  if (!cookie) {
    console.error('Sign-in succeeded but no session cookie was returned.');
    process.exit(1);
  }
  console.log(`Signed in as ${EMAIL}.`);

  // 2. Create a deck to attach the matches to.
  const deckRes = await api('/api/decks', {
    method: 'POST',
    body: { archetype: 'dragapult-ex', archetypeName: 'Dragapult ex', variant: 'Test' },
  });
  if (!deckRes.ok) {
    console.error(`Create deck failed (${deckRes.status}): ${await deckRes.text().catch(() => '')}`);
    process.exit(1);
  }
  const deck = await deckRes.json();
  console.log(`Created deck #${deck.id} (Dragapult ex / Test).`);

  // 3. Create the matches (battle log parsed server-side on write).
  let ok = 0;
  for (const m of MATCHES) {
    const res = await api('/api/logs', {
      method: 'POST',
      body: {
        deckId: deck.id,
        archetype: m.archetype,
        eventType: 'Online',
        eventDate: today,
        result: m.result,
        notes: 'seed',
        battleLog: m.log,
        playerName: PLAYER,
      },
    });
    if (res.ok) {
      const log = await res.json();
      ok += 1;
      console.log(`  + match #${log.id} vs ${m.archetype} (${m.result})`);
    } else {
      console.warn(`  ! failed vs ${m.archetype} (${res.status}): ${await res.text().catch(() => '')}`);
    }
  }
  console.log(`Done: ${ok}/${MATCHES.length} matches created. Open them in the Match Log → Analyse tab.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
