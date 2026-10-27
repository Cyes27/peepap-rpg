// save.js
// Saving, loading, export and import. Every localStorage call is wrapped
// in try/catch: if storage is blocked (private mode, file://, etc.) the
// game still runs, it just cannot remember anything.

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

export function readSave(config) {
  try {
    const text = localStorage.getItem(config.saveKey);
    if (!text) return null;
    return migrate(JSON.parse(text), config);
  } catch (e) {
    return null; // missing, blocked or broken: start fresh
  }
}

export function writeSave(config, save) {
  try {
    localStorage.setItem(config.saveKey, JSON.stringify(save));
    return true;
  } catch (e) {
    return false;
  }
}

export function clearSave(config) {
  try {
    localStorage.removeItem(config.saveKey);
  } catch (e) {
    /* nothing to do */
  }
}

// Migration stub. When saveVersion goes up, old saves get upgraded here,
// one step at a time, e.g. if (save.saveVersion === 1) { ...; save.saveVersion = 2; }
export function migrate(save, config) {
  if (!save || typeof save !== "object") throw new Error("Not a save.");
  if (save.saveVersion > config.saveVersion) throw new Error("Save is from a newer version.");
  return save;
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

// Returns { ok: true, save } or { ok: false, message }.
export function importCode(config, code) {
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
  if (!save || typeof save.saveVersion !== "number") {
    return { ok: false, message: "The save code has no save version." };
  }
  if (save.saveVersion > config.saveVersion) {
    return { ok: false, message: `This save is version ${save.saveVersion}; this game reads up to ${config.saveVersion}.` };
  }
  if (!save.settings || !("game" in save)) {
    return { ok: false, message: "The save code is missing parts." };
  }
  try {
    return { ok: true, save: migrate(save, config) };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ----- Feedback notes ("note this") -----

export function readNotes(config) {
  try {
    return JSON.parse(localStorage.getItem(config.notesKey)) || [];
  } catch (e) {
    return [];
  }
}

export function addNote(config, note) {
  const notes = readNotes(config);
  notes.push(note);
  try {
    localStorage.setItem(config.notesKey, JSON.stringify(notes));
    return true;
  } catch (e) {
    return false;
  }
}
