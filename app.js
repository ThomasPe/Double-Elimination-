import { buildBracket, resolve, cleanResults, standings, BYE } from "./bracket.js";

const KEY = "double-elimination:v1";
const CLUB = "Burschenschaft Wangen e.V.";
const $app = document.getElementById("app");
const $toast = document.getElementById("toast");
const BEAMER = new URLSearchParams(location.search).has("beamer");
const mark = (cls = "mb") => `<svg class="${cls}" aria-hidden="true"><use href="#maibaum"/></svg>`;

let T = load();          // { name, players, results, history }
let br = T ? buildBracket(T.players.length) : null;
let tab = "games";
let draft = { name: "", players: "", shuffle: true };

// ---------- Speicher ----------
function load() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY));
    if (t && Array.isArray(t.players) && t.players.length >= 3) {
      t.results ??= {};
      t.history ??= [];
      return t;
    }
  } catch { /* nichts gespeichert oder Speicher blockiert */ }
  return null;
}
function save() {
  try {
    if (T) localStorage.setItem(KEY, JSON.stringify(T));
    else localStorage.removeItem(KEY);
  } catch { /* Speichern nicht möglich, Turnier läuft trotzdem weiter */ }
}

// ---------- Hilfen ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nm = (i) => esc(T.players[i]);

function roundName(m) {
  if (m.bracket === "F") return "Finale";
  if (m.bracket === "W") {
    if (m.round === br.k) return "Winner-Finale";
    if (m.round === br.k - 1 && br.k > 2) return "Winner-Halbfinale";
    return `Winner Runde ${m.round}`;
  }
  if (m.round === br.roundsL) return "Loser-Finale";
  return `Loser Runde ${m.round}`;
}
const bracketName = { W: "Winner-Bracket", L: "Loser-Bracket", F: "Finale" };

// Text für einen noch offenen Platz, z. B. "Sieger Spiel 4"
function describe(src) {
  if ("seed" in src) return src.seed < br.n ? nm(src.seed) : "Freilos";
  const m = br.byId[src.winnerOf ?? src.loserOf];
  if ("winnerOf" in src) {
    if (m.real) return `Sieger Spiel ${m.no}`;
    return describe(m.slots[m.slotBye[0] ? 1 : 0]);
  }
  return `Verlierer Spiel ${m.no}`;
}

function slotText(m, s, i) {
  const p = s.players[i];
  if (p === null) return { text: describe(m.slots[i]), pending: true };
  if (p === BYE) return { text: "Freilos", pending: true };
  return { text: nm(p), pending: false };
}

// ---------- Tische ----------
const tableCount = () => T.tableCount ?? 3;
let tableOf = {}; // Spiel-ID -> Tischnummer, für die Anzeige in den Turnierbäumen

// Ein Spiel bleibt an seinem Tisch, bis es entschieden ist.
// Freie Tische bekommen das nächste spielbare Spiel (niedrigste Spielnummer zuerst).
function computeTables(st) {
  const n = tableCount();
  const seen = new Set();
  const tables = Array.from({ length: n }, (_, i) => {
    const id = T.tables?.[i];
    if (!id || seen.has(id) || !st[id]?.playable) return null;
    seen.add(id);
    return id;
  });
  const waiting = br.matches
    .filter((m) => m.real && st[m.id].playable && !seen.has(m.id))
    .sort((a, b) => a.no - b.no);
  for (let i = 0; i < n; i++) if (!tables[i] && waiting.length) tables[i] = waiting.shift().id;
  tableOf = {};
  tables.forEach((id, i) => { if (id) tableOf[id] = i + 1; });
  return { tables, waiting };
}

// ---------- Aktionen ----------
function startTournament(form) {
  const name = form.name.value.trim() || "Turnier";
  const players = form.players.value.split("\n").map((s) => s.trim()).filter(Boolean);
  const err = form.querySelector(".error");
  const dupes = [...new Set(players.filter((p, i) => players.findIndex((q) => q.toLowerCase() === p.toLowerCase()) !== i))];
  if (players.length < 3) return (err.textContent = "Trag mindestens 3 Teilnehmer ein, einen pro Zeile.");
  if (players.length > 64) return (err.textContent = `Es sind höchstens 64 Teilnehmer möglich, eingetragen sind ${players.length}.`);
  if (dupes.length) return (err.textContent = `Jeder Name darf nur einmal vorkommen. Doppelt: ${dupes.join(", ")}`);
  if (form.shuffle.checked) {
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j], players[i]];
    }
  }
  const tableCount = Math.min(16, Math.max(1, parseInt(form.tables.value, 10) || 3));
  T = { name, players, tableCount, tables: [], results: {}, history: [] };
  br = buildBracket(players.length);
  tab = "games";
  save();
  render();
}

function setWinner(id, winner) {
  const { st } = resolve(br, T.results);
  const s = st[id];
  if (!s || !s.players.includes(winner) || s.players.includes(BYE) || s.players.includes(null)) return;
  const loser = s.players[0] === winner ? s.players[1] : s.players[0];
  const prev = T.results;
  if (prev[id] && prev[id][0] === winner) return;
  const { results, removed } = cleanResults(br, { ...prev, [id]: [winner, loser] });
  if (removed.length) {
    const ok = confirm(`Damit ändern sich spätere Paarungen. ${removed.length === 1 ? "1 Ergebnis wird" : removed.length + " Ergebnisse werden"} gelöscht und muss neu eingetragen werden. Fortfahren?`);
    if (!ok) return;
  }
  T.history.push({ results: prev, tables: T.tables ?? [] });
  if (T.history.length > 300) T.history.shift();
  T.results = results;
  const table = tableOf[id];
  save();
  render();
  const m = br.byId[id];
  const next = table && T.tables?.[table - 1];
  toast(`${nm(winner)} gewinnt Spiel ${m.no}${next ? `. An Tisch ${table} folgt Spiel ${br.byId[next].no}` : ""}`, true);
}

function undo() {
  if (!T.history.length) return;
  const h = T.history.pop();
  if (h && h.results) {
    T.results = h.results;
    T.tables = h.tables;
  } else {
    T.results = h; // ältere Einträge enthielten nur die Ergebnisse
  }
  save();
  render();
  toast("Letzte Eingabe zurückgenommen");
}

function newTournament() {
  if (!confirm("Das aktuelle Turnier wird gelöscht. Neues Turnier anlegen?")) return;
  draft = { name: T.name, players: T.players.join("\n"), shuffle: true, tables: tableCount() };
  T = null;
  br = null;
  save();
  render();
}

let toastTimer;
function toast(html, withUndo = false) {
  $toast.innerHTML = `<span>${html}</span>${withUndo ? '<button type="button" data-act="undo">Rückgängig</button>' : ""}`;
  $toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove("show"), 4500);
}

// ---------- Ansichten ----------
function render() {
  if (BEAMER) return renderBeamer();
  if (!T) return renderSetup();
  const { st } = resolve(br, T.results);
  const real = br.matches.filter((m) => m.real);
  const played = real.filter((m) => st[m.id].winner !== null).length;
  const champ = st[br.final.id].winner;
  const tb = computeTables(st);
  if (JSON.stringify(tb.tables) !== JSON.stringify(T.tables)) {
    T.tables = tb.tables;
    save();
  }

  const tabs = [
    ["games", "Spiele"],
    ["W", "Winner"],
    ["L", "Loser"],
    ["rank", "Rangliste"],
  ];

  $app.innerHTML = `
    <header class="top">
      <div class="top-row">
        ${mark()}
        <div class="title">
          <p class="club">${CLUB}</p>
          <h1>${esc(T.name)}</h1>
          <p>${champ !== null ? `Beendet, ${nm(champ)} gewinnt` : `${played} von ${real.length} Spielen gespielt`}</p>
        </div>
        <div class="actions">
          <button type="button" class="ghost" data-act="undo" ${T.history.length ? "" : "disabled"}>Rückgängig</button>
          <button type="button" class="ghost beamer-btn" data-act="beamer" title="Öffnet ein zweites Fenster für den Beamer">Beamer</button>
          <button type="button" class="ghost" data-act="new">Neues Turnier</button>
        </div>
      </div>
      <div class="progress" aria-hidden="true"><i style="width:${(played / real.length) * 100}%"></i></div>
      <nav class="tabs" role="tablist">
        ${tabs.map(([k, l]) => `<button type="button" role="tab" class="tab tab-${k}" aria-selected="${tab === k}" data-tab="${k}">${l}</button>`).join("")}
      </nav>
    </header>
    <main class="view view-${tab}">
      ${tab === "games" ? viewGames(st, champ, tb) : ""}
      ${tab === "W" ? viewBracket(st, "W") : ""}
      ${tab === "L" ? viewBracket(st, "L") : ""}
      ${tab === "rank" ? viewRank(st) : ""}
    </main>`;

  if (tab === "W" || tab === "L") requestAnimationFrame(drawWires);
}

function renderSetup() {
  $app.innerHTML = `
    <main class="setup">
      <div class="setup-intro">
        ${mark("mb-big")}
        <p class="club">${CLUB}</p>
        <h1>Turnier im Doppel-K.-o.</h1>
        <p>Wer zweimal verliert, ist raus. Nach der ersten Niederlage geht es im Loser-Bracket weiter, im Finale treffen die beiden Bracket-Sieger aufeinander.</p>
      </div>
      <form class="setup-form" novalidate>
        <label class="field">
          <span>Turniername</span>
          <input name="name" autocomplete="off" placeholder="z. B. Schafkopf-Turnier zur Maifeier" value="${esc(draft.name)}">
        </label>
        <label class="field">
          <span>Teilnehmer <em class="count"></em></span>
          <textarea name="players" rows="10" placeholder="Ein Name pro Zeile" spellcheck="false">${esc(draft.players)}</textarea>
        </label>
        <label class="field field-inline">
          <span>Anzahl Tische</span>
          <input name="tables" type="number" inputmode="numeric" min="1" max="16" value="${esc(draft.tables ?? 3)}">
        </label>
        <label class="check">
          <input type="checkbox" name="shuffle" ${draft.shuffle ? "checked" : ""}>
          <span>Setzliste auslosen
            <small>Ohne Auslosung gilt die Reihenfolge als Setzliste: Die ersten Namen treffen erst spät aufeinander und bekommen bei ungerader Anzahl die Freilose.</small>
          </span>
        </label>
        <p class="error" role="alert"></p>
        <button type="submit" class="primary">Turnier starten</button>
      </form>
    </main>`;
  const form = $app.querySelector("form");
  const count = form.querySelector(".count");
  const upd = () => {
    const n = form.players.value.split("\n").filter((s) => s.trim()).length;
    count.textContent = n ? `${n} eingetragen` : "";
    draft = { name: form.name.value, players: form.players.value, shuffle: form.shuffle.checked, tables: form.tables.value };
  };
  form.addEventListener("input", upd);
  upd();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    startTournament(form);
  });
}

function duelCard(m, st) {
  const p = st[m.id].players;
  return `<div class="card-meta"><b>Spiel ${m.no}</b><span>${roundName(m)}</span></div>
    <div class="duel">
      <button type="button" class="pick" data-win="${m.id}:${p[0]}">${nm(p[0])}</button>
      <span class="vs">gegen</span>
      <button type="button" class="pick" data-win="${m.id}:${p[1]}">${nm(p[1])}</button>
    </div>`;
}

function viewGames(st, champ, tb) {
  const real = br.matches.filter((m) => m.real);
  const next = real.filter((m) => !st[m.id].playable && st[m.id].winner === null).sort((a, b) => a.no - b.no);
  const done = real.filter((m) => st[m.id].winner !== null).sort((a, b) => b.no - a.no);

  let html = "";
  if (champ !== null) {
    html += `<section class="champ">
      <p>Turniersieger</p>
      <strong>${nm(champ)}</strong>
      <button type="button" class="ghost" data-tab="rank">Rangliste ansehen</button>
    </section>`;
  } else {
    const n = tableCount();
    html += `<section class="block">
      <div class="block-head">
        <h2>Tische</h2>
        <div class="stepper" role="group" aria-label="Anzahl Tische">
          <button type="button" data-act="tables-minus" ${n <= 1 ? "disabled" : ""} aria-label="Ein Tisch weniger">−</button>
          <span>${n} ${n === 1 ? "Tisch" : "Tische"}</span>
          <button type="button" data-act="tables-plus" ${n >= 16 ? "disabled" : ""} aria-label="Ein Tisch mehr">+</button>
        </div>
      </div>
      <p class="lead">Tippe auf den Namen des Siegers. Danach rückt an diesem Tisch automatisch das nächste Spiel nach.</p>
      <div class="cards">
        ${tb.tables.map((id, i) => {
          if (!id) {
            return `<article class="card table-card is-free">
              <p class="table-no">Tisch ${i + 1}</p>
              <p class="free">Frei. Das nächste Spiel wartet noch auf Ergebnisse.</p>
            </article>`;
          }
          const m = br.byId[id];
          return `<article class="card table-card b-${m.bracket}">
            <p class="table-no">Tisch ${i + 1}</p>
            ${duelCard(m, st)}
          </article>`;
        }).join("")}
      </div>
    </section>`;
    if (tb.waiting.length) {
      html += `<section class="block">
        <h2>Wartet auf einen Tisch <span class="n">${tb.waiting.length}</span></h2>
        <p class="lead">Kommt an den nächsten frei werdenden Tisch, in dieser Reihenfolge.</p>
        <div class="cards">
          ${tb.waiting.map((m, i) => `<article class="card b-${m.bracket} waiting">
            <p class="queue-no">${i === 0 ? "Als Nächstes" : `${i + 1}. in der Warteschlange`}</p>
            ${duelCard(m, st)}
          </article>`).join("")}
        </div>
      </section>`;
    }
  }
  if (next.length) {
    html += `<section class="block">
      <h2>Danach <span class="n">${next.length}</span></h2>
      <ul class="rows">
        ${next.slice(0, 8).map((m) => {
          const s = st[m.id];
          const a = slotText(m, s, 0), b = slotText(m, s, 1);
          return `<li class="row b-${m.bracket}">
            <span class="no">Spiel ${m.no}</span>
            <span class="who"><span class="${a.pending ? "tbd" : ""}">${a.text}</span> <i>gegen</i> <span class="${b.pending ? "tbd" : ""}">${b.text}</span></span>
            <span class="rn">${roundName(m)}</span>
          </li>`;
        }).join("")}
      </ul>
      ${next.length > 8 ? `<p class="more">und ${next.length - 8} weitere</p>` : ""}
    </section>`;
  }
  if (done.length) {
    html += `<section class="block">
      <h2>Gespielt <span class="n">${done.length}</span></h2>
      <ul class="rows">
        ${done.map((m) => {
          const s = st[m.id];
          return `<li class="row b-${m.bracket}">
            <span class="no">Spiel ${m.no}</span>
            <span class="who"><b>${nm(s.winner)}</b> <i>schlägt</i> ${nm(s.loser)}</span>
            <button type="button" class="link" data-win="${m.id}:${s.loser}" title="${nm(s.loser)} als Sieger eintragen">Korrigieren</button>
          </li>`;
        }).join("")}
      </ul>
    </section>`;
  }
  return html;
}

function matchCard(m, st, readonly = false) {
  const s = st[m.id];
  if (!m.real) return `<div class="bm ghost-match" aria-hidden="true"><div class="bm-no">&nbsp;</div><div class="slot">&nbsp;</div><div class="slot">&nbsp;</div></div>`;
  const live = s.players[0] !== null && s.players[1] !== null;
  const rows = [0, 1].map((i) => {
    const t = slotText(m, s, i);
    const p = s.players[i];
    const cls = s.winner === null ? (t.pending ? "tbd" : "") : p === s.winner ? "won" : "lost";
    if (live && !readonly) {
      return `<button type="button" class="slot ${cls}" data-win="${m.id}:${p}" data-slot="${i}" aria-label="${t.text} als Sieger von Spiel ${m.no}">${t.text}</button>`;
    }
    return `<div class="slot ${cls}" data-slot="${i}">${t.text}</div>`;
  }).join("");
  const state = s.winner !== null ? "is-done" : live ? "is-live" : "";
  const table = s.playable && tableOf[m.id] ? `<span class="tb">Tisch ${tableOf[m.id]}</span>` : "";
  return `<div class="bm b-${m.bracket} ${state}" data-id="${m.id}"><div class="bm-no">Spiel ${m.no}${table}</div>${rows}</div>`;
}

function bracketHTML(st, which, readonly = false) {
  const rounds = which === "W" ? br.W.slice(1) : br.L.slice(1);
  const cols = rounds
    .filter((ms) => ms.some((m) => m.real)) // Runden nur aus Freilosen weglassen
    .map((ms) => ({ title: roundName(ms[0]), matches: ms }));
  if (which === "W") cols.push({ title: "Finale", matches: [br.final], final: true });
  return `
    <div class="bracket">
      <svg class="wires" aria-hidden="true"></svg>
      ${cols.map((c) => `
        <section class="col${c.final ? " col-final" : ""}">
          <h3>${c.title}</h3>
          <div class="col-matches">${c.matches.map((m) => matchCard(m, st, readonly)).join("")}</div>
        </section>`).join("")}
    </div>`;
}

function viewBracket(st, which) {
  const hint = which === "W"
    ? "Wer hier verliert, wechselt ins Loser-Bracket. Der Sieger zieht direkt ins Finale ein."
    : "Wer hier verliert, scheidet aus. Der Sieger des Loser-Finales spielt das Finale.";
  return `
    <p class="lead pad">${hint}</p>
    <div class="scroller">${bracketHTML(st, which)}</div>`;
}

// ---------- Beamer ----------
let beamerLight = false;
try { beamerLight = localStorage.getItem(KEY + ":beamer-light") === "1"; } catch { /* egal */ }

function renderBeamer() {
  document.body.classList.add("beamer");
  document.body.classList.toggle("beamer-light", beamerLight);
  const controls = `<div class="b-ctl">
      <button type="button" data-act="fs">Vollbild</button>
      <button type="button" data-act="theme">${beamerLight ? "Dunkel" : "Hell"}</button>
    </div>`;
  if (!T) {
    $app.innerHTML = `<div class="b-wait">
      ${mark("mb-big")}
      <p class="club">${CLUB}</p>
      <h1>Gleich geht’s los</h1>
      <p>Sobald das Turnier im anderen Fenster gestartet ist, erscheint hier der Turnierbaum.</p>
    </div>${controls}`;
    return;
  }
  const { st } = resolve(br, T.results);
  const champ = st[br.final.id].winner;
  const tb = computeTables(st);
  let tablesHtml = "";
  if (champ === null) {
    // Als Nächstes: zuerst spielbare Spiele ohne Tisch, dann Spiele, die noch auf Ergebnisse warten
    const upcoming = [
      ...tb.waiting,
      ...br.matches
        .filter((m) => m.real && !st[m.id].playable && st[m.id].winner === null)
        .sort((a, b) => a.no - b.no),
    ].slice(0, 3);
    tablesHtml = `<div class="b-tables" style="--n:${tb.tables.length}">
      ${tb.tables.map((id, i) => {
        if (!id) return `<div class="tbl is-free"><span class="tn">Tisch ${i + 1}</span><span class="tf">frei</span></div>`;
        const m = br.byId[id];
        const p = st[id].players;
        return `<div class="tbl b-${m.bracket}">
          <span class="tn">Tisch ${i + 1}</span>
          <strong>${nm(p[0])}</strong><i>gegen</i><strong>${nm(p[1])}</strong>
          <em>Spiel ${m.no}, ${roundName(m)}</em>
        </div>`;
      }).join("")}
      ${upcoming.length ? `<div class="tbl-next">
        <span class="tn">Als Nächstes</span>
        ${upcoming.map((m) => {
          const s = st[m.id];
          const a = slotText(m, s, 0), b = slotText(m, s, 1);
          return `<p class="b-${m.bracket}"><em>Spiel ${m.no}</em><span class="${a.pending ? "tbd" : ""}">${a.text}</span> <i>gegen</i> <span class="${b.pending ? "tbd" : ""}">${b.text}</span></p>`;
        }).join("")}
      </div>` : ""}
    </div>`;
  }
  const now = champ !== null
    ? `<div class="b-champ"><span>Turniersieger</span><strong>${nm(champ)}</strong></div>`
    : "";
  $app.innerHTML = `
    <div class="stage">
      <header class="b-head">
        ${mark()}
        <div class="b-title"><p class="club">${CLUB}</p><h1>${esc(T.name)}</h1></div>
        ${now}
      </header>
      ${tablesHtml}
      <div class="b-body">
        <section class="b-sec sec-W"><h2>Winner-Bracket</h2>${bracketHTML(st, "W", true)}</section>
        <section class="b-sec sec-L"><h2>Loser-Bracket</h2>${bracketHTML(st, "L", true)}</section>
      </div>
    </div>
    ${controls}`;
  requestAnimationFrame(() => {
    fitStage();
    drawWires();
  });
}

function fitStage() {
  const stage = $app.querySelector(".stage");
  if (!stage) return;
  stage.style.transform = "none";
  const pad = 0.96;
  // Untereinander oder nebeneinander: genommen wird, was größer auf die Leinwand passt
  const measure = (side) => {
    stage.classList.toggle("side", side);
    const w = stage.offsetWidth, h = stage.offsetHeight;
    return { side, w, h, s: Math.min((innerWidth * pad) / w, (innerHeight * pad) / h, 3) };
  };
  const a = measure(false), b = measure(true);
  const best = b.s > a.s * 1.05 ? b : a;
  stage.classList.toggle("side", best.side);
  const { w, h, s } = best;
  const x = (innerWidth - w * s) / 2, y = (innerHeight - h * s) / 2;
  stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
}

function drawWires() {
  for (const host of $app.querySelectorAll(".bracket")) wireBracket(host);
}

function wireBracket(host) {
  const svg = host.querySelector(".wires");
  if (!svg) return;
  const base = host.getBoundingClientRect();
  const k = base.width / host.offsetWidth || 1; // Skalierung im Beamer-Modus herausrechnen
  svg.setAttribute("width", host.scrollWidth);
  svg.setAttribute("height", host.scrollHeight);
  let paths = "";
  for (const el of host.querySelectorAll(".bm[data-id]")) {
    const m = br.byId[el.dataset.id];
    m.slots.forEach((src, i) => {
      if (!("winnerOf" in src)) return;
      let from = br.byId[src.winnerOf];
      // Freilos-Spiele überspringen und zur echten Quelle zurückverfolgen
      while (from && !from.real) {
        const s2 = from.slots[from.slotBye[0] ? 1 : 0];
        from = "winnerOf" in s2 ? br.byId[s2.winnerOf] : null;
        if (from && from.bracket !== m.bracket && m.bracket !== "F") from = null;
      }
      if (!from) return;
      const fe = host.querySelector(`.bm[data-id="${from.id}"]`);
      const te = el.querySelector(`[data-slot="${i}"]`);
      if (!fe || !te) return;
      const a = fe.getBoundingClientRect();
      const b = te.getBoundingClientRect();
      const fn = fe.querySelector(".bm-no").getBoundingClientRect();
      const x1 = (a.right - base.left) / k, y1 = (a.top + fn.height + (a.bottom - a.top - fn.height) / 2 - base.top) / k;
      const x2 = (b.left - base.left) / k, y2 = (b.top + b.height / 2 - base.top) / k;
      const mx = x1 + (x2 - x1) / 2;
      const done = el.classList.contains("is-done") || el.classList.contains("is-live");
      paths += `<path class="${done ? "on" : ""}" d="M${x1} ${y1}H${mx}V${y2}H${x2}"/>`;
    });
  }
  svg.innerHTML = paths;
}

function viewRank(st) {
  const { rows, champion, done } = standings(br, st);
  if (done) {
    const sorted = [...rows].sort((a, b) => a.place - b.place || a.player - b.player);
    return `
      <section class="champ">
        <p>Turniersieger</p>
        <strong>${nm(champion)}</strong>
      </section>
      <section class="block">
        <h2>Endstand</h2>
        <ol class="table">
          ${sorted.map((r, i) => {
            const same = i > 0 && sorted[i - 1].place === r.place;
            return `<li class="${r.place <= 3 ? "podium p" + r.place : ""}">
              <span class="pl">${same ? "" : r.place + "."}</span>
              <span class="nm">${nm(r.player)}</span>
              <span class="ls">${r.losses === 0 ? "ungeschlagen" : r.losses === 1 ? "1 Niederlage" : r.losses + " Niederlagen"}</span>
            </li>`;
          }).join("")}
        </ol>
      </section>`;
  }
  const alive = rows.filter((r) => r.out === null).sort((a, b) => a.losses - b.losses || a.player - b.player);
  const out = rows.filter((r) => r.out !== null).sort((a, b) => b.out - a.out || a.player - b.player);
  return `
    <section class="block">
      <h2>Noch im Turnier <span class="n">${alive.length}</span></h2>
      <ol class="table">
        ${alive.map((r) => `<li class="${r.losses ? "in-l" : "in-w"}">
          <span class="nm">${nm(r.player)}</span>
          <span class="ls">${r.losses ? "Loser-Bracket, 1 Niederlage" : "Winner-Bracket, ungeschlagen"}</span>
        </li>`).join("")}
      </ol>
    </section>
    ${out.length ? `<section class="block">
      <h2>Ausgeschieden <span class="n">${out.length}</span></h2>
      <ol class="table">
        ${out.map((r) => `<li class="gone">
          <span class="nm">${nm(r.player)}</span>
          <span class="ls">raus in ${r.out > br.roundsL ? "Finale" : roundName({ bracket: "L", round: r.out })}</span>
        </li>`).join("")}
      </ol>
    </section>` : ""}`;
}

// ---------- Ereignisse ----------
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act],[data-tab],[data-win]");
  if (!t || t.disabled) return;
  if (t.dataset.tab) {
    tab = t.dataset.tab;
    render();
    window.scrollTo({ top: 0 });
    return;
  }
  if (t.dataset.win) {
    const [id, w] = t.dataset.win.split(":");
    setWinner(id, Number(w));
    return;
  }
  if (t.dataset.act === "undo") {
    $toast.classList.remove("show");
    undo();
  }
  if (t.dataset.act === "new") newTournament();
  if (t.dataset.act === "tables-minus" || t.dataset.act === "tables-plus") {
    const d = t.dataset.act === "tables-plus" ? 1 : -1;
    T.tableCount = Math.min(16, Math.max(1, tableCount() + d));
    save();
    render();
  }
  if (t.dataset.act === "beamer") window.open(`${location.pathname}?beamer`, "turnier-beamer");
  if (t.dataset.act === "fs") {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  }
  if (t.dataset.act === "theme") {
    beamerLight = !beamerLight;
    try { localStorage.setItem(KEY + ":beamer-light", beamerLight ? "1" : "0"); } catch { /* egal */ }
    render();
  }
});

// Änderungen aus einem anderen Fenster übernehmen (Beamer läuft live mit)
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  T = load();
  br = T ? buildBracket(T.players.length) : null;
  render();
});

function relayout() {
  if (BEAMER) fitStage();
  drawWires();
}
let resizeRaf;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(relayout);
});
document.fonts?.ready.then(() => requestAnimationFrame(relayout));

// Bedienleiste im Beamer nur bei Mausbewegung zeigen
if (BEAMER) {
  let idle;
  window.addEventListener("pointermove", () => {
    document.body.classList.add("show-ctl");
    clearTimeout(idle);
    idle = setTimeout(() => document.body.classList.remove("show-ctl"), 2500);
  });
}

render();
