// ui.js
// Entry point. Loads the data, restores the save, draws the current screen
// and handles taps. The screens live in ui-game.js and ui-system.js; shared
// state and helpers in app.js.
//
// How it works:
//   1. Each screen is a function that returns an HTML string.
//   2. render() puts that HTML into <div id="app">.
//   3. Buttons carry data-act="someAction" (and maybe data-id="...").
//      One click listener looks up ACTIONS[someAction] and runs it.
//   4. After every tap we autosave, store the metrics events and render again.

import { newSave } from "./state.js";
import * as store from "./save.js";
import { App, setOverrides, persist, flushEvents, logEvents, applySettings } from "./app.js";
import * as gameUi from "./ui-game.js";
import * as systemUi from "./ui-system.js";

const SCREENS = { ...gameUi.SCREENS, ...systemUi.SCREENS };
const ACTIONS = { ...gameUi.ACTIONS, ...systemUi.ACTIONS };
const IN_GAME = ["overview", "here", "detail", "bag", "storage", "rest", "restConfirm", "me", "tree", "quests", "journal"];

const app = document.getElementById("app");

// ---------- Rendering and events ----------

function render() {
  let { name, params } = App.save.screen;
  // Safety: a game screen with no game, or New Game with no draft, falls back to title.
  if ((IN_GAME.includes(name) && !App.save.game) || (name === "newGame" && !App.draft) || !SCREENS[name]) {
    App.save.screen = { name: "title", params: {} };
    ({ name, params } = App.save.screen);
  }
  let warn = "";
  if (!App.storageOk) warn = `<p class="warn">Storage is unavailable: progress will not be saved.</p>`;
  else if (App.writeFailed) warn = `<p class="warn">Storage is full: the last save failed. The game keeps running.</p>`;
  app.innerHTML = warn + SCREENS[name](params || {});
}
App.render = render;

app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const action = ACTIONS[el.dataset.act];
  if (!action) return;

  // Record the tap for the metrics. "productive" is set by the command.
  const isDebug = el.dataset.act.startsWith("dbg");
  const tap = logEvents([{
    type: "tap",
    screen: App.save.screen.name,
    controlId: el.dataset.act + (el.dataset.id ? `:${el.dataset.id}` : ""),
    disabled: el.getAttribute("aria-disabled") === "true",
    productive: false,
  }]);
  if (isDebug) tap.debug = true;

  App.tapProductive = false;
  App.inDebug = isDebug;
  try {
    action(el);
  } finally {
    App.inDebug = false;
  }
  tap.productive = App.tapProductive;

  persist(); // autosave after every tap
  flushEvents();
  render();
});

// Keep the typed name in the draft without re-drawing (so the cursor stays put).
app.addEventListener("input", (e) => {
  if (e.target.id === "nameInput" && App.draft) App.draft.name = e.target.value;
});

// Sessions: a session starts when the page is visible and ends when hidden.
document.addEventListener("visibilitychange", () => {
  if (!App.save) return;
  if (document.visibilityState === "hidden") {
    logEvents([{ type: "session", state: "end" }]);
    persist();
    if (App.save.game) logEvents([{ type: "save", how: "auto" }]);
    flushEvents();
  } else {
    App.sid = Date.now();
    logEvents([{ type: "session", state: "start" }]);
    flushEvents();
  }
});

// ---------- Start up ----------

const DATA = ["config", "attributes", "skills", "places", "quests", "advice", "items", "actions", "nodes", "recipes", "typeLabels", "metrics"];

async function loadJson(name) {
  const res = await fetch(`data/${name}.json`); // relative path: works under /peepap-rpg/
  if (!res.ok) throw new Error(`Could not load data/${name}.json`);
  return res.json();
}

async function boot() {
  try {
    const loaded = await Promise.all(DATA.map(loadJson));
    DATA.forEach((n, i) => (App.D[n] = loaded[i]));
  } catch (e) {
    app.innerHTML = `<main class="screen"><h1>Peepap</h1><p class="warn">Could not load game data. Open the game through GitHub Pages or a local web server, not as a file.</p></main>`;
    return;
  }
  const base = App.D.config;
  App.storageOk = store.storageAvailable();
  setOverrides(App.storageOk ? store.readJson(base.tuningKey, {}) : {});
  App.events = App.storageOk ? store.readJson(base.eventsKey, []) : [];

  let message = "";
  App.save = null;
  if (App.storageOk) {
    const r = store.readKey(App.W, base.saveKey);
    if (r.ok) App.save = r.save;
    else {
      App.saveRejected = true;
      message = `Your save could not be loaded: ${r.message}`;
    }
  }
  if (!App.save) App.save = newSave(base);
  App.flash = message;

  App.sid = Date.now();
  logEvents([{ type: "session", state: "start" }]);
  flushEvents();
  applySettings();
  render();
}

boot();
