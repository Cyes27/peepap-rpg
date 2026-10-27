# Peepap - The RPG (developer notes)

A phone-portrait, text-based cultivation RPG. Plain HTML, CSS and JavaScript
(ES modules). No framework, no build step.

Current build: **Slice 1a "Shell"**, version in `data/config.json`.
The full brief is in [BUILD_BRIEF_SLICE1A.md](BUILD_BRIEF_SLICE1A.md).

## Folder layout

```
index.html              The page. Loads styles.css and src/ui.js.
styles.css              All styling (dark default, light theme, phone first).
manifest.webmanifest    App name and colours (no service worker yet).
src/
  ui.js       Entry point. Loads data, draws screens, handles taps. Only file that touches the page (DOM).
  state.js    Builds a new save / new character; works out max HP, max Energy, unspent points, top attributes.
  engine.js   Game rules: add attribute point, accept / abandon / switch quests, debug setters.
  advice.js   Reads data/advice.json and returns the suggestions that apply right now.
  save.js     localStorage (always inside try/catch), export / import codes, feedback notes.
data/
  config.json      Version, start values, formulas, limits, UI options.
  attributes.json  The 6 attributes.
  skills.json      5 skill groups and 26 skills (open or locked).
  places.json      Places (hub, points of interest, areas), people and things.
  quests.json      Quests (9 dummy quests for now).
  advice.json      Planning suggestions and when they appear.
docs/
  README.md                 This file.
  BUILD_BRIEF_SLICE1A.md    Copy of the Slice 1a brief.
```

Rule of thumb: **content lives in `data/*.json`, logic lives in `src/`.**
`engine.js`, `state.js` and `advice.js` never touch the page; `ui.js` draws
everything from the state.

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

The save lives in your browser's localStorage under `peepap_save`; feedback
notes under `peepap_notes`. Settings > Reset save wipes the save.

## How to add content by editing JSON

Keep the JSON valid (commas between items, double quotes). Reload the page
after saving the file. Use a JSON checker if the game stops loading.

### Add a place

Add an object to `"places"` in `data/places.json`.

- A **point of interest** inside Greywillow (shows under Here > Places):
  ```json
  {"id":"shrine","name":"Small Shrine","kind":"poi","parent":"greywillow","blurb":"...","exits":[],"activities":["Pray"]}
  ```
- An **area** you can go to (shows under Here > Go to): add the area with
  `"kind":"area"` and `"parent":"greywillow"`, then add an exit to it in
  Greywillow's `"exits"` list, e.g. `{"to":"shrine_path","minutes":10}`.

`id` must be unique, lowercase, no spaces.

### Add a person

Add an object to `"people"` in `data/places.json`. `"at"` is the id of the
point of interest where they stand:
```json
{"id":"herbalist","name":"Herbalist","role":"villager","at":"well","placeholderName":true}
```
Set `"placeholderName": true` if the name is a stand-in to rename later.

### Add a thing

Add to `"things"` in `data/places.json`:
```json
{"id":"old_bench","name":"Old Bench","type":"station","at":"campfire"}
```

### Add a quest

Add an object to `data/quests.json`. `horizon` is one of `immediate`,
`short`, `medium`, `long`:
```json
{"id":"q10","title":"New Quest","horizon":"short","summary":"What to do.","abandonable":true}
```

### Add a planning suggestion

Add a rule to `data/advice.json`. Two rule types exist:
- `meterBelow`: `{"type":"meterBelow","meter":"energy","configKey":"lowEnergyBelow"}`
  (the threshold number lives in `config.json` under `advice`).
- `stateEquals`: `{"type":"stateEquals","key":"tool","value":"none"}`.

## Each build

Bump `"version"` in `data/config.json`. If the save format changes, raise
`"saveVersion"` and add an upgrade step in `migrate()` in `src/save.js`.
