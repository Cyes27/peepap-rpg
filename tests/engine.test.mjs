// tests/engine.test.mjs
// Checks the numbers in the Slice 1b-i "Done when" list without a browser.
// Run from the project folder:   node --test tests/
// (Not part of the shipped site.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildWorld, tuningSetId, validate } from "../src/tuning.js";
import { newGame, maxHp, maxEnergy, dayTime, carryKg } from "../src/state.js";
import * as engine from "../src/engine.js";
import { activeAdvice } from "../src/advice.js";
import { migrate } from "../src/save.js";
import { computeReport, reportText } from "../src/metrics.js";

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
const NAMES = ["config", "attributes", "skills", "places", "quests", "advice", "items", "actions", "nodes", "recipes", "typeLabels", "metrics"];
const D = Object.fromEntries(NAMES.map((n) => [n, load(n)]));
const W = buildWorld(D, {});

// A new game with Vitality 3 (other points elsewhere), optionally patched.
function fresh(patch = {}, free = { vitality: 3, strength: 3, perception: 2, agility: 2 }) {
  return Object.assign(newGame(W, "Tester", free, 1), patch);
}
const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 0.001, `${msg}: expected ${expected}, got ${actual}`);

test("2. New game, Vitality 3: HP 55, Energy 60 of 89, Hunger 50, Day 1 06:00", () => {
  const g = fresh();
  assert.equal(g.hp, 55);
  assert.equal(maxHp(W.config, g), 55);
  assert.equal(g.energy, 60);
  assert.equal(maxEnergy(W.config, g), 89);
  assert.equal(g.hunger, 50);
  assert.equal(dayTime(W.config, g), "Day 1, 06:00");
});

test("3. Travel to Forest Edge, then Pick berries", () => {
  let r = engine.travel(fresh(), W, "forest_edge");
  assert.ok(r.ok);
  near(r.state.energy, 59, "energy after travel");
  assert.equal(dayTime(W.config, r.state), "Day 1, 06:10");
  r = engine.gather(r.state, W, "pick_berries");
  assert.ok(r.ok);
  const g = r.state;
  near(g.energy, 55, "energy after pick");
  assert.equal(g.inventory.berries, 2);
  assert.equal(dayTime(W.config, g), "Day 1, 06:20");
  near(g.skills.foraging.xp, 10, "Foraging XP");
  near(g.attributes.perception.xp, 1.8, "Perception XP");
  near(g.attributes.agility.xp, 1.2, "Agility XP");
});

test("3b. Pick from Energy 60 with no travel: Energy 56, Hunger 49.33", () => {
  const r = engine.gather(fresh({ location: "forest_edge" }), W, "pick_berries");
  near(r.state.energy, 56, "energy");
  near(r.state.hunger, 49.33, "hunger");
});

test("4. Eat 2 berries in one command from Hunger 49.33 -> 61.0, +5 minutes", () => {
  const g0 = fresh({ hunger: 49.33, inventory: { berries: 2 } });
  const r = engine.eat(g0, W, "berries", "until");
  assert.ok(r.ok);
  near(r.state.hunger, 61, "hunger");
  assert.equal(r.state.inventory.berries, undefined);
  assert.equal(r.state.minutes, 5);
  // Eating at 100 is refused.
  const full = engine.eat(fresh({ hunger: 100, inventory: { berries: 1 } }), W, "berries");
  assert.equal(full.ok, false);
  assert.equal(full.reason, "full");
});

test("5. Woodcutting level 2 after 4 Gather sticks; stones; axe rules", () => {
  let g = fresh({ location: "forest_edge" });
  for (let i = 0; i < 4; i++) g = engine.gather(g, W, "gather_sticks").state;
  assert.equal(g.skills.woodcutting.level, 2);
  const noAxe = engine.gather(g, W, "chop_log");
  assert.equal(noAxe.ok, false);
  assert.equal(noAxe.reason, "no_tool");
  assert.deepEqual(noAxe.events, [{ type: "blocked", reason: "no_tool", what: "chop_log" }]);
  g.inventory.stone_axe = 1;
  const e0 = g.energy;
  const chop = engine.gather(g, W, "chop_log");
  assert.ok(chop.ok);
  near(e0 - chop.state.energy, 3, "chop cost with stone axe");
  const stones = engine.gather(fresh({ location: "stone_pile" }), W, "gather_stones");
  assert.equal(stones.state.inventory.loose_stone, 3);
});

test("6. Research Stone Tools: 8 Energy, 20 minutes, unlocks axe; Tent-building requirements", () => {
  const g0 = fresh();
  const tentNode = W.nodes.find((n) => n.id === "tent_building");
  assert.equal(engine.nodeStatus(W, g0, tentNode).state, "locked");
  assert.equal(engine.checkRecipe(W, g0, W.recipes.find((x) => x.id === "stone_axe")).reason, "no_research");
  const r = engine.research(g0, W, "stone_tools");
  assert.ok(r.ok);
  near(g0.energy - r.state.energy, 8, "research energy");
  assert.equal(r.state.minutes, 20);
  assert.notEqual(engine.checkRecipe(W, r.state, W.recipes.find((x) => x.id === "stone_axe")).reason, "no_research");
  assert.deepEqual(engine.nodeStatus(W, r.state, tentNode).missing, ["Woodcutting 2 (you have 1)"]);
});

test("7-8. Fire Pit, Roast Roots, Tent from bag + storage", () => {
  let g = fresh({ location: "campfire", energy: 89, research: { ...fresh().research, fire_making: true, cooking: true, tent_building: true } });
  g.inventory = { loose_stone: 5, stick: 7, wild_roots: 2 };
  let r = engine.makeRecipe(g, W, "fire_pit");
  assert.ok(r.ok, r.messages.join());
  assert.equal(r.state.built.fire_pit, true);
  r = engine.makeRecipe(r.state, W, "roast_roots");
  assert.ok(r.ok, r.messages.join());
  assert.equal(r.state.inventory.roast_roots, 2);
  assert.equal(W.items.find((i) => i.id === "roast_roots").hunger, 25);
  g = { ...r.state, location: "hut", energy: 89, inventory: { small_log: 3, stick: 2 }, storage: { stick: 4, reed_bundle: 4 } };
  r = engine.makeRecipe(g, W, "tent");
  assert.ok(r.ok, r.messages.join());
  assert.equal(r.state.homeShelter, "tent");
  assert.deepEqual(r.state.storage, {});
  assert.ok(!activeAdvice(W.advice, r.state, W).some((a) => a.id === "ground_bed"));
});

test("9. Rest checks (Vitality 3, max Energy 89)", () => {
  const rest = (patch, hours) => engine.rest(fresh(patch), W, { hours }).state;
  let g = rest({ energy: 56, hunger: 61 }, 8);
  near(g.energy, 89, "ground 8h E");
  near(g.hunger, 45, "ground 8h H");
  g = rest({ energy: 0, hunger: 40 }, 4);
  near(g.energy, 44.5, "ground 4h E");
  near(g.hunger, 32, "ground 4h H");
  g = rest({ energy: 0, hunger: 30, location: "hut", homeShelter: "tent" }, 6);
  near(g.energy, 89, "tent 6h E");
  near(g.hunger, 18, "tent 6h H");
  g = rest({ energy: 0, hunger: 16 }, 8);
  near(g.energy, 89, "ground 8h H16 E");
  near(g.hunger, 0, "ground 8h H16 H");
  const p15 = engine.restPreview(W, fresh({ energy: 0, hunger: 15 }), { hours: 8 });
  assert.ok(p15.short, "confirm screen warns for Hunger 15");
  near(p15.e1, 83.44, "ground 8h H15 E");
  near(rest({ energy: 0, hunger: 15 }, 8).energy, 83.44, "ground 8h H15 E (done)");
  // Sleep until full from 56 on the ground: 33 missing / 11.125 per hour -> 3 hours.
  assert.equal(engine.restPreview(W, fresh({ energy: 56, hunger: 61 }), { untilFull: true }).hours, 3);
});

test("10. Pass out: no food, Hunger 0, Energy 2, then Rest", () => {
  let g = fresh();
  g = engine.debugSetHunger(g, W, 0).state;
  g = engine.debugSetEnergy(g, W, 2).state;
  assert.equal(g.location, "greywillow");
  const preview = engine.restPreview(W, g, { hours: 1 });
  assert.ok(preview.short && preview.willPassOut, "confirm screen warns");
  const m0 = g.minutes;
  const r = engine.rest(g, W, { hours: 1 });
  assert.equal(r.state.location, "hut");
  assert.equal(r.state.energy, 40);
  assert.equal(r.state.hunger, 20);
  assert.equal(r.state.minutes - m0, 60 + 8 * 60);
  assert.ok(r.events.some((e) => e.type === "passOut"));
  assert.ok(r.state.log[0].text.includes("passed out"));
  // A food item in the bag prevents it.
  const fed = engine.rest({ ...g, inventory: { berries: 1 } }, W, { hours: 1 });
  assert.equal(fed.state.location, "greywillow");
  assert.ok(!fed.events.some((e) => e.type === "passOut"));
});

test("11. Carry limit with Strength 0 (10 kg) and storage", () => {
  let g = fresh({ location: "stone_pile" }, { vitality: 3 });
  assert.equal(carryKg(W.config, g), 10);
  for (let i = 0; i < 3; i++) g = engine.gather(g, W, "gather_stones").state;
  assert.equal(g.inventory.loose_stone, 9);
  const r = engine.gather(g, W, "gather_stones");
  assert.equal(r.reason, "too_heavy");
  assert.equal(r.events[0].type, "blocked");
  g = { ...g, location: "hut" };
  g = engine.deposit(g, W, "loose_stone", true).state;
  assert.equal(g.storage.loose_stone, 9);
  g = engine.withdraw(g, W, "loose_stone", false).state;
  assert.equal(g.inventory.loose_stone, 1);
});

test("12. A Slice 1a save migrates", () => {
  const v1 = {
    saveVersion: 1, settings: { textSize: 16, theme: "dark" }, screen: { name: "overview", params: {} },
    game: { name: "Old", location: "greywillow", day: 1, time: "06:00", money: 20, shelter: "ground", tool: "none", hp: 55, energy: 60, hunger: 50,
      attributes: { strength: { level: 2, freeSpent: 2 }, vitality: { level: 3, freeSpent: 3 } }, injuries: [], buffs: [], quests: { accepted: [], active: null }, lastAction: null, log: [], debug: { xpMultiplier: 1 } },
  };
  const s = migrate(structuredClone(v1), W, 5);
  assert.equal(s.saveVersion, 2);
  assert.equal(s.game.minutes, 0);
  assert.deepEqual(s.game.inventory, {});
  assert.equal(s.game.built.fire_pit, false);
  assert.equal(s.game.homeShelter, "ground");
  assert.ok(s.game.research.foraging);
  assert.equal(s.game.skills.woodcutting.xp, 0);
  assert.throws(() => migrate({ saveVersion: 3, game: null }, W));
});

test("13. Advice at a fresh start and with low meters", () => {
  const ids = (g) => activeAdvice(W.advice, g, W).map((a) => a.id);
  assert.deepEqual(ids(fresh()), ["no_axe", "no_fire", "ground_bed"]);
  assert.ok(ids(fresh({ hunger: 30 })).includes("hungry"));
  assert.ok(ids(fresh({ hunger: 5 })).includes("starving"));
  assert.ok(ids(fresh({ energy: 20 })).includes("low_energy"));
});

test("What you can do now", () => {
  const g = fresh({ location: "forest_edge" });
  assert.equal(engine.canDoLine(g, W), "You can: Pick berries, Dig roots, Gather sticks.");
  const tired = fresh({ location: "forest_edge", energy: 1 });
  assert.equal(engine.canDoLine(tired, W), "Nothing to do here right now. Rest, or go somewhere else.");
});

test("14. Tuning ids and metrics report", () => {
  assert.equal(tuningSetId({}), "default");
  assert.notEqual(tuningSetId({ "energy.baseActionCost": 3 }), "default");
  assert.equal(validate(D, "energy.baseActionCost", 9).ok, false);
  assert.equal(validate(D, "items.berries.hunger", 12).ok, true);
  const W2 = buildWorld(D, { "energy.baseActionCost": 3 });
  assert.equal(W2.config.energy.baseActionCost, 3);
  assert.equal(W.config.energy.baseActionCost, 4);

  // Play 12 picks and produce a report.
  let g = fresh({ location: "forest_edge", energy: 89 });
  const events = [];
  let t = 1000;
  const stamp = (e) => events.push({ realMs: (t += 4000), gameDay: 1, gameMinute: g.minutes, version: "0.2.0", tuningSetId: "default", sid: 1, seg: 1, gid: 1, hg: g.hunger, en: g.energy, hd: g.stats.hungerDrained, ...e });
  stamp({ type: "session", state: "start" });
  for (let i = 0; i < 12; i++) {
    const r = engine.gather(g, W, "pick_berries");
    g = r.state;
    stamp({ type: "tap", screen: "here", controlId: "gather:pick_berries", disabled: false, productive: true });
    r.events.forEach(stamp);
  }
  stamp({ type: "debug", kind: "set_hunger", debug: true });
  const report = computeReport(events, W);
  assert.equal(report.rows.length, 15);
  assert.deepEqual(report.rows.map((r) => r.id), Array.from({ length: 15 }, (_, i) => `M${i + 1}`));
  assert.equal(report.rows[3].status, "OK"); // 4 s between picks, band 3-10
  assert.match(reportText(report), /^Peepap metrics report/);
});
