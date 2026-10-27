// advice.js
// Reads the rules in advice.json and returns the ones that apply right now.
// To add advice, add a rule to data/advice.json. No code change needed
// unless you invent a new rule "type".

export const HORIZONS = ["immediate", "short", "medium", "long"];

// Does one rule apply to this game state?
function applies(rule, game, config) {
  const w = rule.when;
  switch (w.type) {
    case "meterBelow":
      // e.g. hunger below config.advice.hungryBelow
      return game[w.meter] < config.advice[w.configKey];
    case "stateEquals":
      // e.g. tool equals "none"
      return game[w.key] === w.value;
    default:
      return false; // unknown rule type: ignore it
  }
}

// All rules that apply, in the order of advice.json.
export function activeAdvice(rules, game, config) {
  return rules.filter((r) => applies(r, game, config));
}

// Same list grouped by horizon: { immediate: [...], short: [...], ... }
export function adviceByHorizon(rules, game, config) {
  const groups = {};
  for (const h of HORIZONS) groups[h] = [];
  for (const r of activeAdvice(rules, game, config)) {
    if (groups[r.horizon]) groups[r.horizon].push(r);
  }
  return groups;
}
