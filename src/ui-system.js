// ui-system.js
// Screens outside the game world: Title, New Game, Settings, Save / Load,
// Metrics report, Tuning panel and the Debug menu.

import { newSave, newGame, maxEnergy, dayTime } from "./state.js";
import * as engine from "./engine.js";
import * as store from "./save.js";
import { computeReport, reportText } from "./metrics.js";
import { TUNING_FIELDS, fieldRange, defaultValue, validate } from "./tuning.js";
import { App, esc, btn, game, cfg, go, goRoot, back, applySettings, run, logEvents, setOverrides } from "./app.js";
import { inGame } from "./ui-game.js";

const IN_GAME = ["overview", "here", "detail", "bag", "storage", "rest", "restConfirm", "me", "tree", "quests", "journal"];

// Where a system screen was opened from: an in-game screen name, or "title".
function fromWhere() {
  const s = App.save.screen;
  if (!game()) return "title";
  if (IN_GAME.includes(s.name)) return s.name;
  return (s.params && s.params.from) || "title";
}

// A system screen: inside the game frame when a game is running, else plain.
function frame(name, body, params = {}) {
  if (game() && params.from !== "title") return inGame(name, body, { showBack: true });
  return `<main class="screen">${App.flash ? `<p class="flash">${esc(App.flash)}</p>` : ""}${body}
    <div class="stack">${btn("‹ Back", "back")}</div></main>`;
}

export const SCREENS = {};

SCREENS.title = () => `<main class="screen title">
  <h1>Peepap</h1>
  <p class="subtitle">The RPG</p>
  ${App.flash ? `<p class="flash">${esc(App.flash)}</p>` : ""}
  <div class="stack">
    ${btn("New Game", "newGame", 'class="primary"')}
    <div class="pair">
      ${btn("Continue", "continue", game() ? "" : "disabled")}
      ${btn("Load", "toSaveLoad")}
    </div>
    ${btn("Settings", "openSettings")}
  </div>
  <p class="muted small">Version ${esc(cfg().version)}</p>
</main>`;

SCREENS.newGame = () => {
  const c = cfg().creation;
  const draft = App.draft;
  const used = Object.values(draft.freeSpent).reduce((a, b) => a + b, 0);
  const left = c.freePoints - used;
  const rows = App.W.attributes.map((a) => {
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

SCREENS.settings = (params) => {
  const g = game();
  const sizes = cfg().ui.textSizes.map((s) =>
    btn(String(s), "textSize", `data-id="${s}" class="${s === App.save.settings.textSize ? "current" : ""}"`)
  ).join("");
  const notes = store.readNotes(cfg());
  const notesText = notes.map((n) => `[${n.time}] v${n.version} @${n.screen}: ${n.text}`).join("\n");
  const from = params.from || "title";

  const body = `
    <h1>Settings</h1>
    <section class="card"><h3>Display</h3>
      <p>Text size</p><div class="inline">${sizes}</div>
      <p>Theme: ${App.save.settings.theme === "dark" ? "Dark" : "Light"}</p>
      ${btn(App.save.settings.theme === "dark" ? "Switch to light" : "Switch to dark", "toggleTheme")}
    </section>
    <section class="card"><h3>Save</h3>
      ${btn("Save / Load", "toSaveLoad", 'class="row"')}
      ${btn("Export save code", "export", g ? "" : "disabled")}
      ${App.open.exported ? `<textarea readonly rows="4" id="exportBox">${esc(App.open.exported)}</textarea>${btn("Copy code", "copy", 'data-id="exportBox"')}` : ""}
      <label class="field">Import a save code<textarea id="importBox" rows="3" placeholder="PEEPAP1:..."></textarea></label>
      ${btn("Import", "import")}
      ${btn("Reset save", "resetSave", 'class="danger"')}
    </section>
    <section class="card"><h3>Playtest</h3>
      ${btn("Metrics report", "toMetrics", 'class="row"')}
      ${btn("Tuning panel (debug)", "toTuning", 'class="row"')}
    </section>
    <section class="card"><h3>Note this</h3>
      <p class="muted small">Write feedback. It is saved with the real time, version and screen.</p>
      <textarea id="noteBox" rows="3"></textarea>
      ${btn("Save note", "saveNote")}
      ${notes.length ? `<p class="small">All notes (${notes.length}):</p><textarea readonly rows="6" id="notesAll">${esc(notesText)}</textarea>${btn("Copy notes", "copy", 'data-id="notesAll"')}` : ""}
    </section>
    ${g ? debugMenu(g) : ""}
    <div class="stack">${btn("Back to title", "toTitle")}</div>`;
  return frame("settings", body, { from });
};

function debugMenu(g) {
  const items = App.W.items.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join("");
  return `<section class="card">
    ${btn(`Debug menu ${App.open.debug ? "▲" : "▼"}`, "toggleDebug", 'class="card-head"')}
    ${App.open.debug ? `
      <p class="muted small">Debug actions are left out of the metrics and do not trigger passing out.</p>
      ${btn("Skip to next 06:00", "dbgSkip", 'class="row"')}
      <div class="inline"><label>Day <input type="number" id="dbgDay" min="1" value="${dayTime(cfg(), g).match(/\d+/)[0]}"></label>
        <label>Time <input type="text" id="dbgTime" value="${dayTime(cfg(), g).slice(-5)}" placeholder="06:00" maxlength="5"></label>
        ${btn("Set", "dbgDayTime")}</div>
      <div class="inline"><label>Hunger <input type="number" id="dbgHunger" min="0" max="${cfg().meters.hungerMax}" step="any" value="${g.hunger}"></label>${btn("Set", "dbgHunger")}</div>
      <div class="inline"><label>Energy <input type="number" id="dbgEnergy" min="0" max="${maxEnergy(cfg(), g)}" step="any" value="${g.energy}"></label>${btn("Set", "dbgEnergy")}</div>
      <div class="inline"><label>Item <select id="dbgItem">${items}</select></label>
        <label>Qty <input type="number" id="dbgQty" min="1" value="1"></label>${btn("Grant", "dbgGrant")}</div>
      <div class="inline"><label>XP multiplier (1-20) <input type="number" id="dbgXp" step="0.1" min="1" max="20" value="${g.debug.xpMultiplier}"></label>${btn("Set", "dbgXp")}</div>
      ${btn("Reset debug values", "dbgReset")}` : ""}
  </section>`;
}

SCREENS.saveload = (params) => {
  const W = App.W;
  const line = (label, key, isAuto) => {
    const s = store.slotSummary(W, key);
    const info = s.error
      ? `<span class="warnline small">${esc(s.error)}</span>`
      : s.empty
        ? `<span class="muted small">Empty</span>`
        : `<div><strong>${esc(s.name)}</strong> · ${esc(s.when)}</div><div class="muted small">v${esc(s.version)} · saved ${esc(s.savedAt)}</div>`;
    const buttons = [];
    if (!isAuto) buttons.push(btn("Save here", "slotSave", `data-id="${key}" ${game() ? "" : "disabled"}`));
    buttons.push(btn("Load", "slotLoad", `data-id="${key}" ${s.empty || s.error ? "disabled" : ""}`));
    if (!isAuto) buttons.push(btn("Clear slot", "slotClear", `data-id="${key}" class="danger" ${s.empty ? "disabled" : ""}`));
    return `<li class="slot"><h3>${label}</h3>${info}<div class="inline">${buttons.join("")}</div></li>`;
  };
  return frame("saveload", `
    <h1>Save / Load</h1>
    <ul class="plain">
      ${line("Autosave", W.config.saveKey, true)}
      ${W.config.slotKeys.map((k, i) => line(`Slot ${i + 1}`, k, false)).join("")}
    </ul>
  `, params);
};

SCREENS.metrics = (params) => {
  const report = computeReport(App.events, App.W);
  const h = report.header;
  const rows = report.rows.map((r) => `<li class="metric ${r.status.replace(" ", "-").toLowerCase()}">
      <div><strong>${r.id}</strong> <span class="status">${r.status}</span> <span class="muted small">${esc(r.name)}</span></div>
      <div class="small">Measured: ${esc(r.measured)}</div>
      <div class="muted small">Model: ${esc(r.model)} · Band: ${esc(r.band)}</div>
    </li>`).join("");
  return frame("metrics", `
    <h1>Metrics report</h1>
    <dl>
      <dt>Version</dt><dd>${esc(h.version)}</dd>
      <dt>Tuning set</dt><dd>${esc(h.tuningSetId)}${h.tuned ? ` <span class="warnline">TUNED</span>` : ""}</dd>
      <dt>Sessions</dt><dd>${h.sessions}</dd>
      <dt>Active play</dt><dd>${Math.round(h.activeMinutes * 10) / 10} real min</dd>
      <dt>Game days</dt><dd>${Math.round(h.gameDays * 100) / 100}</dd>
    </dl>
    <p class="muted small">Local only. Debug actions are left out. Bands are hypotheses. NO DATA = fewer than ${cfg().metrics.minSamples} samples.</p>
    <ul class="plain">${rows}</ul>
    ${btn("Copy report", "copyReport", 'class="primary"')}
    ${App.open.report ? `<textarea readonly rows="10" id="reportBox">${esc(App.open.report)}</textarea>` : ""}
    ${btn("Reset metrics", "resetMetrics", 'class="danger"')}
  `, params);
};

SCREENS.tuning = (params) => {
  const D = App.D;
  const rows = TUNING_FIELDS.map((f) => {
    const { min, max } = fieldRange(D, f);
    const cur = f.key in App.overrides ? App.overrides[f.key] : defaultValue(D, f);
    const changed = f.key in App.overrides;
    return `<li class="tune${changed ? " changed" : ""}">
      <label>${esc(f.key)} <span class="muted small">${min}-${max}${f.note ? ` · ${f.note}` : ""}${changed ? ` · default ${defaultValue(D, f)}` : ""}</span>
        <input type="number" step="any" data-key="${f.key}" value="${cur}"></label>
    </li>`;
  }).join("");
  return frame("tuning", `
    <h1>Tuning panel</h1>
    <p>Tuning set: <strong>${esc(App.W.tuningSetId)}</strong></p>
    <p class="muted small">Debug. Values outside the range are rejected. Ground rest stays at 8 h to full. Changing anything marks sessions as "tuned" in the metrics.</p>
    <ul class="plain">${rows}</ul>
    <div class="stack">
      ${btn("Apply", "tuningApply", 'class="primary"')}
      ${btn("Reset to defaults", "tuningReset")}
      ${btn("Copy tuning set", "tuningCopy")}
    </div>
    ${App.open.tuningText ? `<textarea readonly rows="6" id="tuningBox">${esc(App.open.tuningText)}</textarea>` : ""}
  `, params);
};

// ---------- Actions ----------

const val = (id) => document.getElementById(id).value;
const say = (message) => { App.flash = message; };

// Copy the text of a textarea to the clipboard.
function copyBox(id) {
  const box = document.getElementById(id);
  if (!box) return;
  box.select();
  const done = () => { App.flash = "Copied."; App.render(); };
  if (navigator.clipboard) navigator.clipboard.writeText(box.value).then(done, () => { App.flash = "Text selected: copy it by hand."; App.render(); });
  else { try { document.execCommand("copy"); done(); } catch (e) { /* text stays selected */ } }
}

// Show the copy text box, then copy it once it is on screen.
function showAndCopy(key, text, boxId) {
  App.open[key] = text;
  App.render();
  copyBox(boxId);
}

// After loading a save from a slot or an import.
function loaded(newSaveObj, how) {
  const settings = App.save.settings;
  App.save = newSaveObj;
  App.save.settings = settings; // keep this device's text size and theme
  if (App.save.game) App.save.game.seg = Date.now(); // new metrics segment (game time can go backwards)
  applySettings();
  goRoot(App.save.game ? "overview" : "title");
  logEvents([{ type: "load", how }]);
}

function startGame() {
  App.save.game = newGame(App.W, App.draft.name, App.draft.freeSpent, Date.now());
  engine.log(App.W, App.save.game, "New game started.");
  App.draft = null;
  goRoot("overview");
}

export const ACTIONS = {
  back: () => back(game() ? "overview" : "title"),
  toTitle: () => goRoot("title"),
  openSettings: () => {
    if (App.save.screen.name === "settings") return; // already here
    App.open.exported = "";
    go("settings", { from: fromWhere() });
  },
  continue: () => game() && goRoot("overview"),
  toSaveLoad: () => go("saveload", { from: fromWhere() }),
  toMetrics: () => { App.open.report = ""; go("metrics", { from: fromWhere() }); },
  toTuning: () => { App.open.tuningText = ""; go("tuning", { from: fromWhere() }); },

  // New Game
  newGame: () => {
    if (game() && !confirm("Start a new game? This replaces your current autosave.")) return;
    App.draft = { name: "Traveler", freeSpent: {} };
    go("newGame");
  },
  draftPlus: (el) => {
    const c = cfg().creation;
    const f = App.draft.freeSpent;
    const used = Object.values(f).reduce((a, b) => a + b, 0);
    const v = f[el.dataset.id] || 0;
    if (used < c.freePoints && v < c.maxPerAttrFromFree) f[el.dataset.id] = v + 1;
  },
  draftMinus: (el) => {
    const v = App.draft.freeSpent[el.dataset.id] || 0;
    if (v > 0) App.draft.freeSpent[el.dataset.id] = v - 1;
  },
  confirmNew: () => startGame(),
  finishLater: () => startGame(),

  // Settings
  textSize: (el) => { App.save.settings.textSize = Number(el.dataset.id); applySettings(); },
  toggleTheme: () => { App.save.settings.theme = App.save.settings.theme === "dark" ? "light" : "dark"; applySettings(); },
  export: () => {
    App.open.exported = store.exportCode(App.save);
    logEvents([{ type: "save", how: "export" }]);
  },
  import: () => {
    const r = store.importCode(App.W, val("importBox"));
    if (!r.ok) return say(r.message);
    loaded(r.save, "import");
    say("Save imported.");
  },
  resetSave: () => {
    if (!confirm("Delete your autosave? This cannot be undone. (Slots are kept.)")) return;
    const settings = App.save.settings;
    store.clearKey(cfg().saveKey);
    App.save = newSave(cfg());
    App.save.settings = settings; // keep text size and theme
    goRoot("title");
    say("Save deleted.");
  },
  saveNote: () => {
    const text = val("noteBox").trim();
    if (!text) return say("Write something first.");
    const ok = store.addNote(cfg(), {
      time: new Date().toISOString(),
      version: cfg().version,
      screen: App.save.screen.params.from || "settings",
      text,
    });
    logEvents([{ type: "note", text }]);
    say(ok ? "Note saved." : "Could not save the note (storage unavailable).");
  },
  copy: (el) => copyBox(el.dataset.id),

  // Save / Load slots
  slotSave: (el) => {
    const key = el.dataset.id;
    const s = store.slotSummary(App.W, key);
    if (!s.empty && !confirm("Overwrite this slot?")) return;
    const copy = { ...App.save, savedAt: new Date().toISOString(), gameVersion: cfg().version };
    const ok = store.writeKey(key, copy);
    if (ok) logEvents([{ type: "save", how: "manual" }]);
    say(ok ? "Saved." : "Could not save: storage is full or unavailable.");
  },
  slotLoad: (el) => {
    if (!confirm("Load this save? Unsaved progress since your last save in a slot will be replaced.")) return;
    const r = store.readKey(App.W, el.dataset.id);
    if (!r.ok || !r.save) return say(r.message || "That slot is empty.");
    loaded(r.save, el.dataset.id === cfg().saveKey ? "autosave" : "slot");
    say("Loaded.");
  },
  slotClear: (el) => {
    if (!confirm("Clear this slot? This cannot be undone.")) return;
    store.clearKey(el.dataset.id);
    say("Slot cleared.");
  },

  // Metrics
  copyReport: () => showAndCopy("report", reportText(computeReport(App.events, App.W)), "reportBox"),
  resetMetrics: () => {
    if (!confirm("Delete all recorded metrics events? This cannot be undone.")) return;
    App.events = [];
    logEvents([{ type: "session", state: "start" }]); // keep the current session going
    say("Metrics reset.");
  },

  // Tuning
  tuningApply: () => {
    const next = {};
    const errors = [];
    for (const input of document.querySelectorAll("input[data-key]")) {
      const key = input.dataset.key;
      const field = TUNING_FIELDS.find((f) => f.key === key);
      const v = validate(App.D, key, input.value);
      if (!v.ok) { errors.push(v.message); continue; }
      if (v.value !== defaultValue(App.D, field)) next[key] = v.value;
    }
    if (errors.length) return say(`Rejected: ${errors.join(" ")}`);
    setOverrides(next);
    store.writeJson(cfg().tuningKey, next);
    say(`Tuning set ${App.W.tuningSetId}.`);
  },
  tuningReset: () => {
    setOverrides({});
    store.writeJson(cfg().tuningKey, {});
    say("Tuning reset to defaults.");
  },
  tuningCopy: () => showAndCopy("tuningText", JSON.stringify({ tuningSetId: App.W.tuningSetId, overrides: App.overrides }, null, 1), "tuningBox"),

  // Debug (ui.js marks these taps and events as debug)
  toggleDebug: () => { App.open.debug = !App.open.debug; },
  dbgSkip: () => run(engine.debugSkipTo0600(game(), App.W)),
  dbgDayTime: () => run(engine.debugSetDayTime(game(), App.W, val("dbgDay"), val("dbgTime").trim())),
  dbgHunger: () => run(engine.debugSetHunger(game(), App.W, val("dbgHunger"))),
  dbgEnergy: () => run(engine.debugSetEnergy(game(), App.W, val("dbgEnergy"))),
  dbgGrant: () => run(engine.debugGrant(game(), App.W, val("dbgItem"), val("dbgQty"))),
  dbgXp: () => run(engine.debugSetXpMultiplier(game(), val("dbgXp"))),
  dbgReset: () => run(engine.debugReset(game(), App.W)),
};
