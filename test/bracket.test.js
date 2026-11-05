import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBracket, resolve, cleanResults, standings, BYE } from "../bracket.js";

// Spielt ein komplettes Turnier durch; pick entscheidet den Sieger eines Spiels.
function playOut(n, pick = (p) => Math.min(...p)) {
  const br = buildBracket(n);
  const results = {};
  for (let guard = 0; guard < 1000; guard++) {
    const { st } = resolve(br, results);
    const open = br.matches.filter((m) => st[m.id].playable);
    if (!open.length) return { br, results, st };
    for (const m of open) {
      const p = st[m.id].players;
      const w = pick(p, m);
      results[m.id] = [w, p[0] === w ? p[1] : p[0]];
    }
  }
  throw new Error("Turnier endet nicht");
}

test("jede Teilnehmerzahl von 3 bis 64 spielt sauber durch", () => {
  for (let n = 3; n <= 64; n++) {
    const { br, st } = playOut(n);
    const { rows, champion, done } = standings(br, st);
    assert.ok(done, `n=${n} nicht fertig`);
    assert.equal(champion, 0, `n=${n}: Topgesetzter gewinnt bei Favoritensiegen`);
    // Alle außer dem Sieger haben genau 2 Niederlagen, der Sieger 0
    for (const r of rows) {
      assert.equal(r.losses, r.player === champion ? 0 : 2, `n=${n} Spieler ${r.player}`);
    }
    // Anzahl echter Spiele: 2n-2 bei einem einzigen Finale ohne Niederlage des Siegers
    assert.equal(br.realCount, 2 * n - 2, `n=${n} Spielanzahl`);
    assert.equal(Object.values(st).filter((s) => s.winner !== null && s.loser !== BYE).length, 2 * n - 2);
  }
});

test("Sieger aus dem Loser-Bracket kann das Finale gewinnen", () => {
  // Höherer Index gewinnt, außer Spieler 0 gewinnt alle Loser-Spiele
  const { br, st } = playOut(8, (p, m) => (m.bracket === "W" ? Math.max(...p) : Math.min(...p)));
  const { champion, rows } = standings(br, st);
  assert.equal(champion, 0);
  assert.equal(rows[0].losses, 1);
  assert.equal(rows[0].place, 1);
});

test("Platzierungen sind konsistent", () => {
  const { br, st } = playOut(8);
  const { rows } = standings(br, st);
  const places = rows.map((r) => r.place).sort((a, b) => a - b);
  assert.deepEqual(places, [1, 2, 3, 4, 5, 5, 7, 7]);
});

test("Spielnummern sind fortlaufend und in spielbarer Reihenfolge", () => {
  for (let n = 3; n <= 33; n++) {
    const br = buildBracket(n);
    const nos = br.matches.filter((m) => m.real).map((m) => m.no).sort((a, b) => a - b);
    assert.deepEqual(nos, Array.from({ length: nos.length }, (_, i) => i + 1));
    for (const m of br.matches.filter((x) => x.real)) {
      for (const s of m.slots) {
        const src = br.byId[s.winnerOf ?? s.loserOf];
        if (src?.real) assert.ok(src.no < m.no, `n=${n}: ${src.id} vor ${m.id}`);
      }
    }
  }
});

test("Korrektur eines frühen Ergebnisses verwirft abhängige Ergebnisse", () => {
  const { br, results } = playOut(8);
  const m = br.byId["W1-1"];
  const [w, l] = results[m.id];
  const changed = { ...results, [m.id]: [l, w] };
  const { results: cleaned, removed } = cleanResults(br, changed);
  assert.ok(removed.length > 0);
  assert.ok(removed.includes("W2-1"));
  assert.ok(!removed.includes("W1-2"));
  assert.deepEqual(resolve(br, cleaned).stale, []);
});
