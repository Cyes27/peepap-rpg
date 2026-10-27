// state.js
// Builds the starting game state and works out values that come from it
// (like max HP). No DOM code here: this file only deals with plain data.

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

// Make a brand-new character.
//   name       - text typed on the New Game screen
//   freeSpent  - object like { strength: 2, vitality: 4, ... }
export function newGame(config, attributes, places, name, freeSpent) {
  const s = config.start;

  // One entry per attribute: level and freeSpent.
  // In Slice 1a, level always equals freeSpent (no XP yet).
  const attrs = {};
  for (const a of attributes) {
    const spent = freeSpent[a.id] || 0;
    attrs[a.id] = { level: spent, freeSpent: spent };
  }

  const game = {
    name: name.trim() || "Traveler",
    location: places.startPlace,
    day: s.day,
    time: s.time,
    money: s.money,
    shelter: s.shelter,
    tool: s.tool,
    hp: 0, // set just below, once we know max HP
    energy: s.energy,
    hunger: s.hunger,
    attributes: attrs,
    injuries: [],
    buffs: [],
    quests: { accepted: [], active: null },
    lastAction: null,
    log: [],
    debug: { xpMultiplier: config.xp.multiplier },
  };
  game.hp = maxHp(config, game); // start with full HP
  return game;
}

// ----- Derived values (worked out from the state, never stored) -----

export function attrLevel(game, id) {
  return game.attributes[id] ? game.attributes[id].level : 0;
}

// Max HP = 40 + 5 x Vitality
export function maxHp(config, game) {
  return config.meters.hpBase + config.meters.hpPerVit * attrLevel(game, "vitality");
}

// Max Energy = 80 + 3 x Vitality
export function maxEnergy(config, game) {
  return config.meters.energyBase + config.meters.energyPerVit * attrLevel(game, "vitality");
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
