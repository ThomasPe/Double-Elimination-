// Double-Elimination-Logik ohne Abhängigkeiten.
// Spieler werden über ihren Index (0..n-1) angesprochen, BYE steht für ein Freilos.

export const BYE = -1;

function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Klassische Setzreihenfolge: 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6 ...
export function seedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((s) => [s, sum - s]);
  }
  return order;
}

const BRACKET_RANK = { W: 0, L: 1, F: 2 };

export function buildBracket(n) {
  if (n < 2) throw new Error("Mindestens 2 Teilnehmer");
  const size = Math.max(4, nextPow2(n));
  const k = Math.log2(size);
  const matches = [];
  const byId = {};
  const add = (m) => {
    matches.push(m);
    byId[m.id] = m;
    return m;
  };

  // Winner-Bracket
  const order = seedOrder(size);
  const W = [];
  W[1] = [];
  for (let i = 0; i < size / 2; i++) {
    W[1].push(add({
      id: `W1-${i + 1}`, bracket: "W", round: 1, index: i,
      slots: [{ seed: order[2 * i] - 1 }, { seed: order[2 * i + 1] - 1 }],
    }));
  }
  for (let r = 2; r <= k; r++) {
    W[r] = [];
    for (let i = 0; i < size / 2 ** r; i++) {
      W[r].push(add({
        id: `W${r}-${i + 1}`, bracket: "W", round: r, index: i,
        slots: [{ winnerOf: W[r - 1][2 * i].id }, { winnerOf: W[r - 1][2 * i + 1].id }],
      }));
    }
  }

  // Loser-Bracket: abwechselnd Runden unter sich und Runden mit Absteigern aus dem Winner-Bracket
  const L = [];
  L[1] = [];
  for (let i = 0; i < size / 4; i++) {
    L[1].push(add({
      id: `L1-${i + 1}`, bracket: "L", round: 1, index: i,
      slots: [{ loserOf: W[1][2 * i].id }, { loserOf: W[1][2 * i + 1].id }],
    }));
  }
  for (let j = 1; j <= k - 1; j++) {
    const r = 2 * j;
    const cnt = size / 2 ** (j + 1);
    L[r] = [];
    for (let i = 0; i < cnt; i++) {
      // Reihenfolge der Absteiger abwechselnd umdrehen, damit sich Paarungen nicht sofort wiederholen
      const wi = j % 2 === 1 ? cnt - 1 - i : i;
      L[r].push(add({
        id: `L${r}-${i + 1}`, bracket: "L", round: r, index: i,
        slots: [{ winnerOf: L[r - 1][i].id }, { loserOf: W[j + 1][wi].id }],
      }));
    }
    if (j < k - 1) {
      const r2 = r + 1;
      L[r2] = [];
      for (let i = 0; i < cnt / 2; i++) {
        L[r2].push(add({
          id: `L${r2}-${i + 1}`, bracket: "L", round: r2, index: i,
          slots: [{ winnerOf: L[r][2 * i].id }, { winnerOf: L[r][2 * i + 1].id }],
        }));
      }
    }
  }
  const roundsL = 2 * (k - 1);

  const final = add({
    id: "F", bracket: "F", round: 1, index: 0,
    slots: [{ winnerOf: W[k][0].id }, { winnerOf: L[roundsL][0].id }],
  });

  // Statisch bestimmen, welche Spiele reine Freilos-Spiele sind
  const srcOf = (s) => byId[s.winnerOf ?? s.loserOf];
  const isByeSrc = (s) => {
    if ("seed" in s) return s.seed >= n;
    return "winnerOf" in s ? srcOf(s).bothBye : srcOf(s).anyBye;
  };
  for (const m of matches) {
    const b = m.slots.map(isByeSrc);
    m.slotBye = b;
    m.anyBye = b[0] || b[1];
    m.bothBye = b[0] && b[1];
    m.real = !m.anyBye;
    const d = m.slots.map((s) => ("seed" in s ? 0 : srcOf(s).depth));
    m.depth = Math.max(...d) + (m.real ? 1 : 0);
  }

  const real = matches
    .filter((m) => m.real)
    .sort((a, b) =>
      a.depth - b.depth ||
      BRACKET_RANK[a.bracket] - BRACKET_RANK[b.bracket] ||
      a.round - b.round ||
      a.index - b.index);
  real.forEach((m, i) => { m.no = i + 1; });

  return { n, size, k, matches, byId, W, L, roundsL, final, realCount: real.length };
}

// results: { [matchId]: [siegerIndex, verliererIndex] }
// Liefert den Zustand aller Spiele und die IDs gespeicherter Ergebnisse,
// die nicht mehr zu den aktuellen Paarungen passen.
export function resolve(br, results) {
  const st = {};
  const stale = [];
  const val = (src) => {
    if ("seed" in src) return src.seed < br.n ? src.seed : BYE;
    const s = st[src.winnerOf ?? src.loserOf];
    if (s.winner === null) return null;
    return "winnerOf" in src ? s.winner : s.loser;
  };
  for (const m of br.matches) {
    const p = m.slots.map(val);
    const s = { players: p, winner: null, loser: null, playable: false };
    const r = results[m.id];
    if (p[0] !== null && p[1] !== null) {
      if (p[0] === BYE || p[1] === BYE) {
        s.winner = p[0] === BYE ? p[1] : p[0];
        s.loser = BYE;
      } else if (r && r[0] !== r[1] && p.includes(r[0]) && p.includes(r[1])) {
        s.winner = r[0];
        s.loser = r[1];
      } else {
        if (r) stale.push(m.id);
        s.playable = true;
      }
    } else if (r) {
      stale.push(m.id);
    }
    st[m.id] = s;
  }
  return { st, stale };
}

// Entfernt alle Ergebnisse, die nach einer Änderung nicht mehr gültig sind.
export function cleanResults(br, results) {
  const out = { ...results };
  const { stale } = resolve(br, out);
  for (const id of stale) delete out[id];
  return { results: out, removed: stale };
}

// Niederlagen, Ausscheiden und Platzierung je Spieler
export function standings(br, st) {
  const losses = Array(br.n).fill(0);
  const out = Array(br.n).fill(null); // Runde des Ausscheidens (höher = später)
  for (const m of br.matches) {
    const s = st[m.id];
    if (!m.real || s.winner === null) continue;
    losses[s.loser]++;
    if (m.bracket === "L") out[s.loser] = m.round;
    if (m.bracket === "F") out[s.loser] = br.roundsL + 1;
  }
  const champion = st[br.final.id].winner;
  const done = champion !== null;
  const rows = [];
  for (let i = 0; i < br.n; i++) {
    const key = i === champion ? Infinity : out[i];
    let place = null;
    if (done) place = 1 + out.filter((o, j) => (j === champion ? Infinity : o) > key).length;
    rows.push({ player: i, losses: losses[i], out: out[i], place });
  }
  return { rows, champion, done };
}
