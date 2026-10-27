// state.js
// Builds the starting game state and works out values that come from it
// (like max HP or bag weight). No DOM code here: this file only deals with
// plain data, so it also runs under Node for the tests.
//
// "W" (the world) is one object holding the effective config and all data
// files: { config, attributes, skills, places, items, actions, nodes,
// recipes, advice, typeLabels, metrics }. See tuning.js buildWorld().

// ---------- Small helpers ----------

// Read a dotted key such as "built.fire_pit" from an object.
export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Write a dotted key, creating objects on the way if needed.
export function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== "object" || o[keys[i]] === null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

// Round to 2 decimals (meters and XP are stored like this).
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------- Time ----------
// Game time is stored as total minutes since the start (Day 1, 06:00).

// Minutes after midnight of the start time, e.g. "06:00" -> 360.
export function startOffset(config) {
  const [h, m] = config.start.time.split(":").map(Number);
  return h * 60 + m;
}

// "HH:MM" for a total-minutes value.
export function clockOf(config, minutes) {
  const t = (startOffset(config) + minutes) % 1440;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Day number (Day 1 is the first day).
export function dayOf(config, minutes) {
  return Math.floor((startOffset(config) + minutes) / 1440) + 1;
}

export function dayTime(config, game) {
  return `Day ${dayOf(config, game.minutes)}, ${clockOf(config, game.minutes)}`;
}

// The reverse: Day + "HH:MM" -> total minutes (may be negative before 06:00 on Day 1).
export function minutesFor(config, day, time) {
  const [h, m] = time.split(":").map(Number);
  return (day - 1) * 1440 + h * 60 + m - startOffset(config);
}

// ---------- New save / new game ----------

// Make a fresh save object. "game" stays null until a character is created.
export function newSave(config) {
  return {
    saveVersion: config.saveVersion,
    settings: {
      textSize: config.ui.defaultTextSize,
      theme: config.ui.defaultTheme,
    },
    screen: { name: "title", params: {} },
    game: null,
  };
}

// Every open skill starts at level 1 with 0 XP.
export function startSkills(W) {
  const skills = {};
  for (const s of W.skills.skills) if (s.state === "open") skills[s.id] = { level: 1, xp: 0 };
  return skills;
}

// Research nodes marked "start" are done from the beginning.
export function startResearch(W) {
  const done = {};
  for (const n of W.nodes) if (n.start) done[n.id] = true;
  return done;
}

// Every "built.x" a recipe can set starts as false, e.g. { fire_pit: false }.
export function startBuilt(W) {
  const built = {};
  for (const r of W.recipes) {
    for (const key of Object.keys(r.sets || {})) {
      if (key.startsWith("built.")) built[key.slice(6)] = false;
    }
  }
  return built;
}

// Make a brand-new character.
//   name       - text typed on the New Game screen
//   freeSpent  - object like { strength: 2, vitality: 4, ... }
//   now        - real time in ms (identifies this game in the metrics)
export function newGame(W, name, freeSpent, now = 0) {
  const config = W.config;
  const s = config.start;

  const attrs = {};
  for (const a of W.attributes) {
    const spent = freeSpent[a.id] || 0;
    attrs[a.id] = { level: spent, freeSpent: spent, xp: 0 };
  }

  const game = {
    name: String(name || "").trim() || "Traveler",
    location: W.places.startPlace,
    minutes: minutesFor(config, s.day, s.time), // 0 for Day 1, 06:00
    money: s.money,
    hp: 0, // set just below, once we know max HP
    energy: s.energy,
    hunger: s.hunger,
    attributes: attrs,
    skills: startSkills(W),
    inventory: {}, // bag: { itemId: quantity }
    storage: {}, // Hut storage: { itemId: quantity }
    built: startBuilt(W),
    homeShelter: s.homeShelter,
    research: startResearch(W), // { nodeId: true } for done nodes
    milestones: {}, // first-time events already reached
    stats: { hungerDrained: 0 }, // running totals used by the metrics
    injuries: [],
    buffs: [],
    quests: { accepted: [], active: null },
    lastAction: null,
    log: [],
    debug: { xpMultiplier: 1 },
    gid: now, // game id (for metrics)
    seg: now, // metrics segment (changes on load)
    levelMs: {}, // real time of the last level-up per skill/attribute
  };
  game.hp = maxHp(config, game); // start with full HP
  game.energy = Math.min(game.energy, maxEnergy(config, game));
  return game;
}

// Upgrade a Slice 1a game (saveVersion 1) to saveVersion 2.
export function upgradeGameV1(old, W, now = 0) {
  const g = { ...old };
  delete g.day;
  delete g.time;
  delete g.shelter;
  delete g.tool;
  g.minutes = 0; // Day 1, 06:00
  g.attributes = {};
  for (const id in old.attributes || {}) g.attributes[id] = { xp: 0, ...old.attributes[id] };
  for (const a of W.attributes) if (!g.attributes[a.id]) g.attributes[a.id] = { level: 0, freeSpent: 0, xp: 0 };
  g.skills = startSkills(W);
  g.inventory = {};
  g.storage = {};
  g.built = startBuilt(W);
  g.homeShelter = "ground";
  g.research = startResearch(W);
  g.milestones = {};
  g.stats = { hungerDrained: 0 };
  g.injuries = g.injuries || [];
  g.buffs = g.buffs || [];
  g.quests = g.quests || { accepted: [], active: null };
  g.log = g.log || [];
  g.debug = { xpMultiplier: 1 };
  g.gid = g.gid || now;
  g.seg = now;
  g.levelMs = {};
  return g;
}

// ---------- Derived values (worked out from the state, never stored) ----------

export function attrLevel(game, id) {
  return game.attributes[id] ? game.attributes[id].level : 0;
}

export function skillLevel(game, id) {
  return game.skills && game.skills[id] ? game.skills[id].level : 0;
}

// Max HP = 40 + 5 x Vitality
export function maxHp(config, game) {
  return config.meters.hpBase + config.meters.hpPerVit * attrLevel(game, "vitality");
}

// Max Energy = 80 + 3 x Vitality
export function maxEnergy(config, game) {
  return config.meters.energyBase + config.meters.energyPerVit * attrLevel(game, "vitality");
}

// Carry limit in kg = 10 + Strength
export function carryKg(config, game) {
  return config.meters.carryBaseKg + config.meters.carryPerStr * attrLevel(game, "strength");
}

// XP needed for the next level: base x max(level, 1) ^ exponent
export function xpToNext(base, exponent, level) {
  return round2(base * Math.pow(Math.max(level, 1), exponent));
}

// Free points not yet spent = 10 - (sum of freeSpent)
export function unspentPoints(config, game) {
  let used = 0;
  for (const id in game.attributes) used += game.attributes[id].freeSpent;
  return config.creation.freePoints - used;
}

// The 3 highest attributes by level. Ties keep the order of attributes.json.
export function topAttributes(attributes, game, count = 3) {
  return attributes
    .map((a, index) => ({ ...a, level: attrLevel(game, a.id), index }))
    .sort((x, y) => y.level - x.level || x.index - y.index)
    .slice(0, count);
}

// ---------- Inventory ----------

export function itemDef(W, id) {
  return W.items.find((i) => i.id === id);
}

// Total weight in kg of an inventory object { itemId: qty }.
export function weightOf(W, inv) {
  let kg = 0;
  for (const id in inv) {
    const it = itemDef(W, id);
    if (it) kg += it.weightKg * inv[id];
  }
  return round2(kg);
}

// Slots used: each item type uses ceil(quantity / stack) slots.
export function slotsOf(W, inv) {
  let slots = 0;
  for (const id in inv) {
    if (inv[id] <= 0) continue;
    const it = itemDef(W, id);
    const stack = (it && it.stack) || W.config.inventory.stack;
    slots += Math.ceil(inv[id] / stack);
  }
  return slots;
}

export function hasFood(W, inv) {
  return Object.keys(inv).some((id) => inv[id] > 0 && (itemDef(W, id) || {}).kind === "food");
}

// Add or remove items ({ id: qty }); quantities of 0 are deleted.
export function addItems(inv, items, sign = 1) {
  for (const id in items) {
    inv[id] = (inv[id] || 0) + sign * items[id];
    if (inv[id] <= 0) delete inv[id];
  }
}

// ---------- Places ----------

export function placeDef(W, id) {
  return W.places.places.find((p) => p.id === id);
}

export function hubId(W) {
  const hub = W.places.places.find((p) => p.kind === "hub");
  return hub ? hub.id : W.places.startPlace;
}

// Greywillow itself or one of its points of interest.
export function inVillage(W, id) {
  const p = placeDef(W, id);
  return !!p && (p.kind === "hub" || (p.kind === "poi" && p.parent === hubId(W)));
}

// Where storage is (the place with a "storage" thing): the Hut.
export function storagePlace(W) {
  const t = W.places.things.find((x) => x.type === "storage");
  return t ? t.at : null;
}

// The Revival Point: the first place with "revival": true.
export function revivalPlace(W) {
  const p = W.places.places.find((x) => x.revival);
  return p ? p.id : W.config.start.revivalPlace;
}

// Shelter used when resting here: home shelter at the Hut, otherwise ground.
export function shelterAt(W, game, placeId) {
  return placeId === W.config.start.revivalPlace || placeId === storagePlace(W) ? game.homeShelter : "ground";
}
