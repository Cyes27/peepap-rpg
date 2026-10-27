# Peepap - The RPG (developer notes)

A phone-portrait, text-based cultivation RPG. Plain HTML, CSS and JavaScript
(ES modules). No framework, no build step.

Current build: **Slice 1b-i "Core Loop"**, version in `data/config.json` (0.2.0).
Briefs: [BUILD_BRIEF_SLICE1BI.md](BUILD_BRIEF_SLICE1BI.md) (this slice) and
[BUILD_BRIEF_SLICE1A.md](BUILD_BRIEF_SLICE1A.md) (the shell it builds on).

## Folder layout

```
index.html              The page. Loads styles.css and src/ui.js.
styles.css              All styling (dark default, light theme, phone first).
manifest.webmanifest    App name and colours (no service worker).
src/
  ui.js         Entry point: loads data, restores the save, handles taps, logs sessions.
  app.js        Shared UI state (save, event log, navigation) and helpers.
  ui-game.js    In-game screens: Overview, Here, Bag, Storage, Rest, Me, Tree, Quests.
  ui-system.js  Title, New Game, Settings, Save / Load, Metrics report, Tuning, Debug.
  state.js      New game, migration of 1a games, derived values (max HP, carry kg,
                bag weight, slots, clock), place helpers. Pure.
  engine.js     Game rules: gather, eat, travel, rest, pass out / revive, research,
                craft / build / cook, storage, XP, "what you can do now", debug. Pure.
  advice.js     Reads data/advice.json and returns the suggestions that apply. Pure.
  metrics.js    Turns the event log into the Metrics report (M1 to M15). Pure.
  tuning.js     Builds the "world" (data + tuning overrides); Tuning panel ranges. Pure.
  save.js       localStorage (always inside try/catch): autosave, slots, export /
                import, migration, notes, small JSON values.
data/
  config.json      Version, start values, formulas, costs, limits, UI options.
  attributes.json  The 6 attributes.
  skills.json      Skill groups and skills (open or locked) with attribute XP splits.
  places.json      Places (hub, points of interest, areas), people and things.
  items.json       Items: food, materials, tools.
  actions.json     Gathering actions at areas.
  nodes.json       Research nodes (the Tree tab).
  recipes.json     Craft, build and cook recipes.
  advice.json      Planning suggestions and when they appear.
  quests.json      Quests (dummy quests for now).
  typeLabels.json  Friendly labels for item kinds and thing types.
  metrics.json     Model values and bands for the Metrics report.
docs/
  README.md                  This file.
  BUILD_BRIEF_SLICE1A.md     Copy of the Slice 1a brief.
  BUILD_BRIEF_SLICE1BI.md    Copy of the Slice 1b-i brief.
tests/
  engine.test.mjs  Node tests for the rules (not part of the shipped site).
```

Rule of thumb: **content lives in `data/*.json`, logic lives in `src/`.**
`engine.js`, `state.js`, `advice.js`, `metrics.js` and `tuning.js` never touch
the page; `ui*.js` draw everything from the state.

Every engine command takes `(state, W, ...)` and returns
`{ state, ok, reason, messages, events }` with a NEW state, so the rules can
be tested without a browser. `W` is the "world": the config and all data
files, with any tuning overrides applied.

## How to test

ES modules and loading JSON **do not work** if you open `index.html` straight
from your phone or by double-clicking the file (`file://`). Use one of these:

1. **GitHub Pages** (best for phone testing): open
   `https://cyes27.github.io/peepap-rpg/` once Pages is enabled.
2. **Local web server** on a computer, from the project folder:
   ```
   python3 -m http.server 8000
   ```
   then open `http://localhost:8000/`.

If you see "Could not load game data", you are probably on `file://`.

**Rule tests** (needs Node 18 or newer), from the project folder:
```
node --test tests/engine.test.mjs
```

### What is stored in the browser (localStorage)

| Key | What |
|---|---|
| `peepap_save` | Autosave (after every tap and when the page is hidden) |
| `peepap_slot1` to `peepap_slot3` | Manual save slots (Settings > Save / Load) |
| `peepap_events` | Playtest event log, last 5,000 events (Settings > Metrics report) |
| `peepap_tuning` | Tuning panel overrides |
| `peepap_notes` | "Note this" feedback |

Settings > Reset save wipes the autosave only. Settings > Metrics report >
Reset metrics wipes the event log.

## How to add content by editing JSON

Keep the JSON valid (commas between items, double quotes). Reload the page
after saving the file. Use a JSON checker if the game stops loading.
`id` values must be unique, lowercase, no spaces.

### Add an item

Add an object to `data/items.json`. `kind` is `food`, `resource` or `tool`
(the label shown comes from `data/typeLabels.json`).
```json
{"id":"mushroom","name":"Mushroom","kind":"food","weightKg":0.1,"stack":20,"hunger":4,"blurb":"Earthy. Probably safe."}
```
- Food needs `"hunger"` (how much Hunger one restores).
- Tools need `"toolType"` (e.g. `"axe"`) and `"tier"` (a key of
  `energy.toolCost` in config.json, e.g. `"stone"`). Carrying a tool in the
  bag is enough; the cheapest tool of the right type is used.

### Add a gathering action

Add an object to `data/actions.json`. `at` is the place id where it shows.
```json
{"id":"pick_mushrooms","name":"Pick mushrooms","at":"forest_edge","skill":"foraging","taskLevel":1,"yield":{"mushroom":2}}
```
- `"toolType":"axe"` makes an axe in the bag lower the Energy cost.
- `"toolRequired":true` refuses the action without that tool.
- Cost: `energy.baseActionCost` (or the tool's cost), `time.actionMinutes`.
  XP: `xp.skillPerTaskLevel x taskLevel` to the skill, and
  `xp.attrPerTaskLevel x taskLevel` split over attributes by the skill's
  `split` in skills.json.

### Add a recipe (craft, build or cook)

Add an object to `data/recipes.json`.
```json
{"id":"stone_knife","name":"Stone Knife","kind":"craft","skill":"carpentry","taskLevel":1,"actions":1,"inputs":{"stick":1,"loose_stone":1},"outputs":{"stone_knife":1},"needsNode":"stone_tools"}
```
- `kind`: `craft` (anywhere), `build` (only at `"at"`), `cook` (at `"at"`
  and needs `"station"`, e.g. `"fire_pit"` = `built.fire_pit` is true).
- `needsNode`: the research node that must be done first.
- Builds use `"sets"` instead of outputs, e.g. `{"built.fire_pit":true}` or
  `{"homeShelter":"tent"}`, plus `"once":true` to allow building only once.
- Cost: `actions x (energy.baseActionCost Energy and time.actionMinutes)`.
- At the Hut, recipes use bag + storage together.
- Also add the recipe id to the `unlocks` list of its node (shown in Tree).

### Add a research node

Add an object to `data/nodes.json`:
```json
{"id":"knapping","name":"Knapping","requires":{"nodes":["stone_tools"],"skills":{"mining":2}},"actions":2,"unlocks":["stone_knife"]}
```
`"start":true` makes it done from the beginning. `"lockedInSlice":true` with a
`"lockNote"` shows it locked.

### Add a planning suggestion (advice rule)

Add a rule to `data/advice.json`. `horizon` is `immediate`, `short`,
`medium` or `long`. Rule types:
- `meterBelow`: `{"type":"meterBelow","meter":"energy","configKey":"lowEnergyBelow"}`
  (the threshold lives in `config.json` under `advice`).
- `carryAbove`: `{"type":"carryAbove","configKey":"bagFullFraction"}` (bag
  weight / carry kg above that fraction).
- `hasNoItem`: `{"type":"hasNoItem","item":"stone_axe"}` (none in the bag).
- `stateEquals`: `{"type":"stateEquals","key":"built.fire_pit","value":false}`
  (dotted keys reach inside the game state).

### Add a place, person, thing or quest

- **Point of interest** inside Greywillow (Here > Places; walking there is free):
  ```json
  {"id":"shrine","name":"Small Shrine","kind":"poi","parent":"greywillow","blurb":"...","exits":[],"activities":["Pray"]}
  ```
- **Area** (10 minutes and 1 Energy from Greywillow): add it with
  `"kind":"area"` and `"parent":"greywillow"`, then add an exit to it in
  Greywillow's `"exits"` list, e.g. `{"to":"shrine_path","minutes":10}`.
- `"revival": true` marks the Revival Point (only the Hut now).
- **Person** (`"people"` in places.json, `"at"` = a point of interest):
  `{"id":"herbalist","name":"Herbalist","role":"villager","at":"well","placeholderName":true}`
- **Thing** (`"things"`): `{"id":"old_bench","name":"Old Bench","type":"station","at":"campfire"}`
- **Quest** (data/quests.json): `{"id":"q10","title":"New Quest","horizon":"short","summary":"What to do.","abandonable":true}`

Place activities (the text list in places.json) with no live action yet show
greyed "coming in 1b-ii". The list of activities that are live is
`LIVE_ACTIVITIES` in `src/ui-game.js`.

## Metrics (Tier A)

The game logs events locally (`peepap_events`) and Settings > Metrics report
turns them into M1 to M15 against the models and bands in
`data/metrics.json`. Copy report gives plain text for pasting into chat.
Debug actions are excluded; sessions with an XP multiplier or tuning
overrides are marked "tuned". Exact definitions are in `src/metrics.js`.

The Tuning panel (Settings > Tuning panel) changes a fixed list of config
numbers within allowed ranges (`TUNING_FIELDS` in `src/tuning.js`). Each
set of changes gets a `tuningSetId`; "default" means untouched.

## Each build

Bump `"version"` in `data/config.json`. If the save format changes, raise
`"saveVersion"` and add an upgrade step in `migrate()` in `src/save.js`.
