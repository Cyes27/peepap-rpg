// tuning.js
// Builds the "world" object the engine uses, and handles the debug
// Tuning panel: a few config numbers that can be changed in the game
// (saved in localStorage under peepap_tuning) without editing JSON.
// Pure logic, no DOM.

import { getPath, setPath } from "./state.js";

// Fields the Tuning panel may change, with their allowed ranges.
// Item hunger values ("items.<id>.hunger") may go from half to double
// of the value in items.json; start.energy from 20 up to the highest
// possible max Energy at character creation.
export const TUNING_FIELDS = [
  { key: "energy.baseActionCost", min: 2, max: 6 },
  { key: "energy.toolCost.stone", min: 1.5, max: 5 },
  { key: "energy.travelCost", min: 0, max: 3 },
  { key: "rest.hoursToFull.tent", min: 2, max: 8 },
  { key: "rest.hoursToFull.lean_to", min: 2, max: 8 },
  { key: "rest.hoursToFull.house_bed", min: 2, max: 8 },
  { key: "hunger.perHourAwake", min: 2, max: 6 },
  { key: "hunger.restFactor", min: 0.25, max: 1 },
  { key: "advice.hungryBelow", min: 20, max: 80 },
  { key: "xp.skillBase", min: 20, max: 80 },
  { key: "xp.attrBase", min: 15, max: 60 },
  { key: "xp.skillPerTaskLevel", min: 5, max: 20 },
  { key: "xp.attrPerTaskLevel", min: 1, max: 6 },
  { key: "start.energy", min: 20, max: "maxStartEnergy", note: "New Game only" },
  { key: "start.hunger", min: 20, max: 100, note: "New Game only" },
  { key: "items.berries.hunger", food: "berries" },
  { key: "items.wild_roots.hunger", food: "wild_roots" },
  { key: "items.roast_roots.hunger", food: "roast_roots" },
];

// Default value of a field (from the untouched data files).
export function defaultValue(D, field) {
  if (field.food) return D.items.find((i) => i.id === field.food).hunger;
  return getPath(D.config, field.key);
}

// { min, max } for a field.
export function fieldRange(D, field) {
  if (field.food) {
    const base = defaultValue(D, field);
    return { min: base / 2, max: base * 2 };
  }
  if (field.max === "maxStartEnergy") {
    const m = D.config.meters;
    return { min: field.min, max: m.energyBase + m.energyPerVit * D.config.creation.maxPerAttrFromFree };
  }
  return { min: field.min, max: field.max };
}

// Check one value. Returns { ok, message }.
export function validate(D, key, value) {
  const field = TUNING_FIELDS.find((f) => f.key === key);
  if (!field) return { ok: false, message: `${key} cannot be tuned.` };
  const n = Number(value);
  const { min, max } = fieldRange(D, field);
  if (String(value).trim() === "" || !Number.isFinite(n) || n < min || n > max) {
    return { ok: false, message: `${key} must be between ${min} and ${max}.` };
  }
  return { ok: true, value: n };
}

// A short id for a set of overrides: "default" when there are none.
export function tuningSetId(overrides) {
  const keys = Object.keys(overrides || {}).sort();
  if (!keys.length) return "default";
  const text = keys.map((k) => `${k}=${overrides[k]}`).join(";");
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return "t" + h.toString(36);
}

// Build the world: a deep copy of all data with the overrides applied.
//   D          - raw data loaded from data/*.json
//   overrides  - { "energy.baseActionCost": 3, "items.berries.hunger": 8, ... }
export function buildWorld(D, overrides = {}) {
  const W = structuredClone(D);
  for (const key in overrides) {
    if (key.startsWith("items.")) {
      const [, id, prop] = key.split(".");
      const it = W.items.find((i) => i.id === id);
      if (it) it[prop] = overrides[key];
    } else {
      setPath(W.config, key, overrides[key]);
    }
  }
  // Ground rest always takes 8 hours to fill Energy (not tunable).
  if (W.config.rest.groundLocked) W.config.rest.hoursToFull.ground = D.config.rest.hoursToFull.ground;
  W.tuningSetId = tuningSetId(overrides);
  return W;
}
