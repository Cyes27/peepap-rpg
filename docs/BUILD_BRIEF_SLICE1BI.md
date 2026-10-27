---
title: Build Brief - Slice 1b-i v1 (Core Loop)
type: build-brief
slice: 1b-i
status: beta
supersedes: none (extends [[2026-10-27 Build Brief Slice 1a v3]], which stays in Beta until the 1a playtest is complete)
created: 2026-10-27
tags: [peepap, build, beta]
---

# Build Brief - Slice 1b-i v1: "Core Loop" (build 0.2.0)

## Goal
Time now passes and the survival loop works: gather, research, craft, build a fire pit and a tent, cook and eat, rest and sleep, pass out and revive, save and load, with playtest metrics recorded inside the game. Version 0.2.0. Content is the 1a village plus the data appendix below.

## Source-of-truth rules (read first)
- ALL names, numbers and text come from this brief and the data appendix. Do not invent items, recipes, numbers or lore. If something is missing, ASK.
- Save the appendix JSON blocks exactly as data/*.json. Where a block is named config.json it REPLACES the 1a file (1a values are kept inside it). All other 1a data files stay, except the patches below.
- All numbers are untested drafts. Keep them in data/config.json and the other JSON so they can be tuned without code changes.
- Same tech rules as Brief 1a v3: vanilla HTML/CSS/JS ES modules, no framework, no build step, relative paths, pure logic (engine.js, advice.js, metrics.js) separate from display (ui.js), every localStorage access in try/catch, mobile portrait, tap targets at least 44px, dark mode default. NO service worker.
- Do not merge or push to main. Open a pull request only.

## Patches to the 1a data and screens
1. data/places.json: add "revival": true to the place with id "hut". Nothing else changes.
2. Friendly labels: item and thing detail screens must not show raw words like "Type: resource". Use data/typeLabels.json (kind -> label) for items and things.
3. Overview and Here show the "what you can do now" line (see Advice section). The 1a "Activities greyed out: coming in 1b-i" text is replaced by live actions; activities that still have no action stay greyed with "coming in 1b-ii".
4. Version 0.2.0 shown on Overview (from config.json).

## Rules

### Time and meters
- Game time is stored as total minutes since the start. Start = Day 1, 06:00. Clock = (360 + minutes) mod 1440; day number = floor((360 + minutes) / 1440) + 1. No day/night effects yet (1b-ii).
- Gather, craft, build, research and cook actions take time.actionMinutes (10) per action. Travel takes 10 minutes. Eating takes 5 minutes per Eat command, however many items are eaten.
- Hunger drains hunger.perHourAwake / 60 per game minute whenever time passes, multiplied by hunger.restFactor (0.5) while resting or passed out. Hunger never goes below 0 or above 100.
- Meters are stored as numbers rounded to 2 decimals after each operation and DISPLAYED rounded to whole numbers. All checks use the stored value with a tolerance of 0.001.
- Energy never goes negative. Max HP = 40 + 5 x Vitality; max Energy = 80 + 3 x Vitality; carry kg = 10 + Strength. HP changes only through Vitality in this slice.

### Movement
- Location is a place id (hub, POI or area). Tapping a POI in Greywillow moves you there for free (0 minutes, 0 Energy). Moving between Greywillow and an area (Go to / Back to Greywillow) takes 10 minutes and 1 Energy. Areas connect only to Greywillow, so area-to-area is two trips.
- Rest, Eat and Bag work anywhere.

### Gathering (data/actions.json)
- An action costs energy.baseActionCost (4), or the tool cost for the best tool of its toolType found in the BAG (none 4, stone 3). Tools are items; carrying one is enough, no equip screen.
- toolRequired: refused unless a tool of that type is in the bag.
- Order of checks: tool, Energy (need at least the cost), Hunger is not checked, capacity. Refused attempts change nothing, show the reason, and log a "blocked" event with reason no_tool, no_energy, too_heavy or bag_full.
- Capacity: total bag weight must stay at or below carry kg, and slots (each item type uses ceil(quantity / stack) slots, 12 slots) must not be exceeded. The whole yield is added or nothing is (no partial pickup).
- Success: spend Energy, pass time, add items, give XP (see XP).

### Inventory and storage
- Bag screen shows items with quantity and weight, total weight / carry kg, slots used / 12, and for each item its blurb and friendly kind label. Tapping a food item offers Eat 1 and Eat until Hunger reaches 80.
- Storage (at the Hut only): 40 slots, no weight limit. List with Deposit 1 / Deposit all / Withdraw 1 / Withdraw all. Withdrawing obeys bag capacity. Items in storage are not counted for tool use.
- Recipes use bag items; at the Hut they use bag + storage together.

### Eating
- Eat: food items restore their hunger value, cap at 100, cost 0 Energy and 5 minutes. If Hunger is already 100 refuse ("You are full", log blocked reason full).

### Rest and sleep
- Shelter = the home shelter (state.homeShelter: ground, tent, lean_to, house_bed) if the location is the Hut; anywhere else it is ground.
- Rest: choose 1 to 8 whole hours, or "Sleep until full" (smallest whole number of hours that fills Energy, at least 1, at most 8).
- Recovery: Energy gain per hour = max Energy / rest.hoursToFull[shelter]. Recovery hours counted = min(hours chosen, Hunger / (hunger.perHourAwake x hunger.restFactor)); recovery stops when Hunger reaches 0 but the chosen hours still pass.
- Confirm screen shows: shelter and hours to full, hours chosen, wake time, Energy now -> after, Hunger now -> after, and a warning when Hunger is too low to finish ("Recovery stops after about N hours"). Resting at full Energy is allowed with a note.
- Ground hours to full is 8 and is not tunable.

### Pass out and revival
- You are STUCK when Hunger is 0, you carry no food item, and Energy is below energy.baseActionCost. The check runs after every game command (gather, craft, research, travel, eat, rest), not after debug edits. When stuck, you pass out: 8 game hours pass (resting drain), you wake at the Revival Point (a place with revival: true; only the Hut now), with Energy 40 and Hunger 20 (set, not added). Nothing is lost except time. A save is never rolled back.
- Show a message log entry explaining what happened. Log passOut and meterZero events.
- Build a reusable function revive(reason, placeId) in engine.js: moves to the Revival Point and sets wake values. Combat defeat (1c) will call it. Death losses are decided in 1c.

### Research (data/nodes.json, Tree tab)
- Tree shows nodes as an expandable list: name, state (done, available, locked), requirements still missing, cost in actions, and what it unlocks.
- Research costs nodes.actions x (4 Energy and 10 minutes), paid up front. It can be done anywhere. It gives no XP. Refused if Energy is short (blocked: no_energy).
- A node is available when all its requires.nodes are done and all requires.skills levels are met. Start nodes are done. Nodes with lockedInSlice show locked with their lockNote.
- A recipe is usable only when the node listed in its needsNode is done.

### Crafting and building (data/recipes.json)
- Craft (tools): can be done anywhere. Build: only at the recipe's "at" place; once: true means it can be built once. Cook: at the recipe's place and requires the station (state.built.fire_pit).
- Cost: actions x (4 Energy and 10 minutes), paid up front, no partial progress. Inputs are removed, outputs added (bag capacity checked; refused as too_heavy / bag_full otherwise).
- Build effects (the "sets" field): fire_pit sets built.fire_pit = true; tent sets homeShelter = tent. The Overview "Where" shows the shelter.
- XP: skill gets 10 x taskLevel per action, so a 4-action build gives 40 XP.

### XP and levels
- Skill XP to next level = 40 x max(L,1)^1.5; attribute XP to next = 30 x max(L,1)^1.5 (config.xp). Per action: skill XP = 10 x taskLevel; attribute XP = 3 x taskLevel, split by the skill's percentage split (skills.json). XP carries over; several levels can be gained at once.
- A debug XP multiplier multiplies both.
- When Vitality rises: current HP rises by the same amount as max HP; current Energy is unchanged. When Strength rises, carry kg rises by 1.
- Level-up shows a message log line.

### Advice and "what you can do now"
- advice.js supports rule types meterBelow, carryAbove (carry weight / carry kg above a config fraction), hasNoItem (bag), stateEquals (dotted key such as built.fire_pit). Rules are in data/advice.json. Changed hungry threshold: 40.
- "What you can do now" line: engine.availableActions(state, placeId) returns every action, research, craft, build, cook, rest and storage option at that place with ok or blocked(reason). The line lists the first 3 that are ok in data order, as "You can: Pick berries, Dig roots, Gather sticks." If none: "Nothing to do here right now. Rest, or go somewhere else." Show it on Overview (Where) and at the top of Here.
- Blocked buttons stay visible, greyed, with the reason in small text.

### Save and load
- Autosave to localStorage peepap_save after every state-changing command and when the page becomes hidden (visibilitychange). saveVersion 2. A 1a save (saveVersion 1) must migrate: add inventory {}, storage {}, built {fire_pit: false}, homeShelter ground, research start nodes done, skill XP 0, time 0 (Day 1 06:00). Unknown or newer saveVersion is rejected with a message.
- Manual slots peepap_slot1 to peepap_slot3. Settings > Save / Load lists autosave + 3 slots, each showing name, Day and time, version and real date; buttons Save here (asks before overwriting), Load (asks first), Clear slot (asks first). The Title screen gets a Load button beside Continue. Continue loads the autosave.
- Export/import code PEEPAP1: + base64 stays; import accepts saveVersion 1 or 2 (migrating).
- If storage is full or unavailable show a one-line warning; the game keeps running.
- Loading logs a load event and starts a new metrics segment (game time can go backwards).

## Metrics (Tier A): the game records and reports its own playtest numbers
Purpose: test whether the numbers are workable, efficient and effective. Local only, no network.

### Event log
- Key peepap_events, last 5,000 events, separate from the save. Every event has realMs, gameDay, gameMinute, version, tuningSetId, type.
- Types and fields: session {start|end} (page visible or hidden); tap {screen, controlId, disabled, productive}; action {actionId, skill, taskLevel, energy, minutes, skillXp, attrXp}; craft, research, travel {from, to}; blocked {reason, what}; rest {shelter, hours, untilFull, e0, e1, h0, h1, interrupted}; eat {item, qty, hunger}; levelUp {kind, id, level, sinceMs}; meterZero {meter}; passOut {cause}; milestone {first_gather, first_eat, first_stone_tool, first_fire, first_cook, first_tent, first_sleep_in_tent, skill_5, attribute_1}; note {text} ("note this" button); save {auto|manual|export}; load {slot|import}; debug {kind}.
- "Productive tap" = a tap that starts a gather, craft, build, research, cook, eat or rest command. Every other tap on a control is non-productive.
- Active play time = sum of gaps between consecutive events within a session, each gap capped at metrics.idleGapSec (30). Real-minute metrics use active time only.
- Debug actions are flagged and EXCLUDED from all metrics. Sessions that used the XP multiplier or non-default tuning are marked "tuned".

### metrics.js (pure)
- Reads the event log, config and data/metrics.json; returns for each M1 to M15: measured value, model, band, status (OK, WATCH within 25% outside the band, FLAG beyond, NO DATA with fewer than 3 samples).
- Definitions: M1 real active minutes between level-ups of the same skill (by level); M2 game days between level-ups; M3 actions per game day (days with a ground rest); M4 median seconds between consecutive action events within a session (gaps up to 30 s); M5 non-action taps per game day and productive share; M6 blocked events per game day by reason, plus Energy left at each rest start; M7 for every ground rest of 8 hours started with Hunger of 16 or more: ends at full Energy (any miss is a BUG), plus count of "sleep until full" uses and rests interrupted by Hunger 0; M8 actions per game day on tent / lean-to / bed divided by ground (needs data from both); M9 meterZero events for Hunger per 7 game days, share of awake game time with Hunger under advice.hungryBelow, Hunger drained per game day; M10 share of action events whose action yields food or cooks food; M11 for roast roots vs berries: (hunger gained per Energy spent on the whole chain, gather + cook) divided by the same for berries; M12 real active minutes per attribute level; M13 median session length, actions per session, share of sessions that ended while blocked; M14 taps on disabled controls per session, taps per gather; M15 first-time milestone times (real minutes and game days).
- Model values and bands are in data/metrics.json. Bands are hypotheses.

### Screens
- Settings > Metrics report: header (version, tuningSetId, sessions, active real minutes, game days, any "tuned" flag) then one row per metric: id, measured, model, band, status. Buttons: Copy report (plain text, one metric per line, for pasting into chat) and Reset metrics (asks first).
- Settings > Tuning panel (debug): edit these config values within the ranges given and Reset to defaults / Copy tuning set. Overrides are saved in peepap_tuning and given a tuningSetId ("default" when untouched). Values outside the range are rejected.
  - energy.baseActionCost 2-6; energy.toolCost.stone 1.5-5; energy.travelCost 0-3
  - rest.hoursToFull.tent / lean_to / house_bed 2-8 (ground is locked at 8)
  - hunger.perHourAwake 2-6; hunger.restFactor 0.25-1; advice.hungryBelow 20-80
  - xp.skillBase 20-80; xp.attrBase 15-60; xp.skillPerTaskLevel 5-20; xp.attrPerTaskLevel 1-6
  - start.energy 20 to max; start.hunger 20-100 (apply on New Game only)
  - food hunger values in items.json (berries, wild_roots, roast_roots) within half to double
- Debug menu additions: skip to next 06:00, set Day and time, set Energy, set Hunger, grant any item, XP multiplier (1-20, now active).

## Done when
1. Loads from GitHub Pages on a phone, no horizontal scroll, no console errors; Overview shows version 0.2.0 and the "what you can do now" line.
2. New game, Vitality 3: HP 55, Energy 60 of 89, Hunger 50, Day 1 06:00.
3. Travel from Greywillow to Forest Edge: Energy 59, clock 06:10. Then Pick berries once: Energy 55, +2 berries, clock 06:20, Foraging XP 10, Perception XP 1.8, Agility XP 1.2. (Starting from Energy 60 with no travel, a pick gives Energy 56 and Hunger 49.33.)
4. Starting at Hunger 49.33, eating 2 berries (one Eat command) -> Hunger 61.0 (+12, minus 0.33 drain for the 5 minutes) and the clock advances 5 minutes.
5. Four Gather sticks actions raise Woodcutting to level 2 (40 XP). Gather loose stones gives 3 stones. Chop small log is refused without an axe (reason shown), works with a Stone Axe in the bag at 3 Energy.
6. Research Stone Tools (2 actions = 8 Energy, 20 minutes) unlocks Stone Axe and Stone Pickaxe recipes. Tent-building shows missing requirements until Stone Tools is done and Woodcutting is 2.
7. Build Fire Pit at the Campfire Spot (5 stones + 3 sticks, 2 actions); Cook Roast Roots (2 roots + 1 stick -> 2 Roast Roots, 1 action, needs fire pit and Cooking researched). Roast Roots restore 25 Hunger each.
8. Build Tent at the Hut with materials from bag and storage (3 logs + 6 sticks + 4 reeds, 4 actions); Overview shows shelter Tent; the Planning ground_bed advice disappears.
9. Rest checks (Vitality 3, max 89): ground 8 h from Energy 56 and Hunger 61 -> Energy 89, Hunger 45; ground 4 h from Energy 0 and Hunger 40 -> Energy 44.5, Hunger 32; tent 6 h from Energy 0 and Hunger 30 -> Energy 89, Hunger 18; ground 8 h from Energy 0: with Hunger 16 -> Energy 89 and Hunger 0; with Hunger 15 -> Energy 83.44. The confirm screen warns before the 15 case.
10. Pass out: with no food in the bag, use debug to set Hunger 0 and Energy 2, then tap Rest (the confirm screen warns) -> you pass out: 8 hours pass, you wake at the Hut with Energy 40 and Hunger 20 and a message log line. Having a food item in the bag prevents it.
11. Carry limit: with Strength 0 (10 kg), picking up stones until the next would pass 10 kg is refused with too_heavy and logged as blocked. Hut storage deposit and withdraw work.
12. Autosave works (reload keeps everything including inventory, built things, research, time). Save to slot 1, change the game, Load slot 1 and see the old state; Clear slot works. A 1a save still loads. Export/import round-trips.
13. Advice: at a fresh start Planning shows no_axe and no_fire (Short) and ground_bed (Medium), and not "hungry" (Hunger 50). Debug set Hunger 30 adds "hungry"; set Hunger 5 adds "starving"; set Energy 20 adds "low energy".
14. Metrics report opens after 10 or more actions and shows rows for M1 to M15 (NO DATA allowed); Copy report works; debug actions are excluded; Reset metrics works. Tuning panel changes a value, creates a tuningSetId, and Reset to defaults restores it.
15. docs/README updated: folder layout, how to add an item, action, recipe, research node or advice rule by editing JSON. docs/BUILD_BRIEF_SLICE1BI.md is a copy of this brief.

## Out of scope (do not build)
Trading and the stall, Elder quest chain and real quest logic, day/night effects, durability, Training Post, combat, tutorial tab locking, fishing, hunting, farming, weather, water use, Energy foods and potions, stomach-upset debuffs, node respawn or depletion, cloth, furniture, lean-to, service worker, offline mode, bot-simulation (Tier B). Ask before adding anything not listed.

## Notes for Claude Code
- Keep files small and well commented for a beginner learning JavaScript. Bump the version to 0.2.0 in config.json.
- Put the rules in pure engine.js functions that take a state and a config and return a new state plus messages, so they can be tested without a browser.
- If Node is available, add tests/engine.test.mjs that checks the numbers in Done-when items 2, 3, 4, 9 and 10, and report the results in your summary. Tests are not part of the shipped site.
- When done: a short summary, test steps for a phone, and anything you were unsure about. Open a pull request only.

## Data appendix (save as data/*.json exactly)

### data/config.json (REPLACES the 1a file; 1a values kept)
```json
{"version":"0.2.0","saveKey":"peepap_save","slotKeys":["peepap_slot1","peepap_slot2","peepap_slot3"],"eventsKey":"peepap_events","tuningKey":"peepap_tuning","notesKey":"peepap_notes","saveVersion":2,"start":{"day":1,"time":"06:00","money":20,"energy":60,"hunger":50,"homeShelter":"ground","revivalPlace":"hut"},"meters":{"hpBase":40,"hpPerVit":5,"energyBase":80,"energyPerVit":3,"hungerMax":100,"carryBaseKg":10,"carryPerStr":1},"creation":{"freePoints":10,"maxPerAttrFromFree":4},"quests":{"maxAccepted":8},"xp":{"skillBase":40,"attrBase":30,"exponent":1.5,"skillPerTaskLevel":10,"attrPerTaskLevel":3,"multiplier":1},"time":{"actionMinutes":10,"travelMinutes":10,"eatMinutes":5},"energy":{"baseActionCost":4,"toolCost":{"none":4,"stone":3,"copper":2.5,"iron":2},"travelCost":1,"eatCost":0},"rest":{"hoursToFull":{"ground":8,"tent":6,"lean_to":5,"house_bed":4},"minHours":1,"maxHours":8,"groundLocked":true,"fullNightMinHunger":16},"hunger":{"perHourAwake":4,"restFactor":0.5},"revival":{"passOutHours":8,"wakeEnergy":40,"wakeHunger":20},"inventory":{"bagSlots":12,"stack":20,"storageSlots":40},"advice":{"hungryBelow":40,"starvingBelow":10,"lowEnergyBelow":30,"bagFullFraction":0.9},"metrics":{"maxEvents":5000,"idleGapSec":30,"minSamples":3},"eatUntilHunger":80,"ui":{"textSizes":[14,16,18,20],"defaultTextSize":16,"defaultTheme":"dark"}}
```

### data/items.json
```json
[{"id":"berries","name":"Wild Berries","kind":"food","weightKg":0.1,"stack":20,"hunger":6,"blurb":"Small, sweet, not very filling."},
{"id":"wild_roots","name":"Wild Roots","kind":"food","weightKg":0.3,"stack":20,"hunger":5,"blurb":"Bitter when raw. Much better roasted."},
{"id":"roast_roots","name":"Roast Roots","kind":"food","weightKg":0.3,"stack":20,"hunger":25,"blurb":"Warm and filling."},
{"id":"stick","name":"Stick","kind":"resource","weightKg":0.2,"stack":20,"blurb":"Dry wood. Useful for almost everything."},
{"id":"loose_stone","name":"Loose Stone","kind":"resource","weightKg":1,"stack":20,"blurb":"A fist-sized stone."},
{"id":"soft_stone","name":"Soft Stone","kind":"resource","weightKg":2,"stack":20,"blurb":"Needs a pickaxe. No use yet."},
{"id":"small_log","name":"Small Log","kind":"resource","weightKg":2,"stack":20,"blurb":"Needs an axe to cut."},
{"id":"reed_bundle","name":"Reed Bundle","kind":"resource","weightKg":0.2,"stack":20,"blurb":"Cut at the stream. Binds and roofs."},
{"id":"stone_axe","name":"Stone Axe","kind":"tool","weightKg":1.5,"stack":1,"toolType":"axe","tier":"stone","blurb":"Cheaper wood work. Needed for logs."},
{"id":"stone_pickaxe","name":"Stone Pickaxe","kind":"tool","weightKg":2,"stack":1,"toolType":"pickaxe","tier":"stone","blurb":"Cheaper stone work. Needed for soft stone."}]
```

### data/actions.json
```json
[{"id":"pick_berries","name":"Pick berries","at":"forest_edge","skill":"foraging","taskLevel":1,"yield":{"berries":2}},
{"id":"dig_roots","name":"Dig roots","at":"forest_edge","skill":"foraging","taskLevel":1,"yield":{"wild_roots":2}},
{"id":"gather_sticks","name":"Gather sticks","at":"forest_edge","skill":"woodcutting","taskLevel":1,"yield":{"stick":4},"toolType":"axe"},
{"id":"chop_log","name":"Chop small log","at":"forest_edge","skill":"woodcutting","taskLevel":1,"yield":{"small_log":1},"toolType":"axe","toolRequired":true},
{"id":"gather_stones","name":"Gather loose stones","at":"stone_pile","skill":"mining","taskLevel":1,"yield":{"loose_stone":3},"toolType":"pickaxe"},
{"id":"mine_soft_stone","name":"Mine soft stone","at":"stone_pile","skill":"mining","taskLevel":1,"yield":{"soft_stone":1},"toolType":"pickaxe","toolRequired":true},
{"id":"cut_reeds","name":"Cut reeds","at":"stream","skill":"foraging","taskLevel":1,"yield":{"reed_bundle":2}}]
```

### data/nodes.json
```json
[{"id":"foraging","name":"Foraging","state":"done","start":true,"requires":{},"actions":0,"unlocks":[]},
{"id":"woodcutting","name":"Woodcutting","state":"done","start":true,"requires":{},"actions":0,"unlocks":[]},
{"id":"mining","name":"Mining","state":"done","start":true,"requires":{},"actions":0,"unlocks":[]},
{"id":"stone_tools","name":"Stone Tools","requires":{"skills":{"woodcutting":1,"mining":1}},"actions":2,"unlocks":["stone_axe","stone_pickaxe"]},
{"id":"fire_making","name":"Fire-making","requires":{"skills":{"foraging":1}},"actions":1,"unlocks":["fire_pit"]},
{"id":"cooking","name":"Cooking","requires":{"nodes":["fire_making"]},"actions":1,"unlocks":["roast_roots"]},
{"id":"tent_building","name":"Tent-building","requires":{"nodes":["stone_tools"],"skills":{"woodcutting":2}},"actions":3,"unlocks":["tent"]},
{"id":"lean_to","name":"Lean-to","requires":{"nodes":["tent_building"],"skills":{"woodcutting":4}},"actions":4,"unlocks":[],"lockedInSlice":true,"lockNote":"Comes in a later slice"}]
```

### data/recipes.json
```json
[{"id":"stone_axe","name":"Stone Axe","kind":"craft","skill":"carpentry","taskLevel":1,"actions":1,"inputs":{"stick":2,"loose_stone":2},"outputs":{"stone_axe":1},"needsNode":"stone_tools"},
{"id":"stone_pickaxe","name":"Stone Pickaxe","kind":"craft","skill":"carpentry","taskLevel":1,"actions":1,"inputs":{"stick":2,"loose_stone":3},"outputs":{"stone_pickaxe":1},"needsNode":"stone_tools"},
{"id":"fire_pit","name":"Fire Pit","kind":"build","skill":"carpentry","taskLevel":1,"actions":2,"inputs":{"loose_stone":5,"stick":3},"sets":{"built.fire_pit":true},"at":"campfire","needsNode":"fire_making","once":true},
{"id":"tent","name":"Tent","kind":"build","skill":"carpentry","taskLevel":1,"actions":4,"inputs":{"small_log":3,"stick":6,"reed_bundle":4},"sets":{"homeShelter":"tent"},"at":"hut","needsNode":"tent_building","once":true,"useStorage":true},
{"id":"roast_roots","name":"Roast Roots","kind":"cook","skill":"cooking","taskLevel":1,"actions":1,"inputs":{"wild_roots":2,"stick":1},"outputs":{"roast_roots":2},"station":"fire_pit","at":"campfire","needsNode":"cooking"}]
```

### data/advice.json (REPLACES the 1a file)
```json
[{"id":"starving","when":{"type":"meterBelow","meter":"hunger","configKey":"starvingBelow"},"text":"You are starving. Eat now or you may pass out.","horizon":"immediate"},
{"id":"hungry","when":{"type":"meterBelow","meter":"hunger","configKey":"hungryBelow"},"text":"You are hungry. Pick berries or dig roots at the Forest Edge.","horizon":"immediate"},
{"id":"low_energy","when":{"type":"meterBelow","meter":"energy","configKey":"lowEnergyBelow"},"text":"Energy is low. Rest soon.","horizon":"immediate"},
{"id":"bag_full","when":{"type":"carryAbove","configKey":"bagFullFraction"},"text":"Your bag is nearly full. Store items at your Hut.","horizon":"immediate"},
{"id":"no_axe","when":{"type":"hasNoItem","item":"stone_axe"},"text":"No stone axe. Research Stone Tools in the Tree tab, then craft one.","horizon":"short"},
{"id":"no_fire","when":{"type":"stateEquals","key":"built.fire_pit","value":false},"text":"No fire pit. Research Fire-making, then build one at the Campfire Spot.","horizon":"short"},
{"id":"ground_bed","when":{"type":"stateEquals","key":"homeShelter","value":"ground"},"text":"You sleep on the ground. A tent at your Hut helps you rest faster.","horizon":"medium"}]
```

### data/metrics.json
```json
[{"id":"M1","name":"Real minutes per skill level-up (levels 1-2, 4-5, 10-11)","unit":"min","model":{"1-2":0.5,"4-5":3.7,"10-11":14.6},"okMin":0.25,"okMax":5,"flagBelow":0.25,"flagAbove":10,"note":"band for levels below 5; level 10 band 8-25"},
{"id":"M2","name":"Game days per skill level-up","unit":"days","model":{"1-5":1.5,"10-11":2.8},"okMin":null,"okMax":null,"flagBelow":null,"flagAbove":null,"note":"within 30% of model OK; flag over 2x"},
{"id":"M3","name":"Actions per game day on ground","unit":"actions","model":45.6,"okMin":35,"okMax":55,"flagBelow":30,"flagAbove":70,"note":""},
{"id":"M4","name":"Median real seconds per action tap","unit":"s","model":6,"okMin":3,"okMax":10,"flagBelow":null,"flagAbove":null,"note":"calibration only"},
{"id":"M5","name":"Non-action taps per game day / productive-tap share","unit":"taps / %","model":{"taps":7,"share":87},"okMin":null,"okMax":25,"flagBelow":null,"flagAbove":40,"note":"share OK at least 60, flag under 45"},
{"id":"M6","name":"Blocked actions per game day (no_energy, hunger_zero, no_tool, too_heavy, bag_full)","unit":"count","model":0,"okMin":0,"okMax":3,"flagBelow":null,"flagAbove":5,"note":""},
{"id":"M7","name":"Rest quality: 8h ground rest with Hunger of 16 or more ends at full Energy","unit":"%","model":100,"okMin":100,"okMax":100,"flagBelow":100,"flagAbove":null,"note":"any miss is a BUG; also count rests interrupted by Hunger 0"},
{"id":"M8","name":"Shelter benefit: actions per day vs ground","unit":"x","model":{"tent":1.21,"bed":1.52},"okMin":1.1,"okMax":2.0,"flagBelow":1.05,"flagAbove":2.0,"note":""},
{"id":"M9","name":"Hunger health: zero events per 7 days; share of awake time under hungry threshold; Hunger drained per day","unit":"count / % / pts","model":{"zeros":0,"drain":63.2},"okMin":0,"okMax":1,"flagBelow":null,"flagAbove":3,"note":"flag if under-threshold share over 70"},
{"id":"M10","name":"Food effort: share of actions spent getting food","unit":"%","model":{"berries":11.5,"roast":5.5},"okMin":3,"okMax":25,"flagBelow":3,"flagAbove":35,"note":""},
{"id":"M11","name":"Cooking payoff: Hunger per Energy (gather + cook) roast vs berries","unit":"x","model":2.08,"okMin":2.0,"okMax":null,"flagBelow":1.5,"flagAbove":null,"note":""},
{"id":"M12","name":"Attribute pace: real minutes per attribute level (0-1, 0-5, 5-10)","unit":"min","model":{"0-1":1.9,"0-5":34.7,"5-10":181},"okMin":null,"okMax":null,"flagBelow":null,"flagAbove":480,"note":"0-5 band 20-90 min; 5-10 band 120-360 min"},
{"id":"M13","name":"Session shape: median session length, actions per session, share of quits while blocked","unit":"%","model":null,"okMin":null,"okMax":40,"flagBelow":null,"flagAbove":40,"note":""},
{"id":"M14","name":"UI friction: taps on disabled controls per session; taps per gather","unit":"count","model":{"disabled":0,"tapsPerGather":1},"okMin":null,"okMax":5,"flagBelow":null,"flagAbove":10,"note":""},
{"id":"M15","name":"Milestone times (real minutes, game days)","unit":"min","model":null,"okMin":null,"okMax":null,"flagBelow":null,"flagAbove":null,"note":"collect only"}]
```

### data/typeLabels.json
```json
{"food":"Food","resource":"Material","tool":"Tool","storage":"Storage","board":"Board","lore":"Record","station":"Station"}
```
