---
title: Build Brief - Slice 1a v3 (Shell)
type: build-brief
slice: 1a
status: beta
supersedes: "[[2026-10-27 Build Brief Slice 1a v2]]"
created: 2026-10-27
tags: [peepap, build, beta]
---

# Build Brief - Slice 1a v3: "Shell"

## Goal
A phone-portrait web app "Peepap - The RPG": start a game, create a character, see the Overview dashboard, and tap between every screen with two-way links back to Overview. Placeholder content only: nothing is gathered, crafted, trained or fought; time does not pass; no XP is earned. Version 0.1.0.

## Source-of-truth rules (read first)
- ALL names, numbers and text come from this brief and the data appendix at the bottom. Do not invent lore, names, quests, items or numbers. If something is missing, ASK.
- Entries with "placeholderName": true are stand-in names to be replaced later. Keep them as data so renaming = editing JSON.
- config.json values marked as placeholders (travel minutes, recommended level, hungry threshold) are untested guesses.
- Save the data appendix JSON blocks exactly as data/*.json.

## Tech rules
- Vanilla HTML, CSS, JavaScript (ES modules). No framework, no build step.
- Layout: index.html, styles.css, manifest.webmanifest, src/ (state.js, engine.js, ui.js, save.js, advice.js), data/ (config.json, attributes.json, skills.json, places.json, quests.json, advice.json), docs/.
- ALL content in data/*.json. engine.js and advice.js are pure logic, no DOM. ui.js renders from state.
- RELATIVE paths everywhere (site is served from a /peepap-rpg/ sub-path on GitHub Pages).
- One VERSION constant (from config.json) shown on Overview; bump every build.
- Mobile portrait first, tap targets at least 44px, dark mode default with a light toggle, adjustable text size.
- NO service worker in 1a. Manifest only.
- Wrap ALL localStorage access in try/catch; if storage is unavailable the app still runs and shows a one-line warning.
- Testing: ES modules and JSON loading do NOT work when index.html is opened straight from a phone or file system. Test only through GitHub Pages or a local web server. Say so in docs/README.

## Always-visible top bar (all in-game screens)
HP, Energy, Hunger, Day and time, location name, buffs (hidden when none), and a Settings gear. May wrap to two lines on narrow phones. The 5 bottom tabs (Overview, Here, Bag, Me, Tree) are all OPEN in 1a (tutorial-based tab locking comes later). Every screen also has an "Overview" button in the same spot.

## Screens
1. Title: "Peepap"; buttons New Game, Continue (disabled if no save), Settings.
2. New Game: name field (default "Traveler"); backstory text, use EXACTLY: "You wake in a stranger's body: a poor member of the Mo Clan in the village of Greywillow. The one who lived here before you left a debt of grain and labor to the clan. You have 20 copper, bare hands, and a hut with a bed on the ground. Start by surviving."; attribute allocation with + and - buttons (6 attributes from attributes.json, each starts at 0), 10 free points, max 4 per attribute; "Confirm" and "Finish later" (unspent points stay on Me). Confirm -> Overview.
3. Overview: sections Who, Condition, Where, Doing, Planning; message log (collapsible); version number.
   - Who: name, origin "Mo Clan, Greywillow", cultivation "Mortal (no qi yet)", top 3 attributes by level (ties in list order).
   - Condition: HP, Energy, Hunger, injuries "none", buffs "none", warnings "none".
   - Where: Greywillow, shelter "Ground (poor)", "Day 1, 06:00".
   - Doing: last action "Nothing yet"; current focus = active quest title or "None".
   - Planning: active quest pinned on top, then advice suggestions grouped by horizon (Immediate, Short, Medium, Long; hide empty groups), plus a Quests button.
4. Here (Greywillow): header (name, "Recommended level 1", time); People = all 6 people with their POI name in brackets; Places = the 6 POIs; Things = all 7 things with POI name; Go to = the 4 areas with "~10 min (placeholder)"; Activities = shown greyed out ("coming in 1b-i"); locked Map button that says why. Tapping any entry opens a placeholder detail (name, blurb, its own people, things and activities from JSON, "Details come later") with Back and Overview buttons. Tapping an area also opens a placeholder detail (no travel in 1a) containing a "Back to Greywillow" button. Each area has the Back button.
5. Bag and Tree: placeholder screens. Me: see rules below.
6. Quests (from Overview Planning or its Quests button): two lists, Accepted and Available (9 dummy quests from quests.json). Accept moves a quest to Accepted; max 8 accepted (the 9th shows a message and stays Available). The first accepted quest becomes ACTIVE automatically. Tap an accepted quest to make it active. Abandon is allowed for every dummy quest; if the active one is abandoned, the first remaining accepted becomes active, or none.
7. Settings: text size, dark/light toggle, export/import save code, reset save, back to title, "note this" feedback (saves text with real time, version and screen to localStorage key peepap_notes; shown as one copyable text block), debug menu (set day and time, set Hunger, set Energy, reset, XP multiplier placeholder that does nothing yet).

## Me screen and attribute rules
- Me shows: attributes (from attributes.json, with the "drives" text), unspent points with + buttons, the 5 skill groups with ALL 26 skills (open or locked from skills.json; locked ones show unlockNote; open ones show level 1 and "trains in <trainsIn>"), and a Journal link (placeholder).
- Store per attribute: level and freeSpent. In 1a, level = freeSpent. unspent = 10 - sum(freeSpent).
- Max 4 applies to freeSpent ONLY (not to level; levels will grow past 4 later through XP). A + button is enabled only if unspent > 0 and freeSpent < 4. No minus on Me (minus only on the New Game screen before Confirm).
- Max HP = 40 + 5 x Vitality. Max Energy = 80 + 3 x Vitality. When Vitality rises after creation: current HP rises by the same amount as max HP (+5); current Energy does NOT change. Hunger max 100.
- Start values: Day 1, 06:00 (clock shown but does not advance); HP full; Energy 60; Hunger 50 of 100; money 20 copper; shelter ground; tool none. All in config.json.

## Advice (data-driven)
advice.js reads advice.json and the current state and returns the rules that apply. Rule types: meterBelow (meter below a config value), stateEquals (state key equals value). At start 3 rules apply (hungry, no_tool, ground_bed). Adding a rule = adding data.

## Navigation (two-way)
Overview sections: Who -> Me, Condition -> Me, Where -> Here, Doing -> Here, Planning -> Quests. Every screen returns to Overview in one tap. Title -> Overview via New Game or Continue. Settings -> Back to title. Changing the active quest updates Overview immediately.

## Save
Auto-save to localStorage key peepap_save after every action, with saveVersion (1) and a migration stub. Export = text code "PEEPAP1:" + base64 of the save JSON. Import checks the prefix and saveVersion and rejects bad codes with a clear message. Reload keeps character, freeSpent, unspent points, quests (accepted, active), settings and current screen.

## Done when
1. Loads from GitHub Pages on a phone, no horizontal scroll, no console errors; version 0.1.0 shown on Overview.
2. Title -> New Game shows the exact backstory; + and - work; 10 points total, max 4 each enforced; Confirm -> Overview; Finish later leaves unspent points visible on Me.
3. Check numbers: Vitality 0 -> HP 40, Energy 60 of 80. Vitality 4 -> HP 60, Energy 60 of 92. Adding 1 Vitality later on Me: HP +5, max Energy +3, current Energy unchanged.
4. Top bar visible on every in-game screen; gear opens Settings; Settings -> Back to title works.
5. All 5 Overview sections link to their screens; every screen links back; all 5 tabs open.
6. Me lists 6 attributes, 5 groups, 26 skills (9 open, 17 locked with reasons), Journal placeholder; + obeys max 4 and total 10.
7. Quests: accept up to 8; the 9th is refused with a message; first is auto-active; switch active; abandon; Overview Planning updates immediately.
8. Planning at start shows 3 suggestions (hungry Immediate, no tool Short, ground bed Medium). Debug: set Hunger 80 removes "hungry"; set Energy 20 adds "low energy".
9. Here shows 6 POIs, 6 people, 7 things, 4 areas from JSON; detail screens work with Back and Overview; every area has "Back to Greywillow". Map is greyed out and says why.
10. Reload keeps everything. Export/import round-trips a save; a bad code is rejected with a message.
11. docs/README explains folder layout, how to test (Pages or local server only), and how to add a place, person or quest by editing JSON. docs/BUILD_BRIEF_SLICE1A.md is a copy of this brief.

## Out of scope
Gathering, crafting, tools, durability, trading, passing time, day/night effects, XP and levelling, real quest logic, travel, tutorial tab-locking, combat, service worker, offline mode, lore text beyond the backstory.

## Notes for Claude Code
- Ask before adding anything not listed. Keep files small and well commented for a beginner learning JavaScript.
- Bump the version in config.json every build.
- When done: short summary, test steps, the exact steps to enable GitHub Pages (Settings > Pages > deploy from main), and the URL to open on a phone. Expected form: https://cyes27.github.io/peepap-rpg/ (verify once Pages is on).
- Do not merge or push to main. Open a pull request only.

## Data appendix (save as data/*.json exactly)

### data/config.json
```json
{"version":"0.1.0","saveKey":"peepap_save","notesKey":"peepap_notes","saveVersion":1,
"start":{"day":1,"time":"06:00","money":20,"energy":60,"hunger":50,"shelter":"ground","tool":"none"},
"meters":{"hpBase":40,"hpPerVit":5,"energyBase":80,"energyPerVit":3,"hungerMax":100,"carryBaseKg":10,"carryPerStr":1},
"creation":{"freePoints":10,"maxPerAttrFromFree":4},
"quests":{"maxAccepted":8},
"xp":{"skillBase":40,"attrBase":30,"exponent":1.5,"skillPerTaskLevel":10,"attrPerTaskLevel":3,"multiplier":1},
"advice":{"hungryBelow":60,"lowEnergyBelow":30},
"placeholders":{"travelMinutes":10,"recommendedLevel":1},
"ui":{"textSizes":[14,16,18,20],"defaultTextSize":16,"defaultTheme":"dark"}}
```

### data/attributes.json
```json
[
 {"id":"strength","name":"Strength","drives":"melee damage, carry weight, chopping/mining power"},
 {"id":"vitality","name":"Vitality","drives":"max HP, max Energy, defense, hunger resistance, rest recovery"},
 {"id":"agility","name":"Agility","drives":"dodge, action speed, travel time, ranged accuracy"},
 {"id":"perception","name":"Perception","drives":"crit chance, rare finds when foraging, spotting ambushes, extra lore"},
 {"id":"intellect","name":"Intellect","drives":"crafting quality, research/learning speed, recipe discovery, trade pricing"},
 {"id":"spirit","name":"Spirit","drives":"Qi capacity (later), cultivation speed, rest efficiency, willpower in dialogue"}
]
```

### data/skills.json
```json
{"groups":[
 {"id":"gathering","name":"Gathering"},
 {"id":"crafting","name":"Crafting","families":["Processing","Making"]},
 {"id":"martial","name":"Martial"},
 {"id":"social","name":"Social and Leadership"},
 {"id":"lore","name":"Lore and Cultivation"}
],
"skills":[
 {"id":"foraging","name":"Foraging","group":"gathering","state":"open","trainsIn":"1b-i","unlockNote":null,"split":{"perception":60,"agility":40}},
 {"id":"woodcutting","name":"Woodcutting","group":"gathering","state":"open","trainsIn":"1b-i","unlockNote":null,"split":{"strength":60,"vitality":40}},
 {"id":"mining","name":"Mining","group":"gathering","state":"open","trainsIn":"1b-i","unlockNote":null,"split":{"strength":60,"vitality":30,"perception":10}},
 {"id":"fishing","name":"Fishing","group":"gathering","state":"locked","trainsIn":null,"unlockNote":"Slice 2: Foraging 5, or a teacher at the Stream","split":{"perception":40,"agility":30,"spirit":30}},
 {"id":"hunting","name":"Hunting","group":"gathering","state":"locked","trainsIn":null,"unlockNote":"Slice 2: Unarmed 3 or Woodcutting 5, or a hunter or trap manual","split":{"agility":40,"perception":40,"strength":20}},
 {"id":"farming","name":"Farming","group":"gathering","state":"locked","trainsIn":null,"unlockNote":"Slice 3 or later: Foraging 8, or a plot from Elder Mo","split":{"vitality":40,"strength":30,"perception":30}},
 {"id":"cooking","name":"Cooking","group":"crafting","family":"Processing","state":"open","trainsIn":"1b-i","unlockNote":null,"split":{"intellect":50,"perception":50}},
 {"id":"smelting","name":"Smelting","group":"crafting","family":"Processing","state":"locked","trainsIn":null,"unlockNote":"Unlocks in a later slice","split":null},
 {"id":"tanning","name":"Tanning","group":"crafting","family":"Processing","state":"locked","trainsIn":null,"unlockNote":"Unlocks in a later slice","split":null},
 {"id":"carpentry","name":"Carpentry","group":"crafting","family":"Making","state":"open","trainsIn":"1b-i","unlockNote":null,"split":{"intellect":40,"agility":30,"strength":30}},
 {"id":"basic_smithing","name":"Basic Smithing","group":"crafting","family":"Making","state":"open","trainsIn":"2","unlockNote":"Shown, but no content until Slice 2 (needs copper)","split":{"strength":40,"intellect":30,"vitality":30}},
 {"id":"tailoring","name":"Tailoring","group":"crafting","family":"Making","state":"locked","trainsIn":null,"unlockNote":"Unlocks in a later slice","split":{"agility":50,"perception":50}},
 {"id":"alchemy","name":"Alchemy","group":"crafting","family":"Making","state":"locked","trainsIn":null,"unlockNote":"Unlocks in a later slice","split":{"intellect":60,"spirit":40}},
 {"id":"unarmed","name":"Unarmed","group":"martial","state":"open","trainsIn":"1b-ii","unlockNote":null,"split":{"strength":40,"agility":30,"vitality":30},"subskills":["Improvised"]},
 {"id":"blades","name":"Blades","group":"martial","state":"locked","trainsIn":null,"unlockNote":"Unlocks with a weapon or a teacher","split":{"agility":50,"strength":30,"perception":20}},
 {"id":"spears","name":"Spears","group":"martial","state":"locked","trainsIn":null,"unlockNote":"Unlocks with a weapon or a teacher","split":{"strength":40,"agility":40,"perception":20}},
 {"id":"archery","name":"Archery","group":"martial","state":"locked","trainsIn":null,"unlockNote":"Unlocks with a weapon or a teacher","split":{"perception":50,"agility":30,"strength":20}},
 {"id":"defense","name":"Defense","group":"martial","state":"locked","trainsIn":null,"unlockNote":"Unlocks with a weapon or a teacher","split":{"vitality":60,"agility":40}},
 {"id":"trading","name":"Trading","group":"social","state":"open","trainsIn":"1b-ii","unlockNote":null,"split":{"intellect":60,"perception":40}},
 {"id":"persuasion","name":"Persuasion","group":"social","state":"locked","trainsIn":null,"unlockNote":"Unlocks in a later slice","split":{"intellect":50,"spirit":50}},
 {"id":"leadership","name":"Leadership","group":"social","state":"locked","trainsIn":null,"unlockNote":"Unlocks in a later slice","split":{"spirit":60,"intellect":40}},
 {"id":"etiquette","name":"Etiquette","group":"social","state":"locked","trainsIn":null,"unlockNote":"Unlocks in a later slice","split":{"perception":50,"intellect":50}},
 {"id":"basic_medicine","name":"Basic Medicine","group":"lore","state":"open","trainsIn":"2","unlockNote":"Shown, but no training source until Slice 2","split":{"intellect":60,"perception":40}},
 {"id":"meditation","name":"Meditation","group":"lore","state":"locked","trainsIn":null,"unlockNote":"Locked until the first-qi event","split":{"spirit":80,"vitality":20}},
 {"id":"formation_study","name":"Formation study","group":"lore","state":"locked","trainsIn":null,"unlockNote":"Unlocks in a later slice","split":{"intellect":70,"spirit":30}},
 {"id":"qi_techniques","name":"Qi techniques","group":"lore","state":"locked","trainsIn":null,"unlockNote":"Unlocks in a later slice","split":{"spirit":100}}
]}
```

### data/places.json
```json
{"startPlace":"greywillow",
"places":[
 {"id":"greywillow","name":"Greywillow","kind":"hub","parent":null,"recommendedLevel":1,"blurb":"A poor village of the Mo Clan.","exits":[{"to":"forest_edge","minutes":10},{"to":"stone_pile","minutes":10},{"to":"stream","minutes":10},{"to":"village_fields","minutes":10}],"activities":[]},
 {"id":"hut","name":"Your Hut","kind":"poi","parent":"greywillow","blurb":"Sleep on the ground, storage. Where your backstory starts.","exits":[],"activities":["Sleep on the ground","Use storage"]},
 {"id":"clan_hall","name":"Clan Hall","kind":"poi","parent":"greywillow","blurb":"Elder Mo, the main quest board, the clan record. The Training Post is in the yard.","exits":[],"activities":["Talk to Elder Mo","Read the quest board","Train at the Training Post"]},
 {"id":"stall","name":"Village Stall","kind":"poi","parent":"greywillow","blurb":"Buy and sell.","exits":[],"activities":["Buy","Sell"]},
 {"id":"campfire","name":"Campfire Spot","kind":"poi","parent":"greywillow","blurb":"Cooking and rest station. Villagers gather here.","exits":[],"activities":["Cook","Rest"]},
 {"id":"well","name":"Old Well","kind":"poi","parent":"greywillow","blurb":"Water and gossip.","exits":[],"activities":["Fetch water","Listen to gossip"]},
 {"id":"tavern","name":"Small Tavern","kind":"poi","parent":"greywillow","blurb":"Open until 22:00. A message board with odd jobs.","exits":[],"activities":["Talk to guests","Read the message board"]},
 {"id":"forest_edge","name":"Forest Edge","kind":"area","parent":"greywillow","recommendedLevel":1,"blurb":"Forage, sticks, small logs. The first enemy comes in Slice 1c.","exits":[{"to":"greywillow","minutes":10}],"activities":["Forage","Gather sticks and small logs"]},
 {"id":"stone_pile","name":"Stone Pile","kind":"area","parent":"greywillow","recommendedLevel":1,"blurb":"Loose stones, soft stone.","exits":[{"to":"greywillow","minutes":10}],"activities":["Gather stones"]},
 {"id":"stream","name":"Stream","kind":"area","parent":"greywillow","recommendedLevel":1,"blurb":"Fetch water. Fishing unlocks later.","exits":[{"to":"greywillow","minutes":10}],"activities":["Fetch water"]},
 {"id":"village_fields","name":"Village Fields","kind":"area","parent":"greywillow","recommendedLevel":1,"blurb":"Odd jobs for clansfolk (small pay). Farming later.","exits":[{"to":"greywillow","minutes":10}],"activities":["Do odd jobs"]}
],
"people":[
 {"id":"elder_mo","name":"Elder Mo","role":"quest_giver","at":"clan_hall","placeholderName":false},
 {"id":"clan_guard","name":"Clan Guard","role":"guard (teaches basics later)","at":"clan_hall","placeholderName":true},
 {"id":"stall_keeper","name":"Stall Keeper","role":"shopkeeper","at":"stall","placeholderName":true},
 {"id":"water_carrier","name":"Water Carrier","role":"villager","at":"well","placeholderName":true},
 {"id":"tavern_keeper","name":"Tavern Keeper","role":"shopkeeper","at":"tavern","placeholderName":true},
 {"id":"traveler","name":"Traveler","role":"guest (hints at the outside world)","at":"tavern","placeholderName":true}
],
"things":[
 {"id":"storage","name":"Storage","type":"storage","at":"hut"},
 {"id":"quest_board","name":"Quest Board","type":"board","at":"clan_hall"},
 {"id":"clan_record","name":"Clan Record","type":"lore","at":"clan_hall"},
 {"id":"training_post","name":"Training Post","type":"station","at":"clan_hall"},
 {"id":"campfire_station","name":"Campfire","type":"station","at":"campfire"},
 {"id":"well_water","name":"Well Water","type":"resource","at":"well"},
 {"id":"message_board","name":"Message Board","type":"board","at":"tavern"}
]}
```

### data/quests.json
```json
[
 {"id":"q01","title":"Dummy Quest 1","horizon":"immediate","summary":"Placeholder quest for testing the Quests screen.","abandonable":true},
 {"id":"q02","title":"Dummy Quest 2","horizon":"short","summary":"Placeholder quest for testing the Quests screen.","abandonable":true},
 {"id":"q03","title":"Dummy Quest 3","horizon":"medium","summary":"Placeholder quest for testing the Quests screen.","abandonable":true},
 {"id":"q04","title":"Dummy Quest 4","horizon":"long","summary":"Placeholder quest for testing the Quests screen.","abandonable":true},
 {"id":"q05","title":"Dummy Quest 5","horizon":"immediate","summary":"Placeholder quest for testing the Quests screen.","abandonable":true},
 {"id":"q06","title":"Dummy Quest 6","horizon":"short","summary":"Placeholder quest for testing the Quests screen.","abandonable":true},
 {"id":"q07","title":"Dummy Quest 7","horizon":"medium","summary":"Placeholder quest for testing the Quests screen.","abandonable":true},
 {"id":"q08","title":"Dummy Quest 8","horizon":"long","summary":"Placeholder quest for testing the Quests screen.","abandonable":true},
 {"id":"q09","title":"Dummy Quest 9","horizon":"immediate","summary":"Placeholder quest for testing the Quests screen.","abandonable":true}
]
```

### data/advice.json
```json
[
 {"id":"hungry","when":{"type":"meterBelow","meter":"hunger","configKey":"hungryBelow"},"text":"You are hungry. Find something to eat.","horizon":"immediate"},
 {"id":"low_energy","when":{"type":"meterBelow","meter":"energy","configKey":"lowEnergyBelow"},"text":"Energy is low. Rest before you act.","horizon":"immediate"},
 {"id":"no_tool","when":{"type":"stateEquals","key":"tool","value":"none"},"text":"You have only bare hands. A stone tool would help.","horizon":"short"},
 {"id":"ground_bed","when":{"type":"stateEquals","key":"shelter","value":"ground"},"text":"You sleep on the ground. A tent would help you rest.","horizon":"medium"}
]
```
