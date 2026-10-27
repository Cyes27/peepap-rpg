// save.js
// Saving, loading, slots, export and import, notes and tuning overrides.
// Every localStorage call is wrapped in try/catch: if storage is blocked
// (private mode, file://, full) the game still runs.

import { upgradeGameV1, dayTime } from "./state.js";

const EXPORT_PREFIX = "PEEPAP1:";

// Is localStorage usable? We test by writing and removing a key.
export function storageAvailable() {
  try {
    const k = "__peepap_test__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

// Upgrade an old save to the current saveVersion, one step at a time.
// Throws an Error with a readable message if the save cannot be used.
export function migrate(save, W, now = Date.now()) {
  if (!save || typeof save !== "object" || typeof save.saveVersion !== "number") {
    throw new Error("This is not a Peepap save.");
  }
  const v = save.saveVersion;
  if (!Number.isInteger(v) || v < 1 || v > W.config.saveVersion) {
    throw new Error(`This save is version ${v}; this game reads versions 1 to ${W.config.saveVersion}.`);
  }
  if (save.saveVersion === 1) {
    // Slice 1a -> 1b-i: inventory, storage, built, shelter, research, XP, time.
    if (save.game) save.game = upgradeGameV1(save.game, W, now);
    save.saveVersion = 2;
  }
  if (!save.settings) save.settings = { textSize: W.config.ui.defaultTextSize, theme: W.config.ui.defaultTheme };
  if (!save.screen) save.screen = { name: "title", params: {} };
  return save;
}

// Read a save from a key. Returns { ok: true, save } (save is null when
// the key is empty) or { ok: false, message }.
export function readKey(W, key) {
  let text;
  try {
    text = localStorage.getItem(key);
  } catch (e) {
    return { ok: false, message: "Storage is unavailable." };
  }
  if (!text) return { ok: true, save: null };
  try {
    return { ok: true, save: migrate(JSON.parse(text), W) };
  } catch (e) {
    return { ok: false, message: e instanceof SyntaxError ? "The save is damaged." : e.message };
  }
}

// Write a save. Returns false if storage is full or unavailable.
export function writeKey(key, save) {
  try {
    localStorage.setItem(key, JSON.stringify(save));
    return true;
  } catch (e) {
    return false;
  }
}

export function clearKey(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    /* nothing to do */
  }
}

// One line for the Save / Load list: name, Day and time, version, real date.
export function slotSummary(W, key) {
  const r = readKey(W, key);
  if (!r.ok) return { empty: false, error: r.message };
  if (!r.save || !r.save.game) return { empty: true };
  const g = r.save.game;
  return {
    empty: false,
    name: g.name,
    when: dayTime(W.config, g),
    version: r.save.gameVersion || "0.1.0",
    savedAt: r.save.savedAt ? new Date(r.save.savedAt).toLocaleString() : "unknown date",
  };
}

// ----- Export / import -----
// TextEncoder/Decoder make names with accents or emoji survive base64.

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(code) {
  const bin = atob(code);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function exportCode(save) {
  return EXPORT_PREFIX + toBase64(JSON.stringify(save));
}

// Accepts saveVersion 1 or 2 (1 is upgraded). Returns { ok, save } or { ok: false, message }.
export function importCode(W, code) {
  code = (code || "").trim();
  if (!code.startsWith(EXPORT_PREFIX)) {
    return { ok: false, message: "Not a Peepap save code (it must start with PEEPAP1:)." };
  }
  let save;
  try {
    save = JSON.parse(fromBase64(code.slice(EXPORT_PREFIX.length)));
  } catch (e) {
    return { ok: false, message: "The save code is damaged or incomplete." };
  }
  if (!save || !("game" in save)) return { ok: false, message: "The save code is missing parts." };
  try {
    return { ok: true, save: migrate(save, W) };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ----- Small JSON values (notes, tuning, events) -----

export function readJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

// ----- Feedback notes ("note this") -----

export function readNotes(config) {
  return readJson(config.notesKey, []);
}

export function addNote(config, note) {
  const notes = readNotes(config);
  notes.push(note);
  return writeJson(config.notesKey, notes);
}
