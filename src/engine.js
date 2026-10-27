// engine.js
// Game rules. Each function changes the game object it is given and
// returns { ok: true/false, message: "..." }. No DOM code here.

import { maxHp, maxEnergy, unspentPoints } from "./state.js";

// Add a line to the message log (newest first, keep the last 50).
export function log(game, text) {
  game.log.unshift({ day: game.day, time: game.time, text });
  if (game.log.length > 50) game.log.length = 50;
}

// ----- Attributes (Me screen) -----

// Can this attribute get one more free point?
// Max 4 applies to freeSpent only, not to level.
export function canAddPoint(config, game, attrId) {
  const a = game.attributes[attrId];
  return !!a && unspentPoints(config, game) > 0 && a.freeSpent < config.creation.maxPerAttrFromFree;
}

export function addPoint(config, game, attrId) {
  if (!canAddPoint(config, game, attrId)) {
    return { ok: false, message: "You cannot add a point there." };
  }
  const oldMaxHp = maxHp(config, game);
  const a = game.attributes[attrId];
  a.freeSpent += 1;
  a.level += 1;
  // When max HP rises, current HP rises by the same amount.
  // Current Energy does NOT change (only its max does).
  game.hp += maxHp(config, game) - oldMaxHp;
  return { ok: true, message: "Point added." };
}

// ----- Quests -----

export function acceptQuest(config, game, questId) {
  const q = game.quests;
  if (q.accepted.includes(questId)) return { ok: false, message: "Already accepted." };
  if (q.accepted.length >= config.quests.maxAccepted) {
    return { ok: false, message: `You can only hold ${config.quests.maxAccepted} quests. Abandon one first.` };
  }
  q.accepted.push(questId);
  if (!q.active) q.active = questId; // the first accepted quest becomes active
  return { ok: true, message: "Quest accepted." };
}

export function setActiveQuest(game, questId) {
  if (!game.quests.accepted.includes(questId)) return { ok: false, message: "Accept the quest first." };
  game.quests.active = questId;
  return { ok: true, message: "Active quest changed." };
}

export function abandonQuest(game, quest) {
  const q = game.quests;
  if (!quest.abandonable) return { ok: false, message: "This quest cannot be abandoned." };
  q.accepted = q.accepted.filter((id) => id !== quest.id);
  // If the active quest was abandoned, the first remaining one takes over (or none).
  if (q.active === quest.id) q.active = q.accepted[0] || null;
  return { ok: true, message: "Quest abandoned." };
}

// ----- Debug menu -----

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function debugSetHunger(config, game, value) {
  game.hunger = clamp(Math.round(Number(value) || 0), 0, config.meters.hungerMax);
  return { ok: true, message: `Hunger set to ${game.hunger}.` };
}

export function debugSetEnergy(config, game, value) {
  game.energy = clamp(Math.round(Number(value) || 0), 0, maxEnergy(config, game));
  return { ok: true, message: `Energy set to ${game.energy}.` };
}

export function debugSetDayTime(game, day, time) {
  const d = Math.max(1, Math.round(Number(day) || 1));
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, message: "Time must look like 06:00." };
  game.day = d;
  game.time = time;
  return { ok: true, message: `Set to Day ${d}, ${time}.` };
}

// Put day, time, HP, Energy and Hunger back to their start values.
export function debugReset(config, game) {
  game.day = config.start.day;
  game.time = config.start.time;
  game.energy = config.start.energy;
  game.hunger = config.start.hunger;
  game.hp = maxHp(config, game);
  return { ok: true, message: "Debug values reset." };
}
