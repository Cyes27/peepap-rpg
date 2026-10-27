// engine.js
// Game rules. No DOM code here, so it can be tested under Node.
//
// Every command takes (state, W, ...) and returns a result object:
//   { state, ok, reason, messages, events }
//   state    - a NEW game state (the one passed in is never changed)
//   ok       - false when the command was refused
//   reason   - why it was refused, e.g. "no_energy"
//   messages - lines to show the player
//   events   - metrics events (ui.js stamps them with time and stores them)
// W is the world: effective config plus all data (see tuning.js).

import {
  round2, getPath, setPath, startOffset, dayOf, clockOf, minutesFor, maxHp, maxEnergy, carryKg, xpToNext,
  unspentPoints, skillLevel, itemDef, weightOf, slotsOf, hasFood, addItems, placeDef, hubId,
  inVillage, storagePlace, revivalPlace, shelterAt,
} from "./state.js";

const EPS = 0.001; // tolerance for all meter checks

// ---------- Result helpers ----------

function begin(state) {
  return { state: structuredClone(state), ok: true, reason: null, messages: [], events: [] };
}

// Refuse a command: nothing changes, the reason is shown and logged.
function refuse(r, state, reason, what, message) {
  r.state = state; // the untouched original
  r.ok = false;
  r.reason = reason;
  r.messages = [message];
  r.events = reason === "not_here" ? [] : [{ type: "blocked", reason, what }];
  return r;
}

// Add a line to the message log (newest first, keep the last 50).
export function log(W, game, text) {
  game.log.unshift({ day: dayOf(W.config, game.minutes), time: clockOf(W.config, game.minutes), text });
  if (game.log.length > 50) game.log.length = 50;
}

function say(r, W, text, toLog = true) {
  r.messages.push(text);
  if (toLog) log(W, r.state, text);
}

function milestone(r, id) {
  if (r.state.milestones[id]) return;
  r.state.milestones[id] = true;
  r.events.push({ type: "milestone", id });
}

// "2 Wild Berries, 1 Stick"
export function describeItems(W, items) {
  return Object.keys(items).map((id) => `${items[id]} ${(itemDef(W, id) || { name: id }).name}`).join(", ");
}

// ---------- Time, Hunger and Energy ----------

// Let game time pass. Hunger drains perHourAwake / 60 per minute,
// times restFactor while resting or passed out.
function passTime(r, W, minutes, resting) {
  const g = r.state;
  const h = W.config.hunger;
  const drain = (h.perHourAwake / 60) * minutes * (resting ? h.restFactor : 1);
  const before = g.hunger;
  g.hunger = round2(Math.max(0, before - drain));
  g.stats.hungerDrained = round2(g.stats.hungerDrained + (before - g.hunger));
  g.minutes += minutes;
  if (before > EPS && g.hunger <= EPS) r.events.push({ type: "meterZero", meter: "hunger" });
}

function spendEnergy(r, cost) {
  const g = r.state;
  const before = g.energy;
  g.energy = round2(Math.max(0, before - cost));
  if (before > EPS && g.energy <= EPS) r.events.push({ type: "meterZero", meter: "energy" });
}

// ---------- XP and levels ----------

// Give XP for `actions` actions of a skill at a task level.
// Skill XP = skillPerTaskLevel x taskLevel; attribute XP = attrPerTaskLevel x
// taskLevel, split by the skill's percentages (skills.json). Both are
// multiplied by the XP multipliers (config and debug).
function grantXp(r, W, skillId, taskLevel, actions) {
  const g = r.state;
  const x = W.config.xp;
  const mult = (x.multiplier || 1) * ((g.debug && g.debug.xpMultiplier) || 1);
  const skillXp = round2(x.skillPerTaskLevel * taskLevel * actions * mult);
  const attrXp = round2(x.attrPerTaskLevel * taskLevel * actions * mult);

  if (!g.skills[skillId]) g.skills[skillId] = { level: 1, xp: 0 };
  const sk = g.skills[skillId];
  sk.xp = round2(sk.xp + skillXp);
  levelUps(r, W, "skill", skillId, sk, x.skillBase);

  const def = W.skills.skills.find((s) => s.id === skillId);
  const split = (def && def.split) || {};
  for (const attrId in split) {
    const a = g.attributes[attrId];
    if (!a) continue;
    a.xp = round2((a.xp || 0) + (attrXp * split[attrId]) / 100);
    levelUps(r, W, "attribute", attrId, a, x.attrBase);
  }
  return { skillXp, attrXp };
}

// Raise levels while there is enough XP (XP carries over).
function levelUps(r, W, kind, id, o, base) {
  const g = r.state;
  for (;;) {
    const need = xpToNext(base, W.config.xp.exponent, o.level);
    if (o.xp + EPS < need) break;
    o.xp = round2(Math.max(0, o.xp - need));
    o.level += 1;
    // Vitality: current HP rises by the same amount as max HP. Energy is unchanged.
    if (kind === "attribute" && id === "vitality") g.hp += W.config.meters.hpPerVit;
    r.events.push({ type: "levelUp", kind, id, level: o.level });
    const list = kind === "skill" ? W.skills.skills : W.attributes;
    const name = (list.find((s) => s.id === id) || { name: id }).name;
    say(r, W, `${name} reached level ${o.level}.`);
    if (kind === "skill" && o.level >= 5) milestone(r, "skill_5");
    if (kind === "attribute" && o.level === 1) milestone(r, "attribute_1");
  }
}

// ---------- Pass out and revival ----------

// STUCK: Hunger 0, no food in the bag, and Energy below the base action cost.
export function isStuck(W, g) {
  return g.hunger <= EPS && !hasFood(W, g.inventory) && g.energy < W.config.energy.baseActionCost - EPS;
}

// Move to the Revival Point and set the wake values (used by pass out now,
// and by combat defeat in Slice 1c). Changes `game` in place.
function applyRevive(W, game, reason, placeId) {
  const rv = W.config.revival;
  game.location = placeId || revivalPlace(W);
  game.energy = Math.min(rv.wakeEnergy, maxEnergy(W.config, game));
  game.hunger = rv.wakeHunger;
  return reason;
}

// Reusable revive: returns a result like any command.
export function revive(state, W, reason, placeId) {
  const r = begin(state);
  applyRevive(W, r.state, reason, placeId);
  say(r, W, `You wake at ${placeDef(W, r.state.location).name}.`);
  return r;
}

// Run after every successful game command.
function finish(r, W) {
  if (!r.ok || !isStuck(W, r.state)) return r;
  const hours = W.config.revival.passOutHours;
  passTime(r, W, hours * 60, true);
  r.events.push({ type: "passOut", cause: "hunger" });
  applyRevive(W, r.state, "pass_out");
  say(r, W, `You passed out from hunger and exhaustion. ${hours} hours later you wake at ${placeDef(W, r.state.location).name}, weak but alive.`);
  return r;
}

// ---------- Capacity ----------

// Would the bag still be within its limits after removing `removes` and
// adding `adds`? Returns null if fine, or "too_heavy" / "bag_full".
export function bagProblem(W, g, adds, removes = {}) {
  const inv = { ...g.inventory };
  addItems(inv, removes, -1);
  addItems(inv, adds);
  if (weightOf(W, inv) > carryKg(W.config, g) + EPS) return "too_heavy";
  if (slotsOf(W, inv) > W.config.inventory.bagSlots) return "bag_full";
  return null;
}

const CAPACITY_TEXT = {
  too_heavy: "Too heavy: that would pass your carry limit.",
  bag_full: "Your bag has no free slot for that.",
};

// ---------- Gathering ----------

// The tool of this type in the BAG with the lowest Energy cost (or null).
export function bestTool(W, inv, toolType) {
  let best = null;
  for (const it of W.items) {
    if (it.kind !== "tool" || it.toolType !== toolType || !(inv[it.id] > 0)) continue;
    if (!best || W.config.energy.toolCost[it.tier] < W.config.energy.toolCost[best.tier]) best = it;
  }
  return best;
}

// Check a gather action. Order: tool, Energy, capacity (Hunger is not checked).
export function checkGather(W, g, action) {
  const tool = action.toolType ? bestTool(W, g.inventory, action.toolType) : null;
  if (action.toolRequired && !tool) {
    return { ok: false, reason: "no_tool", message: `You need a tool for that (${action.toolType}).` };
  }
  const cost = tool ? W.config.energy.toolCost[tool.tier] : W.config.energy.baseActionCost;
  if (g.energy < cost - EPS) return { ok: false, reason: "no_energy", cost, message: `Not enough Energy (needs ${cost}).` };
  const cap = bagProblem(W, g, action.yield);
  if (cap) return { ok: false, reason: cap, cost, message: CAPACITY_TEXT[cap] };
  return { ok: true, cost, tool };
}

export function gather(state, W, actionId) {
  const r = begin(state);
  const g = r.state;
  const a = W.actions.find((x) => x.id === actionId);
  if (!a || g.location !== a.at) return refuse(r, state, "not_here", actionId, "You can't do that here.");
  const c = checkGather(W, g, a);
  if (!c.ok) return refuse(r, state, c.reason, a.id, c.message);

  const minutes = W.config.time.actionMinutes;
  spendEnergy(r, c.cost);
  passTime(r, W, minutes, false);
  addItems(g.inventory, a.yield);
  g.lastAction = a.name;
  say(r, W, `${a.name}: +${describeItems(W, a.yield)}.`);
  const xp = grantXp(r, W, a.skill, a.taskLevel, 1);
  const food = Object.keys(a.yield).some((id) => (itemDef(W, id) || {}).kind === "food");
  r.events.unshift({
    type: "action", actionId: a.id, skill: a.skill, taskLevel: a.taskLevel,
    energy: c.cost, minutes, skillXp: xp.skillXp, attrXp: xp.attrXp, food,
  });
  milestone(r, "first_gather");
  return finish(r, W);
}

// ---------- Eating ----------

// mode "one" eats 1; mode "until" eats until Hunger reaches eatUntilHunger (80).
export function eat(state, W, itemId, mode = "one") {
  const r = begin(state);
  const g = r.state;
  const it = itemDef(W, itemId);
  const have = g.inventory[itemId] || 0;
  if (!it || it.kind !== "food" || have < 1) return refuse(r, state, "no_food", itemId, "You have none of that to eat.");
  if (g.hunger >= W.config.meters.hungerMax - EPS) return refuse(r, state, "full", itemId, "You are full.");

  let qty = 1;
  if (mode === "until") qty = Math.max(1, Math.ceil((W.config.eatUntilHunger - g.hunger - EPS) / it.hunger));
  qty = Math.min(qty, have);

  const before = g.hunger;
  g.hunger = round2(Math.min(W.config.meters.hungerMax, before + qty * it.hunger));
  const gained = round2(g.hunger - before);
  addItems(g.inventory, { [itemId]: qty }, -1);
  spendEnergy(r, W.config.energy.eatCost || 0);
  passTime(r, W, W.config.time.eatMinutes, false);
  g.lastAction = `Ate ${it.name}`;
  say(r, W, `You ate ${qty} ${it.name}. Hunger +${Math.round(gained)}.`);
  r.events.unshift({ type: "eat", item: itemId, qty, hunger: gained, minutes: W.config.time.eatMinutes });
  milestone(r, "first_eat");
  return finish(r, W);
}

// ---------- Movement ----------

export function travelInfo(W, g, to) {
  const from = g.location;
  const toPlace = placeDef(W, to);
  const fromPlace = placeDef(W, from);
  if (!toPlace || to === from) return { ok: false, reason: "not_here", message: "You are already here." };
  // Inside Greywillow (hub and its points of interest): free.
  if (inVillage(W, from) && inVillage(W, to)) return { ok: true, minutes: 0, cost: 0 };
  // Greywillow <-> an area: travel time and Energy.
  const toArea = inVillage(W, from) && toPlace.kind === "area";
  const backHome = fromPlace && fromPlace.kind === "area" && to === hubId(W);
  if (!toArea && !backHome) return { ok: false, reason: "not_here", message: "You can only get there through Greywillow." };
  const cost = W.config.energy.travelCost;
  if (g.energy < cost - EPS) return { ok: false, reason: "no_energy", cost, message: `Not enough Energy to travel (needs ${cost}).` };
  return { ok: true, minutes: W.config.time.travelMinutes, cost };
}

export function travel(state, W, to) {
  const r = begin(state);
  const g = r.state;
  const t = travelInfo(W, g, to);
  if (!t.ok) return refuse(r, state, t.reason, `travel:${to}`, t.message);
  const from = g.location;
  if (t.cost) spendEnergy(r, t.cost);
  if (t.minutes) passTime(r, W, t.minutes, false);
  g.location = to;
  say(r, W, `You go to ${placeDef(W, to).name}.`, t.minutes > 0);
  r.events.unshift({ type: "travel", from, to, minutes: t.minutes, energy: t.cost });
  return finish(r, W);
}

// ---------- Rest and sleep ----------

// Work out what a rest would do, without doing it (for the confirm screen).
//   opts: { hours } or { untilFull: true }
export function restPreview(W, g, opts = {}) {
  const c = W.config;
  const shelter = shelterAt(W, g, g.location);
  const htf = shelter === "ground" && c.rest.groundLocked ? 8 : c.rest.hoursToFull[shelter];
  const eMax = maxEnergy(c, g);
  const atFull = g.energy >= eMax - EPS;
  let hours;
  if (opts.untilFull) {
    hours = atFull ? 1 : Math.ceil(((eMax - g.energy) * htf) / eMax - EPS);
  } else {
    hours = Math.round(Number(opts.hours) || 0);
  }
  hours = Math.max(c.rest.minHours, Math.min(c.rest.maxHours, hours));
  const drainPerHour = c.hunger.perHourAwake * c.hunger.restFactor;
  const recoveryHours = Math.min(hours, g.hunger / drainPerHour);
  const e1 = round2(Math.min(eMax, g.energy + (eMax * recoveryHours) / htf));
  const h1 = round2(Math.max(0, g.hunger - hours * drainPerHour));
  const short = recoveryHours < hours - EPS;
  // Would the player pass out right after this rest?
  const after = { ...g, energy: e1, hunger: h1 };
  return {
    shelter, hoursToFull: htf, hours, untilFull: !!opts.untilFull, eMax, atFull,
    e0: g.energy, e1, h0: g.hunger, h1,
    recoveryHours: round2(recoveryHours), short,
    wakeMinutes: g.minutes + hours * 60,
    willPassOut: isStuck(W, after),
  };
}

export function rest(state, W, opts = {}) {
  const r = begin(state);
  const g = r.state;
  const p = restPreview(W, g, opts);
  const m0 = g.minutes;
  g.energy = p.e1;
  passTime(r, W, p.hours * 60, true);
  g.hunger = p.h1; // same value passTime worked out; set exactly for clarity
  g.lastAction = `Rested ${p.hours} h`;
  const where = p.shelter === "ground" ? "on the ground" : `in your ${p.shelter.replace(/_/g, " ")}`;
  say(r, W, `You rested ${p.hours} h ${where}. Energy ${Math.round(p.e0)} -> ${Math.round(p.e1)}.`);
  if (p.short) say(r, W, "Hunger reached 0, so your rest stopped helping.");
  r.events.unshift({
    type: "rest", shelter: p.shelter, hours: p.hours, untilFull: p.untilFull,
    e0: p.e0, e1: p.e1, h0: p.h0, h1: p.h1, eMax: p.eMax, interrupted: p.short, m0,
  });
  if (p.shelter === "tent") milestone(r, "first_sleep_in_tent");
  return finish(r, W);
}

// ---------- Research ----------

// { state: "done" | "available" | "locked", missing: [text, ...] }
export function nodeStatus(W, g, node) {
  if (g.research[node.id]) return { state: "done", missing: [] };
  if (node.lockedInSlice) return { state: "locked", missing: [node.lockNote] };
  const missing = [];
  for (const id of (node.requires && node.requires.nodes) || []) {
    if (!g.research[id]) missing.push(`Research ${(W.nodes.find((n) => n.id === id) || { name: id }).name}`);
  }
  const skills = (node.requires && node.requires.skills) || {};
  for (const id in skills) {
    const have = skillLevel(g, id);
    if (have < skills[id]) {
      const name = (W.skills.skills.find((s) => s.id === id) || { name: id }).name;
      missing.push(`${name} ${skills[id]} (you have ${have})`);
    }
  }
  return { state: missing.length ? "locked" : "available", missing };
}

export function checkResearch(W, g, node) {
  const st = nodeStatus(W, g, node);
  if (st.state === "done") return { ok: false, reason: "done", message: "Already researched." };
  if (st.state === "locked") return { ok: false, reason: "locked", message: `Needs: ${st.missing.join(", ")}.` };
  const cost = node.actions * W.config.energy.baseActionCost;
  if (g.energy < cost - EPS) return { ok: false, reason: "no_energy", cost, message: `Not enough Energy (needs ${cost}).` };
  return { ok: true, cost, minutes: node.actions * W.config.time.actionMinutes };
}

export function research(state, W, nodeId) {
  const r = begin(state);
  const g = r.state;
  const node = W.nodes.find((n) => n.id === nodeId);
  if (!node) return refuse(r, state, "not_here", nodeId, "Unknown research.");
  const c = checkResearch(W, g, node);
  if (!c.ok) return refuse(r, state, c.reason, node.id, c.message);
  spendEnergy(r, c.cost);
  passTime(r, W, c.minutes, false);
  g.research[node.id] = true;
  g.lastAction = `Researched ${node.name}`;
  say(r, W, `Researched ${node.name}.`);
  r.events.unshift({ type: "research", nodeId: node.id, actions: node.actions, energy: c.cost, minutes: c.minutes });
  return finish(r, W);
}

// ---------- Crafting, building and cooking ----------

function recipeBuilt(g, recipe) {
  const sets = recipe.sets || {};
  const keys = Object.keys(sets);
  return keys.length > 0 && keys.every((k) => getPath(g, k) === sets[k]);
}

// Split the inputs into what comes from the bag and what from storage.
// At the Hut, recipes use bag + storage together (bag first).
function takeInputs(W, g, recipe, placeId) {
  const useStorage = placeId === storagePlace(W);
  const fromBag = {};
  const fromStorage = {};
  const missing = {};
  for (const id in recipe.inputs) {
    const need = recipe.inputs[id];
    const bag = Math.min(need, g.inventory[id] || 0);
    const store = useStorage ? Math.min(need - bag, g.storage[id] || 0) : 0;
    if (bag) fromBag[id] = bag;
    if (store) fromStorage[id] = store;
    if (bag + store < need) missing[id] = need - bag - store;
  }
  return { fromBag, fromStorage, missing };
}

const KIND_VERB = { craft: "Craft", build: "Build", cook: "Cook" };

// Check order: research, place, already built, station, materials, Energy, capacity.
export function checkRecipe(W, g, recipe, placeId = g.location) {
  const node = W.nodes.find((n) => n.id === recipe.needsNode);
  if (recipe.needsNode && !g.research[recipe.needsNode]) {
    return { ok: false, reason: "no_research", message: `Needs research: ${node ? node.name : recipe.needsNode}.` };
  }
  if (recipe.at && placeId !== recipe.at) {
    return { ok: false, reason: "not_here", message: `Only at ${placeDef(W, recipe.at).name}.` };
  }
  if (recipe.once && recipeBuilt(g, recipe)) return { ok: false, reason: "built", message: "Already built." };
  if (recipe.station && !g.built[recipe.station]) {
    const st = W.recipes.find((x) => x.id === recipe.station);
    return { ok: false, reason: "no_station", message: `Needs a ${st ? st.name : recipe.station}.` };
  }
  const take = takeInputs(W, g, recipe, placeId);
  if (Object.keys(take.missing).length) {
    return { ok: false, reason: "no_materials", message: `Missing: ${describeItems(W, take.missing)}.` };
  }
  const cost = recipe.actions * W.config.energy.baseActionCost;
  if (g.energy < cost - EPS) return { ok: false, reason: "no_energy", cost, message: `Not enough Energy (needs ${cost}).` };
  const cap = bagProblem(W, g, recipe.outputs || {}, take.fromBag);
  if (cap) return { ok: false, reason: cap, cost, message: CAPACITY_TEXT[cap] };
  return { ok: true, cost, minutes: recipe.actions * W.config.time.actionMinutes, take };
}

const RECIPE_MILESTONES = { stone_axe: "first_stone_tool", stone_pickaxe: "first_stone_tool", fire_pit: "first_fire", tent: "first_tent" };

export function makeRecipe(state, W, recipeId) {
  const r = begin(state);
  const g = r.state;
  const recipe = W.recipes.find((x) => x.id === recipeId);
  if (!recipe) return refuse(r, state, "not_here", recipeId, "Unknown recipe.");
  const c = checkRecipe(W, g, recipe);
  if (!c.ok) return refuse(r, state, c.reason, recipe.id, c.message);

  spendEnergy(r, c.cost);
  passTime(r, W, c.minutes, false);
  addItems(g.inventory, c.take.fromBag, -1);
  addItems(g.storage, c.take.fromStorage, -1);
  if (recipe.outputs) addItems(g.inventory, recipe.outputs);
  for (const key in recipe.sets || {}) setPath(g, key, recipe.sets[key]);
  g.lastAction = `${KIND_VERB[recipe.kind] || "Made"} ${recipe.name}`;
  say(r, W, recipe.outputs ? `${g.lastAction}: +${describeItems(W, recipe.outputs)}.` : `${g.lastAction}: done.`);
  const xp = grantXp(r, W, recipe.skill, recipe.taskLevel, recipe.actions);
  r.events.unshift({
    type: "craft", recipeId: recipe.id, kind: recipe.kind, actions: recipe.actions,
    energy: c.cost, minutes: c.minutes, skillXp: xp.skillXp, attrXp: xp.attrXp,
  });
  if (RECIPE_MILESTONES[recipe.id]) milestone(r, RECIPE_MILESTONES[recipe.id]);
  if (recipe.kind === "cook") milestone(r, "first_cook");
  return finish(r, W);
}

// ---------- Storage (at the Hut) ----------

export function deposit(state, W, itemId, all = false) {
  const r = begin(state);
  const g = r.state;
  if (g.location !== storagePlace(W)) return refuse(r, state, "not_here", itemId, "Storage is at your Hut.");
  const have = g.inventory[itemId] || 0;
  if (have < 1) return refuse(r, state, "not_here", itemId, "You have none of that.");
  const qty = all ? have : 1;
  const store = { ...g.storage };
  addItems(store, { [itemId]: qty });
  if (slotsOf(W, store) > W.config.inventory.storageSlots) {
    return refuse(r, state, "storage_full", itemId, "Storage is full.");
  }
  addItems(g.inventory, { [itemId]: qty }, -1);
  g.storage = store;
  say(r, W, `Stored ${describeItems(W, { [itemId]: qty })}.`, false);
  return r;
}

export function withdraw(state, W, itemId, all = false) {
  const r = begin(state);
  const g = r.state;
  if (g.location !== storagePlace(W)) return refuse(r, state, "not_here", itemId, "Storage is at your Hut.");
  const have = g.storage[itemId] || 0;
  if (have < 1) return refuse(r, state, "not_here", itemId, "Storage has none of that.");
  // Take as many as fit in the bag (1 for "Withdraw 1").
  let qty = all ? have : 1;
  let problem = bagProblem(W, g, { [itemId]: qty });
  while (problem && qty > 1) {
    qty -= 1;
    problem = bagProblem(W, g, { [itemId]: qty });
  }
  if (problem) return refuse(r, state, problem, itemId, CAPACITY_TEXT[problem]);
  addItems(g.storage, { [itemId]: qty }, -1);
  addItems(g.inventory, { [itemId]: qty });
  say(r, W, `Took ${describeItems(W, { [itemId]: qty })}${qty < have && all ? " (all that fits)" : ""}.`, false);
  return r;
}

// ---------- What can I do here? ----------

// Every action, research, craft, build, cook, rest and storage option at a
// place, in data order, each with ok true/false and the reason.
export function availableActions(state, W, placeId = state.location) {
  const g = { ...state, location: placeId };
  const list = [];
  for (const a of W.actions) {
    if (a.at !== placeId) continue;
    const c = checkGather(W, g, a);
    list.push({ kind: "action", id: a.id, label: a.name, ...c });
  }
  for (const n of W.nodes) {
    if (nodeStatus(W, g, n).state !== "available") continue;
    list.push({ kind: "research", id: n.id, label: `Research ${n.name}`, ...checkResearch(W, g, n) });
  }
  for (const kind of ["craft", "build", "cook"]) {
    for (const rc of W.recipes) {
      if (rc.kind !== kind || (rc.at && rc.at !== placeId)) continue;
      list.push({ kind, id: rc.id, label: `${KIND_VERB[kind]} ${rc.name}`, ...checkRecipe(W, g, rc, placeId) });
    }
  }
  list.push({ kind: "rest", id: "rest", label: "Rest", ok: true });
  if (placeId === storagePlace(W)) list.push({ kind: "storage", id: "storage", label: "Use storage", ok: true });
  return list;
}

// "You can: Pick berries, Dig roots, Gather sticks." (Rest is left out:
// the fallback line already suggests it.)
export function canDoLine(state, W, placeId = state.location) {
  const ok = availableActions(state, W, placeId).filter((a) => a.ok && a.kind !== "rest").slice(0, 3);
  return ok.length ? `You can: ${ok.map((a) => a.label).join(", ")}.` : "Nothing to do here right now. Rest, or go somewhere else.";
}

// ---------- Attributes (Me screen) ----------

// Can this attribute get one more free point? Max 4 applies to freeSpent only.
export function canAddPoint(W, g, attrId) {
  const a = g.attributes[attrId];
  return !!a && unspentPoints(W.config, g) > 0 && a.freeSpent < W.config.creation.maxPerAttrFromFree;
}

export function addPoint(state, W, attrId) {
  const r = begin(state);
  const g = r.state;
  if (!canAddPoint(W, g, attrId)) return refuse(r, state, "not_here", attrId, "You cannot add a point there.");
  const oldMaxHp = maxHp(W.config, g);
  g.attributes[attrId].freeSpent += 1;
  g.attributes[attrId].level += 1;
  // When max HP rises, current HP rises by the same amount. Energy does not change.
  g.hp += maxHp(W.config, g) - oldMaxHp;
  r.messages.push("Point added.");
  return r;
}

// ---------- Quests ----------

export function acceptQuest(state, W, quest) {
  const r = begin(state);
  const q = r.state.quests;
  if (q.accepted.includes(quest.id)) return refuse(r, state, "not_here", quest.id, "Already accepted.");
  if (q.accepted.length >= W.config.quests.maxAccepted) {
    return refuse(r, state, "not_here", quest.id, `You can only hold ${W.config.quests.maxAccepted} quests. Abandon one first.`);
  }
  q.accepted.push(quest.id);
  if (!q.active) q.active = quest.id; // the first accepted quest becomes active
  r.messages.push("Quest accepted.");
  log(W, r.state, `Accepted: ${quest.title}`);
  return r;
}

export function setActiveQuest(state, questId) {
  const r = begin(state);
  if (!r.state.quests.accepted.includes(questId)) return refuse(r, state, "not_here", questId, "Accept the quest first.");
  r.state.quests.active = questId;
  r.messages.push("Active quest changed.");
  return r;
}

export function abandonQuest(state, W, quest) {
  const r = begin(state);
  const q = r.state.quests;
  if (!quest.abandonable) return refuse(r, state, "not_here", quest.id, "This quest cannot be abandoned.");
  q.accepted = q.accepted.filter((id) => id !== quest.id);
  // If the active quest was abandoned, the first remaining one takes over (or none).
  if (q.active === quest.id) q.active = q.accepted[0] || null;
  r.messages.push("Quest abandoned.");
  log(W, r.state, `Abandoned: ${quest.title}`);
  return r;
}

// ---------- Debug menu ----------
// Debug edits do NOT trigger the pass-out check, and their events are
// flagged so the metrics leave them out.

function debugResult(state, kind) {
  const r = begin(state);
  r.events.push({ type: "debug", kind });
  return r;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function debugSetHunger(state, W, value) {
  const r = debugResult(state, "set_hunger");
  r.state.hunger = round2(clamp(Number(value) || 0, 0, W.config.meters.hungerMax));
  r.messages.push(`Hunger set to ${r.state.hunger}.`);
  return r;
}

export function debugSetEnergy(state, W, value) {
  const r = debugResult(state, "set_energy");
  r.state.energy = round2(clamp(Number(value) || 0, 0, maxEnergy(W.config, r.state)));
  r.messages.push(`Energy set to ${r.state.energy}.`);
  return r;
}

export function debugSetDayTime(state, W, day, time) {
  const r = debugResult(state, "set_time");
  const d = Math.max(1, Math.round(Number(day) || 1));
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return refuse(r, state, "not_here", "debug", "Time must look like 06:00.");
  const m = minutesFor(W.config, d, time);
  if (m < 0) return refuse(r, state, "not_here", "debug", "The game starts on Day 1 at 06:00.");
  r.state.minutes = m;
  r.messages.push(`Set to Day ${d}, ${time}.`);
  return r;
}

// Jump the clock to the next 06:00 (no Hunger drain: it is a debug edit).
export function debugSkipTo0600(state, W) {
  const r = debugResult(state, "skip_0600");
  const g = r.state;
  const now = (startOffset(W.config) + g.minutes) % 1440; // minutes after midnight
  let delta = (startOffset(W.config) - now + 1440) % 1440;
  if (delta === 0) delta = 1440;
  g.minutes += delta;
  r.messages.push(`Skipped to Day ${dayOf(W.config, g.minutes)}, ${clockOf(W.config, g.minutes)}.`);
  return r;
}

// Grant items (ignores bag limits: it is a debug tool).
export function debugGrant(state, W, itemId, qty) {
  const r = debugResult(state, "grant_item");
  const it = itemDef(W, itemId);
  const n = Math.round(Number(qty) || 0);
  if (!it || n < 1) return refuse(r, state, "not_here", "debug", "Pick an item and a quantity of 1 or more.");
  addItems(r.state.inventory, { [itemId]: n });
  r.messages.push(`Granted ${n} ${it.name}.`);
  return r;
}

export function debugSetXpMultiplier(state, value) {
  const r = debugResult(state, "xp_multiplier");
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 20) return refuse(r, state, "not_here", "debug", "XP multiplier must be between 1 and 20.");
  r.state.debug.xpMultiplier = n;
  r.messages.push(`XP multiplier set to ${n}.`);
  return r;
}

// Put time, HP, Energy and Hunger back to their start values.
export function debugReset(state, W) {
  const r = debugResult(state, "reset");
  const g = r.state;
  g.minutes = 0;
  g.energy = Math.min(W.config.start.energy, maxEnergy(W.config, g));
  g.hunger = W.config.start.hunger;
  g.hp = maxHp(W.config, g);
  r.messages.push("Debug values reset.");
  return r;
}
