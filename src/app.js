// app.js
// Shared UI state and helpers used by ui.js, ui-game.js and ui-system.js.
// This is the only place that keeps the save and the event log in memory.

import { dayOf, placeDef, itemDef } from "./state.js";
import { buildWorld } from "./tuning.js";
import * as store from "./save.js";

export const App = {
  D: {}, // raw data from data/*.json
  W: null, // world = data + tuning overrides (what the engine uses)
  save: null, // the whole save object (see state.js newSave)
  storageOk: true,
  writeFailed: false, // last save write failed (storage full?)
  saveRejected: false, // the autosave could not be read: do not overwrite it
  navStack: [], // previous screens, for the Back button (not saved)
  flash: "", // one-line message shown at the top of the screen
  draft: null, // New Game screen in progress: { name, freeSpent }
  open: { log: false, debug: false, exported: "", nodes: {}, report: "", tuningText: "" }, // UI-only toggles
  overrides: {}, // tuning overrides
  events: [], // playtest event log (peepap_events)
  sid: 0, // current session id
  tapProductive: false, // set by commands during a tap
  inDebug: false, // true while a debug action runs
  render: () => {}, // set by ui.js
};

// ---------- Small helpers ----------

// Escape text before putting it into HTML (names and notes are typed by the player).
export function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function btn(label, act, extra = "") {
  return `<button type="button" data-act="${act}" ${extra}>${label}</button>`;
}

// A button for a game command. When the check says no, it stays visible,
// greyed, with the reason in small text. It is still tappable so the
// refusal is shown and logged (and the metrics see the tap).
export function cmdBtn(label, act, id, check, sub = "") {
  const blocked = !check.ok;
  return `<button type="button" class="row cmd${blocked ? " blocked" : ""}" data-act="${act}" data-id="${esc(id)}"${blocked ? ' aria-disabled="true"' : ""}>
    ${label}${sub ? ` <span class="muted small">${sub}</span>` : ""}
    ${blocked ? `<span class="reason small">${esc(check.message || "")}</span>` : ""}
  </button>`;
}

export const game = () => App.save.game;
export const place = (id) => placeDef(App.W, id);
export const item = (id) => itemDef(App.W, id);
export const cfg = () => App.W.config;
export const r0 = (n) => Math.round(n); // meters are shown as whole numbers

// ---------- Navigation ----------

// Go to a screen. push=true remembers where we came from (for Back).
export function go(name, params = {}, push = true) {
  if (push && App.save.screen) App.navStack.push(App.save.screen);
  if (App.navStack.length > 30) App.navStack.shift();
  App.save.screen = { name, params };
  App.flash = "";
  window.scrollTo(0, 0);
}

// Go to a screen and forget the Back history (used by tabs and Overview).
export function goRoot(name, params = {}) {
  App.navStack = [];
  go(name, params, false);
}

export function back(fallback = "overview") {
  const prev = App.navStack.pop();
  if (prev) {
    App.save.screen = prev;
    App.flash = "";
    window.scrollTo(0, 0);
  } else {
    goRoot(fallback);
  }
}

export function applySettings() {
  document.documentElement.style.fontSize = App.save.settings.textSize + "px";
  document.documentElement.dataset.theme = App.save.settings.theme;
}

// ---------- Tuning ----------

export function setOverrides(overrides) {
  App.overrides = overrides;
  App.W = buildWorld(App.D, overrides);
}

// ---------- Commands and events ----------

// Apply an engine result: keep the new state, show messages, log events.
//   productive - true for gather, craft, build, research, cook, eat, rest
export function run(r, productive = false) {
  if (App.save.game) App.save.game = r.state;
  if (r.messages.length) App.flash = r.messages.join(" ");
  logEvents(r.events);
  if (r.ok && productive) App.tapProductive = true;
  return r;
}

// Stamp events with real time, game time, version, session etc. and keep them.
export function logEvents(list) {
  const g = App.save && App.save.game;
  const W = App.W;
  for (const e of list) {
    const now = Date.now();
    if (e.type === "levelUp" && g) {
      // Real ms since the previous level-up of the same skill/attribute.
      const key = `${e.kind}:${e.id}`;
      e.sinceMs = now - ((g.levelMs && g.levelMs[key]) || g.gid || now);
      if (g.levelMs) g.levelMs[key] = now;
    }
    const stamped = {
      realMs: now,
      gameDay: g ? dayOf(W.config, g.minutes) : 0,
      gameMinute: g ? g.minutes : 0,
      version: W.config.version,
      tuningSetId: W.tuningSetId,
      sid: App.sid,
      seg: g ? g.seg : null,
      gid: g ? g.gid : null,
      hg: g ? g.hunger : null,
      en: g ? g.energy : null,
      hd: g && g.stats ? g.stats.hungerDrained : null,
      ...e,
    };
    if (W.tuningSetId !== "default" || (g && g.debug && g.debug.xpMultiplier !== 1)) stamped.tuned = true;
    if (App.inDebug || e.type === "debug") stamped.debug = true;
    App.events.push(stamped);
  }
  const max = W.config.metrics.maxEvents;
  if (App.events.length > max) App.events.splice(0, App.events.length - max);
  return App.events[App.events.length - 1];
}

export function flushEvents() {
  if (App.storageOk) store.writeJson(App.W.config.eventsKey, App.events);
}

// Autosave (stamped with the real date and game version).
export function persist() {
  if (!App.storageOk) return;
  if (App.saveRejected && !App.save.game) return; // keep the unreadable save until a new game
  App.save.savedAt = new Date().toISOString();
  App.save.gameVersion = App.W.config.version;
  App.writeFailed = !store.writeKey(App.W.config.saveKey, App.save);
  if (!App.writeFailed) App.saveRejected = false;
}
