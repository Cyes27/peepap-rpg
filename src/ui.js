// ui.js
// Everything you see. It loads the data, keeps the save in memory,
// draws the current screen from the state, and handles taps.
//
// How it works:
//   1. Each screen is a function that returns an HTML string.
//   2. render() puts that HTML into <div id="app">.
//   3. Buttons carry data-act="someAction" (and maybe data-id="...").
//      One click listener looks up ACTIONS[someAction] and runs it.
//   4. After every action we save and render again.

import { newSave, newGame, maxHp, maxEnergy, unspentPoints, topAttributes } from "./state.js";
import * as engine from "./engine.js";
import { adviceByHorizon, HORIZONS } from "./advice.js";
import * as store from "./save.js";

// ---------- Data and in-memory state ----------

const D = {}; // data from data/*.json: config, attributes, skills, places, quests, advice
let save = null; // the whole save object (see state.js newSave)
let storageOk = true;
let navStack = []; // previous screens, for the Back button (not saved)
let flash = ""; // one-line message shown at the top of the screen
let draft = null; // New Game screen in progress: { name, freeSpent }
const open = { log: false, debug: false, exported: "" }; // UI-only toggles

const app = document.getElementById("app");

// Screens that belong to a running game (they show the top bar and tabs).
const IN_GAME = ["overview", "here", "detail", "bag", "me", "tree", "quests", "journal"];
const TABS = [
  ["overview", "Overview"],
  ["here", "Here"],
  ["bag", "Bag"],
  ["me", "Me"],
  ["tree", "Tree"],
];
const SHELTER_LABELS = { ground: "Ground (poor)" };
const HORIZON_LABELS = { immediate: "Immediate", short: "Short", medium: "Medium", long: "Long" };

// ---------- Small helpers ----------

// Escape text before putting it into HTML (names and notes are typed by the player).
function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function btn(label, act, extra = "") {
  return `<button type="button" data-act="${act}" ${extra}>${label}</button>`;
}

const game = () => save.game;
const place = (id) => D.places.places.find((p) => p.id === id);
const quest = (id) => D.quests.find((q) => q.id === id);
const dayTime = (g) => `Day ${g.day}, ${g.time}`;

function persist() {
  if (storageOk) store.writeSave(D.config, save);
}

// Go to a screen. push=true remembers where we came from (for Back).
function go(name, params = {}, push = true) {
  if (push && save.screen) navStack.push(save.screen);
  if (navStack.length > 30) navStack.shift();
  save.screen = { name, params };
  flash = "";
  window.scrollTo(0, 0);
}

// Go to a screen and forget the Back history (used by tabs and Overview).
function goRoot(name, params = {}) {
  navStack = [];
  go(name, params, false);
}

function back(fallback = "overview") {
  const prev = navStack.pop();
  if (prev) {
    save.screen = prev;
    flash = "";
    window.scrollTo(0, 0);
  } else {
    goRoot(fallback);
  }
}

function applySettings() {
  document.documentElement.style.fontSize = save.settings.textSize + "px";
  document.documentElement.dataset.theme = save.settings.theme;
}

// ---------- Shared pieces of in-game screens ----------

function topBar() {
  const g = game();
  const buffs = g.buffs.length ? `<span class="stat">Buffs: ${esc(g.buffs.join(", "))}</span>` : "";
  return `<header class="topbar">
    <div class="stats">
      <span class="stat">HP ${g.hp}/${maxHp(D.config, g)}</span>
      <span class="stat">Energy ${g.energy}/${maxEnergy(D.config, g)}</span>
      <span class="stat">Hunger ${g.hunger}/${D.config.meters.hungerMax}</span>
      <span class="stat">${dayTime(g)}</span>
      <span class="stat">${esc(place(g.location).name)}</span>
      ${buffs}
    </div>
    <button type="button" class="gear" data-act="openSettings" aria-label="Settings">⚙</button>
  </header>`;
}

// The row under the top bar: Overview button always in the same spot,
// plus Back on screens that have somewhere to go back to.
function navRow(showBack) {
  return `<div class="navrow">
    ${btn("Overview", "toOverview", 'class="nav-overview"')}
    ${showBack ? btn("‹ Back", "back") : ""}
  </div>`;
}

function tabs(current) {
  return `<nav class="tabs">${TABS.map(
    ([id, label]) => `<button type="button" data-act="tab" data-id="${id}" class="${id === current ? "current" : ""}">${label}</button>`
  ).join("")}</nav>`;
}

// Wrap a screen body with the top bar, nav row and tabs.
function inGame(screenName, body, { showBack = false } = {}) {
  const tab = TABS.some(([id]) => id === screenName) ? screenName : "";
  return `${topBar()}
    <main class="screen">
      ${screenName === "overview" ? "" : navRow(showBack)}
      ${flash ? `<p class="flash">${esc(flash)}</p>` : ""}
      ${body}
    </main>
    ${tabs(tab)}`;
}

// ---------- Screens ----------

const SCREENS = {};

SCREENS.title = () => `<main class="screen title">
  <h1>Peepap</h1>
  <p class="subtitle">The RPG</p>
  ${flash ? `<p class="flash">${esc(flash)}</p>` : ""}
  <div class="stack">
    ${btn("New Game", "newGame", 'class="primary"')}
    ${btn("Continue", "continue", game() ? "" : "disabled")}
    ${btn("Settings", "openSettings")}
  </div>
  <p class="muted small">Version ${esc(D.config.version)}</p>
</main>`;

SCREENS.newGame = () => {
  const c = D.config.creation;
  const used = Object.values(draft.freeSpent).reduce((a, b) => a + b, 0);
  const left = c.freePoints - used;
  const rows = D.attributes.map((a) => {
    const v = draft.freeSpent[a.id] || 0;
    return `<li class="attr">
      <div><strong>${esc(a.name)}</strong> <span class="level">${v}</span><div class="muted small">${esc(a.drives)}</div></div>
      <div class="pm">
        ${btn("−", "draftMinus", `data-id="${a.id}" aria-label="Remove a point from ${a.name}" ${v > 0 ? "" : "disabled"}`)}
        ${btn("+", "draftPlus", `data-id="${a.id}" aria-label="Add a point to ${a.name}" ${left > 0 && v < c.maxPerAttrFromFree ? "" : "disabled"}`)}
      </div>
    </li>`;
  });
  return `<main class="screen">
    <h1>New Game</h1>
    <label class="field">Name
      <input type="text" id="nameInput" maxlength="24" value="${esc(draft.name)}" autocomplete="off">
    </label>
    <p class="backstory">You wake in a stranger's body: a poor member of the Mo Clan in the village of Greywillow. The one who lived here before you left a debt of grain and labor to the clan. You have 20 copper, bare hands, and a hut with a bed on the ground. Start by surviving.</p>
    <h2>Attributes</h2>
    <p>Points left: <strong>${left}</strong> of ${c.freePoints} <span class="muted small">(max ${c.maxPerAttrFromFree} each)</span></p>
    <ul class="list">${rows.join("")}</ul>
    <div class="stack">
      ${btn("Confirm", "confirmNew", `class="primary" ${left === 0 ? "" : "disabled"}`)}
      ${left === 0 ? "" : `<p class="muted small">Spend all ${c.freePoints} points to Confirm, or tap Finish later.</p>`}
      ${btn("Finish later", "finishLater")}
      ${btn("Back to title", "toTitle")}
    </div>
  </main>`;
};

SCREENS.overview = () => {
  const g = game();
  const top = topAttributes(D.attributes, g).map((a) => `${esc(a.name)} ${a.level}`).join(", ");
  const active = g.quests.active ? quest(g.quests.active) : null;
  const groups = adviceByHorizon(D.advice, g, D.config);
  const adviceHtml = HORIZONS.filter((h) => groups[h].length)
    .map((h) => `<h4>${HORIZON_LABELS[h]}</h4><ul class="plain">${groups[h].map((r) => `<li>${esc(r.text)}</li>`).join("")}</ul>`)
    .join("");
  const logHtml = g.log.length
    ? `<ul class="plain log">${g.log.map((m) => `<li><span class="muted">Day ${m.day}, ${m.time}</span> ${esc(m.text)}</li>`).join("")}</ul>`
    : `<p class="muted">No messages yet.</p>`;

  // Each section heading is a button that links to its screen.
  const section = (title, act, to, body) => `<section class="card">
    <button type="button" class="card-head" data-act="${act}">${title} <span class="muted small">→ ${to}</span></button>
    ${body}
  </section>`;

  return inGame("overview", `
    ${section("Who", "toMe", "Me", `<dl>
      <dt>Name</dt><dd>${esc(g.name)}</dd>
      <dt>Origin</dt><dd>Mo Clan, Greywillow</dd>
      <dt>Cultivation</dt><dd>Mortal (no qi yet)</dd>
      <dt>Top attributes</dt><dd>${top}</dd></dl>`)}
    ${section("Condition", "toMe", "Me", `<dl>
      <dt>HP</dt><dd>${g.hp} / ${maxHp(D.config, g)}</dd>
      <dt>Energy</dt><dd>${g.energy} / ${maxEnergy(D.config, g)}</dd>
      <dt>Hunger</dt><dd>${g.hunger} / ${D.config.meters.hungerMax}</dd>
      <dt>Injuries</dt><dd>${g.injuries.length ? esc(g.injuries.join(", ")) : "none"}</dd>
      <dt>Buffs</dt><dd>${g.buffs.length ? esc(g.buffs.join(", ")) : "none"}</dd>
      <dt>Warnings</dt><dd>none</dd></dl>`)}
    ${section("Where", "toHere", "Here", `<dl>
      <dt>Place</dt><dd>${esc(place(g.location).name)}</dd>
      <dt>Shelter</dt><dd>${esc(SHELTER_LABELS[g.shelter] || g.shelter)}</dd>
      <dt>Time</dt><dd>${dayTime(g)}</dd></dl>`)}
    ${section("Doing", "toHere", "Here", `<dl>
      <dt>Last action</dt><dd>${g.lastAction ? esc(g.lastAction) : "Nothing yet"}</dd>
      <dt>Current focus</dt><dd>${active ? esc(active.title) : "None"}</dd></dl>`)}
    ${section("Planning", "toQuests", "Quests", `
      ${active ? `<p class="pinned">📌 <strong>${esc(active.title)}</strong> <span class="muted small">(${HORIZON_LABELS[active.horizon]})</span></p>` : `<p class="muted">No active quest.</p>`}
      ${adviceHtml || `<p class="muted">No suggestions.</p>`}
      ${btn("Quests", "toQuests")}`)}
    <section class="card">
      ${btn(`Message log ${open.log ? "▲" : "▼"}`, "toggleLog", 'class="card-head"')}
      ${open.log ? logHtml : ""}
    </section>
    <p class="muted small center">Version ${esc(D.config.version)}</p>
  `);
};

SCREENS.here = () => {
  const g = game();
  const hub = place(g.location);
  const pois = D.places.places.filter((p) => p.parent === hub.id && p.kind === "poi");
  const poiIds = pois.map((p) => p.id);
  const poiName = (id) => (place(id) ? place(id).name : id);
  const people = D.places.people.filter((p) => poiIds.includes(p.at));
  const things = D.places.things.filter((t) => poiIds.includes(t.at));
  const level = hub.recommendedLevel ?? D.config.placeholders.recommendedLevel;
  const item = (type, id, label) => `<li>${btn(label, "detail", `data-type="${type}" data-id="${id}" class="row"`)}</li>`;

  return inGame("here", `
    <h1>${esc(hub.name)}</h1>
    <p class="muted">Recommended level ${level} · ${dayTime(g)}</p>
    <p>${esc(hub.blurb)}</p>
    <h2>People</h2>
    <ul class="plain">${people.map((p) => item("person", p.id, `${esc(p.name)} <span class="muted">(${esc(poiName(p.at))})</span>`)).join("")}</ul>
    <h2>Places</h2>
    <ul class="plain">${pois.map((p) => item("place", p.id, esc(p.name))).join("")}</ul>
    <h2>Things</h2>
    <ul class="plain">${things.map((t) => item("thing", t.id, `${esc(t.name)} <span class="muted">(${esc(poiName(t.at))})</span>`)).join("")}</ul>
    <h2>Go to</h2>
    <ul class="plain">${hub.exits.map((e) => item("place", e.to, `${esc(poiName(e.to))} <span class="muted">~${e.minutes ?? D.config.placeholders.travelMinutes} min (placeholder)</span>`)).join("")}</ul>
    <h2>Activities</h2>
    <button type="button" disabled class="row">Activities: coming in 1b-i</button>
    <h2>Map</h2>
    <button type="button" disabled class="row">🔒 Map: locked until a later slice</button>
  `);
};

// Placeholder detail for a place (POI or area), a person or a thing.
SCREENS.detail = ({ type, id }) => {
  const g = game();
  const greyed = (list) =>
    list.length ? list.map((a) => `<li><button type="button" disabled class="row">${esc(a)} <span class="small">(coming in 1b-i)</span></button></li>`).join("") : "";
  let body = "";

  if (type === "place") {
    const p = place(id);
    const people = D.places.people.filter((x) => x.at === id);
    const things = D.places.things.filter((x) => x.at === id);
    const link = (t, x) => `<li>${btn(esc(x.name), "detail", `data-type="${t}" data-id="${x.id}" class="row"`)}</li>`;
    body = `<h1>${esc(p.name)}</h1>
      ${p.kind === "area" ? `<p class="muted">Recommended level ${p.recommendedLevel ?? D.config.placeholders.recommendedLevel}</p>` : ""}
      <p>${esc(p.blurb)}</p>
      ${people.length ? `<h2>People</h2><ul class="plain">${people.map((x) => link("person", x)).join("")}</ul>` : ""}
      ${things.length ? `<h2>Things</h2><ul class="plain">${things.map((x) => link("thing", x)).join("")}</ul>` : ""}
      ${p.activities.length ? `<h2>Activities</h2><ul class="plain">${greyed(p.activities)}</ul>` : ""}
      <p class="muted">Details come later.</p>
      ${p.kind === "area" ? `<p class="muted small">Travel comes in a later slice.</p>${btn(`Back to ${esc(place(p.parent).name)}`, "backToHub", 'class="primary"')}` : ""}`;
  } else if (type === "person") {
    const x = D.places.people.find((p) => p.id === id);
    body = `<h1>${esc(x.name)}</h1>
      <p>${esc(x.role.replace(/_/g, " "))}</p>
      <p class="muted">At: ${esc(place(x.at).name)}</p>
      ${x.placeholderName ? `<p class="muted small">(placeholder name)</p>` : ""}
      <p class="muted">Details come later.</p>`;
  } else {
    const x = D.places.things.find((t) => t.id === id);
    body = `<h1>${esc(x.name)}</h1>
      <p>Type: ${esc(x.type)}</p>
      <p class="muted">At: ${esc(place(x.at).name)}</p>
      <p class="muted">Details come later.</p>`;
  }
  return inGame("detail", body, { showBack: true });
};

SCREENS.bag = () => inGame("bag", `<h1>Bag</h1><p class="muted">Placeholder. Your items will show here in a later slice.</p>`);
SCREENS.tree = () => inGame("tree", `<h1>Tree</h1><p class="muted">Placeholder. Comes in a later slice.</p>`);
SCREENS.journal = () => inGame("journal", `<h1>Journal</h1><p class="muted">Placeholder. Comes in a later slice.</p>`, { showBack: true });

SCREENS.me = () => {
  const g = game();
  const left = unspentPoints(D.config, g);
  const attrs = D.attributes.map((a) => {
    const st = g.attributes[a.id];
    const plus = left > 0
      ? btn("+", "addPoint", `data-id="${a.id}" aria-label="Add a point to ${a.name}" ${engine.canAddPoint(D.config, g, a.id) ? "" : "disabled"}`)
      : "";
    return `<li class="attr">
      <div><strong>${esc(a.name)}</strong> <span class="level">${st.level}</span><div class="muted small">${esc(a.drives)}</div></div>
      <div class="pm">${plus}</div>
    </li>`;
  });

  const skillRow = (s) => s.state === "open"
    ? `<li class="skill"><strong>${esc(s.name)}</strong> <span class="level">1</span>
        <div class="muted small">trains in ${esc(s.trainsIn)}${s.unlockNote ? ` · ${esc(s.unlockNote)}` : ""}${s.subskills ? ` · sub-skills: ${esc(s.subskills.join(", "))}` : ""}</div></li>`
    : `<li class="skill locked">🔒 ${esc(s.name)}<div class="muted small">${esc(s.unlockNote)}</div></li>`;

  const groups = D.skills.groups.map((gr) => {
    const inGroup = D.skills.skills.filter((s) => s.group === gr.id);
    let inner;
    if (gr.families) {
      inner = gr.families.map((f) => `<h4>${esc(f)}</h4><ul class="plain">${inGroup.filter((s) => s.family === f).map(skillRow).join("")}</ul>`).join("");
    } else {
      inner = `<ul class="plain">${inGroup.map(skillRow).join("")}</ul>`;
    }
    return `<section class="card"><h3>${esc(gr.name)}</h3>${inner}</section>`;
  });

  return inGame("me", `
    <h1>${esc(g.name)}</h1>
    <h2>Attributes</h2>
    <p>Unspent points: <strong>${left}</strong>${left > 0 ? ` <span class="muted small">(max ${D.config.creation.maxPerAttrFromFree} free points each)</span>` : ""}</p>
    <ul class="list">${attrs.join("")}</ul>
    <h2>Skills</h2>
    ${groups.join("")}
    ${btn("Journal", "toJournal", 'class="row"')}
  `);
};

SCREENS.quests = () => {
  const g = game();
  const acc = g.quests.accepted.map(quest).filter(Boolean);
  const avail = D.quests.filter((q) => !g.quests.accepted.includes(q.id));
  const accRow = (q) => {
    const isActive = q.id === g.quests.active;
    return `<li class="quest ${isActive ? "active" : ""}">
      <button type="button" class="row" data-act="setActive" data-id="${q.id}">
        ${isActive ? "📌 " : ""}<strong>${esc(q.title)}</strong> <span class="muted small">(${HORIZON_LABELS[q.horizon]})${isActive ? " · ACTIVE" : " · tap to make active"}</span>
        <div class="muted small">${esc(q.summary)}</div>
      </button>
      ${q.abandonable ? btn("Abandon", "abandon", `data-id="${q.id}"`) : ""}
    </li>`;
  };
  const availRow = (q) => `<li class="quest">
      <div><strong>${esc(q.title)}</strong> <span class="muted small">(${HORIZON_LABELS[q.horizon]})</span><div class="muted small">${esc(q.summary)}</div></div>
      ${btn("Accept", "accept", `data-id="${q.id}"`)}
    </li>`;
  return inGame("quests", `
    <h1>Quests</h1>
    <h2>Accepted (${acc.length}/${D.config.quests.maxAccepted})</h2>
    ${acc.length ? `<ul class="plain">${acc.map(accRow).join("")}</ul>` : `<p class="muted">None yet.</p>`}
    <h2>Available</h2>
    ${avail.length ? `<ul class="plain">${avail.map(availRow).join("")}</ul>` : `<p class="muted">None.</p>`}
  `, { showBack: true });
};

SCREENS.settings = (params) => {
  const g = game();
  const fromGame = g && params.from !== "title";
  const sizes = D.config.ui.textSizes.map((s) =>
    btn(String(s), "textSize", `data-id="${s}" class="${s === save.settings.textSize ? "current" : ""}"`)
  ).join("");
  const notes = store.readNotes(D.config);
  const notesText = notes.map((n) => `[${n.time}] v${n.version} @${n.screen}: ${n.text}`).join("\n");

  const debug = g ? `<section class="card">
      ${btn(`Debug menu ${open.debug ? "▲" : "▼"}`, "toggleDebug", 'class="card-head"')}
      ${open.debug ? `
        <div class="inline"><label>Day <input type="number" id="dbgDay" min="1" value="${g.day}"></label>
          <label>Time <input type="text" id="dbgTime" value="${g.time}" placeholder="06:00" maxlength="5"></label>
          ${btn("Set", "dbgDayTime")}</div>
        <div class="inline"><label>Hunger <input type="number" id="dbgHunger" min="0" max="${D.config.meters.hungerMax}" value="${g.hunger}"></label>${btn("Set", "dbgHunger")}</div>
        <div class="inline"><label>Energy <input type="number" id="dbgEnergy" min="0" max="${maxEnergy(D.config, g)}" value="${g.energy}"></label>${btn("Set", "dbgEnergy")}</div>
        <div class="inline"><label>XP multiplier <input type="number" id="dbgXp" step="0.1" min="0" value="${g.debug.xpMultiplier}"></label>${btn("Set", "dbgXp")}</div>
        <p class="muted small">XP multiplier is a placeholder: it does nothing yet.</p>
        ${btn("Reset debug values", "dbgReset")}` : ""}
    </section>` : "";

  const body = `
    <h1>Settings</h1>
    <section class="card"><h3>Display</h3>
      <p>Text size</p><div class="inline">${sizes}</div>
      <p>Theme: ${save.settings.theme === "dark" ? "Dark" : "Light"}</p>
      ${btn(save.settings.theme === "dark" ? "Switch to light" : "Switch to dark", "toggleTheme")}
    </section>
    <section class="card"><h3>Save</h3>
      ${btn("Export save code", "export", g ? "" : "disabled")}
      ${open.exported ? `<textarea readonly rows="4" id="exportBox">${esc(open.exported)}</textarea>${btn("Copy code", "copy", 'data-id="exportBox"')}` : ""}
      <label class="field">Import a save code<textarea id="importBox" rows="3" placeholder="PEEPAP1:..."></textarea></label>
      ${btn("Import", "import")}
      ${btn("Reset save", "resetSave", 'class="danger"')}
    </section>
    <section class="card"><h3>Note this</h3>
      <p class="muted small">Write feedback. It is saved with the real time, version and screen.</p>
      <textarea id="noteBox" rows="3"></textarea>
      ${btn("Save note", "saveNote")}
      ${notes.length ? `<p class="small">All notes (${notes.length}):</p><textarea readonly rows="6" id="notesAll">${esc(notesText)}</textarea>${btn("Copy notes", "copy", 'data-id="notesAll"')}` : ""}
    </section>
    ${debug}
    <div class="stack">${fromGame ? btn("‹ Back", "back") : ""}${btn("Back to title", "toTitle")}</div>`;

  if (fromGame) return inGame("settings", body, { showBack: true });
  return `<main class="screen">${flash ? `<p class="flash">${esc(flash)}</p>` : ""}${body}</main>`;
};

// ---------- Actions (what each button does) ----------
// el is the tapped button; el.dataset.id holds its data-id.

const val = (id) => document.getElementById(id).value;
const say = (result) => { flash = result.message; };

const ACTIONS = {
  // Navigation
  toOverview: () => goRoot("overview"),
  toHere: () => go("here"),
  toMe: () => go("me"),
  toQuests: () => go("quests"),
  toJournal: () => go("journal"),
  tab: (el) => goRoot(el.dataset.id),
  back: () => back(),
  backToHub: () => goRoot("here"),
  detail: (el) => go("detail", { type: el.dataset.type, id: el.dataset.id }),
  toTitle: () => goRoot("title"),
  openSettings: () => {
    if (save.screen.name === "settings") return; // already here
    open.exported = "";
    go("settings", { from: IN_GAME.includes(save.screen.name) ? save.screen.name : "title" });
  },
  continue: () => game() && goRoot("overview"),

  // New Game
  newGame: () => {
    if (game() && !confirm("Start a new game? This replaces your current save.")) return;
    draft = { name: "Traveler", freeSpent: {} };
    go("newGame");
  },
  draftPlus: (el) => {
    const c = D.config.creation;
    const used = Object.values(draft.freeSpent).reduce((a, b) => a + b, 0);
    const v = draft.freeSpent[el.dataset.id] || 0;
    if (used < c.freePoints && v < c.maxPerAttrFromFree) draft.freeSpent[el.dataset.id] = v + 1;
  },
  draftMinus: (el) => {
    const v = draft.freeSpent[el.dataset.id] || 0;
    if (v > 0) draft.freeSpent[el.dataset.id] = v - 1;
  },
  confirmNew: () => startGame(),
  finishLater: () => startGame(),

  // Me
  addPoint: (el) => say(engine.addPoint(D.config, game(), el.dataset.id)),

  // Quests
  accept: (el) => {
    const r = engine.acceptQuest(D.config, game(), el.dataset.id);
    say(r);
    if (r.ok) engine.log(game(), `Accepted: ${quest(el.dataset.id).title}`);
  },
  setActive: (el) => say(engine.setActiveQuest(game(), el.dataset.id)),
  abandon: (el) => {
    const r = engine.abandonQuest(game(), quest(el.dataset.id));
    say(r);
    if (r.ok) engine.log(game(), `Abandoned: ${quest(el.dataset.id).title}`);
  },

  // Overview
  toggleLog: () => { open.log = !open.log; },

  // Settings
  textSize: (el) => { save.settings.textSize = Number(el.dataset.id); applySettings(); },
  toggleTheme: () => { save.settings.theme = save.settings.theme === "dark" ? "light" : "dark"; applySettings(); },
  export: () => { open.exported = store.exportCode(save); },
  import: () => {
    const r = store.importCode(D.config, val("importBox"));
    if (!r.ok) return say(r);
    save = r.save;
    applySettings();
    goRoot(game() ? "overview" : "title");
    flash = "Save imported.";
  },
  resetSave: () => {
    if (!confirm("Delete your save? This cannot be undone.")) return;
    const settings = save.settings;
    store.clearSave(D.config);
    save = newSave(D.config);
    save.settings = settings; // keep text size and theme
    goRoot("title");
    flash = "Save deleted.";
  },
  saveNote: () => {
    const text = val("noteBox").trim();
    if (!text) return say({ message: "Write something first." });
    const ok = store.addNote(D.config, {
      time: new Date().toISOString(),
      version: D.config.version,
      screen: save.screen.params.from || "settings",
      text,
    });
    say({ message: ok ? "Note saved." : "Could not save the note (storage unavailable)." });
  },
  copy: (el) => {
    const box = document.getElementById(el.dataset.id);
    box.select();
    const done = () => { flash = "Copied."; render(); };
    if (navigator.clipboard) navigator.clipboard.writeText(box.value).then(done, () => { flash = "Text selected: copy it by hand."; render(); });
    else { try { document.execCommand("copy"); done(); } catch (e) { /* text stays selected */ } }
  },
  toggleDebug: () => { open.debug = !open.debug; },
  dbgDayTime: () => say(engine.debugSetDayTime(game(), val("dbgDay"), val("dbgTime").trim())),
  dbgHunger: () => say(engine.debugSetHunger(D.config, game(), val("dbgHunger"))),
  dbgEnergy: () => say(engine.debugSetEnergy(D.config, game(), val("dbgEnergy"))),
  dbgXp: () => {
    const n = Number(val("dbgXp"));
    game().debug.xpMultiplier = Number.isFinite(n) && n >= 0 ? n : 1;
    say({ message: `XP multiplier set to ${game().debug.xpMultiplier} (does nothing yet).` });
  },
  dbgReset: () => say(engine.debugReset(D.config, game())),
};

function startGame() {
  save.game = newGame(D.config, D.attributes, D.places, draft.name, draft.freeSpent);
  engine.log(save.game, "New game started.");
  draft = null;
  goRoot("overview");
}

// ---------- Rendering and events ----------

function render() {
  let { name, params } = save.screen;
  // Safety: a game screen with no game, or New Game with no draft, falls back to title.
  if ((IN_GAME.includes(name) && !game()) || (name === "newGame" && !draft) || !SCREENS[name]) {
    save.screen = { name: "title", params: {} };
    ({ name, params } = save.screen);
  }
  const warn = storageOk ? "" : `<p class="warn">Storage is unavailable: progress will not be saved.</p>`;
  app.innerHTML = warn + SCREENS[name](params || {});
}

app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const action = ACTIONS[el.dataset.act];
  if (!action) return;
  action(el);
  persist(); // auto-save after every action
  render();
});

// Keep the typed name in the draft without re-drawing (so the cursor stays put).
app.addEventListener("input", (e) => {
  if (e.target.id === "nameInput" && draft) draft.name = e.target.value;
});

// ---------- Start up ----------

async function loadJson(name) {
  const res = await fetch(`data/${name}.json`); // relative path: works under /peepap-rpg/
  if (!res.ok) throw new Error(`Could not load data/${name}.json`);
  return res.json();
}

async function boot() {
  try {
    const names = ["config", "attributes", "skills", "places", "quests", "advice"];
    const loaded = await Promise.all(names.map(loadJson));
    names.forEach((n, i) => (D[n] = loaded[i]));
  } catch (e) {
    app.innerHTML = `<main class="screen"><h1>Peepap</h1><p class="warn">Could not load game data. Open the game through GitHub Pages or a local web server, not as a file.</p></main>`;
    return;
  }
  storageOk = store.storageAvailable();
  save = (storageOk && store.readSave(D.config)) || newSave(D.config);
  applySettings();
  render();
}

boot();
