// advice.js
// Reads the rules in advice.json and returns the ones that apply right now.
// To add advice, add a rule to data/advice.json. No code change needed
// unless you invent a new rule "type".
//
// Rule types:
//   meterBelow  - a meter (hunger, energy) is below config.advice[configKey]
//   carryAbove  - bag weight / carry kg is above config.advice[configKey]
//   hasNoItem   - the bag has none of an item
//   stateEquals - a (dotted) state key equals a value, e.g. built.fire_pit

import { getPath, carryKg, weightOf } from "./state.js";

export const HORIZONS = ["immediate", "short", "medium", "long"];
const EPS = 0.001;

// Does one rule apply to this game state? W is the world (config + data).
function applies(rule, game, W) {
  const w = rule.when;
  const limit = W.config.advice[w.configKey];
  switch (w.type) {
    case "meterBelow":
      return game[w.meter] < limit - EPS;
    case "carryAbove":
      return weightOf(W, game.inventory) / carryKg(W.config, game) > limit + EPS;
    case "hasNoItem":
      return !(game.inventory[w.item] > 0);
    case "stateEquals":
      return getPath(game, w.key) === w.value;
    default:
      return false; // unknown rule type: ignore it
  }
}

// All rules that apply, in the order of advice.json.
export function activeAdvice(rules, game, W) {
  return rules.filter((r) => applies(r, game, W));
}

// Same list grouped by horizon: { immediate: [...], short: [...], ... }
export function adviceByHorizon(rules, game, W) {
  const groups = {};
  for (const h of HORIZONS) groups[h] = [];
  for (const r of activeAdvice(rules, game, W)) {
    if (groups[r.horizon]) groups[r.horizon].push(r);
  }
  return groups;
}
