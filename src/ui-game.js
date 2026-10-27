// ui-game.js
// In-game screens (Overview, Here, Bag, Storage, Rest, Me, Tree, Quests,
// Journal, details) and what their buttons do. Each screen is a function
// returning an HTML string; each action changes the state through engine.js.

import {
  maxHp, maxEnergy, unspentPoints, topAttributes, dayTime, carryKg, weightOf, slotsOf,
  xpToNext, hubId, inVillage, storagePlace,
} from "./state.js";
import * as engine from "./engine.js";
import { adviceByHorizon, HORIZONS } from "./advice.js";
import { App, esc, btn, cmdBtn, game, place, item, cfg, r0, go, goRoot, run } from "./app.js";

const TABS = [
  ["overview", "Overview"],
  ["here", "Here"],
  ["bag", "Bag"],
  ["me", "Me"],
  ["tree", "Tree"],
];
export const SHELTER_LABELS = { ground: "Ground (poor)", tent: "Tent", lean_to: "Lean-to", house_bed: "House bed" };
const HORIZON_LABELS = { immediate: "Immediate", short: "Short", medium: "Medium", long: "Long" };

// Place activities (places.json text) that now have live actions. The rest
// stay greyed until Slice 1b-ii.
const LIVE_ACTIVITIES = ["Sleep on the ground", "Use storage", "Cook", "Rest", "Forage", "Gather sticks and small logs", "Gather stones"];

const kindLabel = (kind) => App.D.typeLabels[kind] || "Other";

// ---------- Shared pieces of in-game screens ----------

function topBar() {
  const g = game();
  const buffs = g.buffs.length ? `<span class="stat">Buffs: ${esc(g.buffs.join(", "))}</span>` : "";
  return `<header class="topbar">
    <div class="stats">
      <span class="stat">HP ${r0(g.hp)}/${maxHp(cfg(), g)}</span>
      <span class="stat">Energy ${r0(g.energy)}/${maxEnergy(cfg(), g)}</span>
      <span class="stat">Hunger ${r0(g.hunger)}/${cfg().meters.hungerMax}</span>
      <span class="stat">${dayTime(cfg(), g)}</span>
      <span class="stat">${esc(place(g.location).name)}</span>
      ${buffs}
    </div>
    <button type="button" class="gear" data-act="openSettings" aria-label="Settings">⚙</button>
  </header>`;
}

// The row under the top bar: Overview button always in the same spot,
// plus Back on screens that have somewhere to go back to.
function navRow(showBack) {
  return `<div class="navrow">
    ${btn("Overview", "toOverview", 'class="nav-overview"')}
    ${showBack ? btn("‹ Back", "back") : ""}
  </div>`;
}

function tabs(current) {
  return `<nav class="tabs">${TABS.map(
    ([id, label]) => `<button type="button" data-act="tab" data-id="${id}" class="${id === current ? "current" : ""}">${label}</button>`
  ).join("")}</nav>`;
}

// Wrap a screen body with the top bar, nav row and tabs.
export function inGame(screenName, body, { showBack = false } = {}) {
  const tab = TABS.some(([id]) => id === screenName) ? screenName : "";
  return `${topBar()}
    <main class="screen">
      ${screenName === "overview" ? "" : navRow(showBack)}
      ${App.flash ? `<p class="flash">${esc(App.flash)}</p>` : ""}
      ${body}
    </main>
    ${tabs(tab)}`;
}

const canDo = () => `<p class="cando">${esc(engine.canDoLine(game(), App.W))}</p>`;

// Energy and time text for a command: "4 Energy · 10 min"
function costText(cost, minutes) {
  const parts = [];
  if (cost != null) parts.push(`${cost} Energy`);
  if (minutes) parts.push(`${minutes} min`);
  return parts.join(" · ");
}

// Buttons for everything available at a place (except research: Tree tab).
function actionButtons(list) {
  const W = App.W;
  return list
    .filter((a) => a.kind !== "research")
    .map((a) => {
      if (a.kind === "action") {
        const def = W.actions.find((x) => x.id === a.id);
        const sub = `${costText(a.cost ?? W.config.energy.baseActionCost, W.config.time.actionMinutes)} · +${esc(engine.describeItems(W, def.yield))}`;
        return `<li>${cmdBtn(esc(a.label), "gather", a.id, a, sub)}</li>`;
      }
      if (a.kind === "rest") return `<li>${btn("Rest", "toRest", 'class="row"')}</li>`;
      if (a.kind === "storage") return `<li>${btn("Use storage", "toStorage", 'class="row"')}</li>`;
      const rc = W.recipes.find((x) => x.id === a.id);
      const out = rc.outputs ? ` → ${esc(engine.describeItems(W, rc.outputs))}` : "";
      const sub = `${esc(engine.describeItems(W, rc.inputs))}${out} · ${costText(rc.actions * W.config.energy.baseActionCost, rc.actions * W.config.time.actionMinutes)}`;
      return `<li>${cmdBtn(esc(a.label), "recipe", a.id, a, sub)}</li>`;
    })
    .join("");
}

// ---------- Screens ----------

export const SCREENS = {};

SCREENS.overview = () => {
  const g = game();
  const W = App.W;
  const top = topAttributes(W.attributes, g).map((a) => `${esc(a.name)} ${a.level}`).join(", ");
  const active = g.quests.active ? App.D.quests.find((q) => q.id === g.quests.active) : null;
  const groups = adviceByHorizon(W.advice, g, W);
  const adviceHtml = HORIZONS.filter((h) => groups[h].length)
    .map((h) => `<h4>${HORIZON_LABELS[h]}</h4><ul class="plain">${groups[h].map((r) => `<li>${esc(r.text)}</li>`).join("")}</ul>`)
    .join("");
  const logHtml = g.log.length
    ? `<ul class="plain log">${g.log.map((m) => `<li><span class="muted">Day ${m.day}, ${m.time}</span> ${esc(m.text)}</li>`).join("")}</ul>`
    : `<p class="muted">No messages yet.</p>`;

  // Each section heading is a button that links to its screen.
  const section = (title, act, to, body) => `<section class="card">
    <button type="button" class="card-head" data-act="${act}">${title} <span class="muted small">→ ${to}</span></button>
    ${body}
  </section>`;

  return inGame("overview", `
    ${section("Who", "toMe", "Me", `<dl>
      <dt>Name</dt><dd>${esc(g.name)}</dd>
      <dt>Origin</dt><dd>Mo Clan, Greywillow</dd>
      <dt>Cultivation</dt><dd>Mortal (no qi yet)</dd>
      <dt>Top attributes</dt><dd>${top}</dd></dl>`)}
    ${section("Condition", "toMe", "Me", `<dl>
      <dt>HP</dt><dd>${r0(g.hp)} / ${maxHp(cfg(), g)}</dd>
      <dt>Energy</dt><dd>${r0(g.energy)} / ${maxEnergy(cfg(), g)}</dd>
      <dt>Hunger</dt><dd>${r0(g.hunger)} / ${cfg().meters.hungerMax}</dd>
      <dt>Injuries</dt><dd>${g.injuries.length ? esc(g.injuries.join(", ")) : "none"}</dd>
      <dt>Buffs</dt><dd>${g.buffs.length ? esc(g.buffs.join(", ")) : "none"}</dd>
      <dt>Warnings</dt><dd>none</dd></dl>`)}
    ${section("Where", "toHere", "Here", `<dl>
      <dt>Place</dt><dd>${esc(place(g.location).name)}</dd>
      <dt>Shelter</dt><dd>${esc(SHELTER_LABELS[g.homeShelter] || g.homeShelter)}</dd>
      <dt>Time</dt><dd>${dayTime(cfg(), g)}</dd></dl>
      ${canDo()}`)}
    ${section("Doing", "toHere", "Here", `<dl>
      <dt>Last action</dt><dd>${g.lastAction ? esc(g.lastAction) : "Nothing yet"}</dd>
      <dt>Current focus</dt><dd>${active ? esc(active.title) : "None"}</dd></dl>`)}
    ${section("Planning", "toQuests", "Quests", `
      ${active ? `<p class="pinned">📌 <strong>${esc(active.title)}</strong> <span class="muted small">(${HORIZON_LABELS[active.horizon]})</span></p>` : `<p class="muted">No active quest.</p>`}
      ${adviceHtml || `<p class="muted">No suggestions.</p>`}
      ${btn("Quests", "toQuests")}`)}
    <section class="card">
      ${btn(`Message log ${App.open.log ? "▲" : "▼"}`, "toggleLog", 'class="card-head"')}
      ${App.open.log ? logHtml : ""}
    </section>
    <p class="muted small center">Version ${esc(cfg().version)}</p>
  `);
};

SCREENS.here = () => {
  const g = game();
  const W = App.W;
  const here = place(g.location);
  const hub = place(hubId(W));
  const list = engine.availableActions(g, W);
  const link = (type, x, label) => `<li>${btn(label, "detail", `data-type="${type}" data-id="${x.id}" class="row"`)}</li>`;
  const poiName = (id) => (place(id) ? place(id).name : id);
  const greyed = here.activities.filter((a) => !LIVE_ACTIVITIES.includes(a));
  const greyedHtml = greyed.length
    ? `<h2>Other activities</h2><ul class="plain">${greyed.map((a) => `<li><button type="button" disabled class="row">${esc(a)} <span class="small">(coming in 1b-ii)</span></button></li>`).join("")}</ul>`
    : "";
  const areaTrip = (to, label) => {
    const t = engine.travelInfo(W, g, to);
    return cmdBtn(label, "travel", to, t, t.ok ? costText(t.cost, t.minutes) : "");
  };
  const level = here.recommendedLevel ?? hub.recommendedLevel ?? 1;

  let body = `${canDo()}
    <h1>${esc(here.name)}</h1>
    <p class="muted">Recommended level ${level} · ${dayTime(cfg(), g)}</p>
    <p>${esc(here.blurb)}</p>`;

  if (here.kind === "poi") body += btn(`‹ Back to ${esc(hub.name)}`, "travel", `data-id="${hub.id}" class="row"`);
  if (here.kind === "area") body += areaTrip(hub.id, `‹ Back to ${esc(hub.name)}`);

  body += `<h2>Actions</h2><ul class="plain">${actionButtons(list)}</ul>`;
  body += `<p class="muted small">Research is in the ${btn("Tree", "tab", 'data-id="tree"')} tab.</p>`;
  body += greyedHtml;

  if (inVillage(W, here.id)) {
    const pois = W.places.places.filter((p) => p.parent === hub.id && p.kind === "poi");
    const scope = here.kind === "hub" ? pois.map((p) => p.id) : [here.id];
    const people = W.places.people.filter((p) => scope.includes(p.at));
    const things = W.places.things.filter((t) => scope.includes(t.at));
    if (people.length) body += `<h2>People</h2><ul class="plain">${people.map((p) => link("person", p, `${esc(p.name)} <span class="muted">(${esc(poiName(p.at))})</span>`)).join("")}</ul>`;
    if (here.kind === "hub") {
      body += `<h2>Places</h2><p class="muted small">Walking inside ${esc(hub.name)} is free.</p><ul class="plain">${pois
        .map((p) => `<li>${btn(esc(p.name), "travel", `data-id="${p.id}" class="row"`)}</li>`).join("")}</ul>`;
    }
    if (things.length) body += `<h2>Things</h2><ul class="plain">${things.map((t) => link("thing", t, `${esc(t.name)} <span class="muted">(${esc(poiName(t.at))})</span>`)).join("")}</ul>`;
    body += `<h2>Go to</h2><ul class="plain">${hub.exits.map((e) => `<li>${areaTrip(e.to, esc(poiName(e.to)))}</li>`).join("")}</ul>`;
    if (here.kind === "hub") body += `<h2>Map</h2><button type="button" disabled class="row">🔒 Map: locked until a later slice</button>`;
  }
  return inGame("here", body);
};

// Detail for a person, a thing, an item or (rarely) a place.
SCREENS.detail = ({ type, id }) => {
  const g = game();
  const W = App.W;
  let body = "";
  if (type === "person") {
    const x = W.places.people.find((p) => p.id === id);
    body = `<h1>${esc(x.name)}</h1>
      <p>${esc(x.role.replace(/_/g, " "))}</p>
      <p class="muted">At: ${esc(place(x.at).name)}</p>
      ${x.placeholderName ? `<p class="muted small">(placeholder name)</p>` : ""}
      <p class="muted">Details come later.</p>`;
  } else if (type === "thing") {
    const x = W.places.things.find((t) => t.id === id);
    body = `<h1>${esc(x.name)}</h1>
      <p class="muted">${esc(kindLabel(x.type))} · at ${esc(place(x.at).name)}</p>
      ${x.type === "storage" && g.location === x.at ? btn("Use storage", "toStorage", 'class="row primary"') : ""}
      <p class="muted">Details come later.</p>`;
  } else if (type === "item") {
    const it = item(id);
    const have = g.inventory[id] || 0;
    body = `<h1>${esc(it.name)}</h1>
      <p class="muted">${esc(kindLabel(it.kind))} · ${it.weightKg} kg each</p>
      <p>${esc(it.blurb)}</p>
      ${it.hunger ? `<p>Restores ${it.hunger} Hunger.</p>` : ""}
      ${it.toolType ? `<p>Tool for ${esc(it.toolType)} work (${esc(it.tier)}).</p>` : ""}
      <p>In bag: ${have}</p>
      ${it.kind === "food" && have ? foodButtons(id) : ""}`;
  } else {
    const p = place(id);
    body = `<h1>${esc(p.name)}</h1><p>${esc(p.blurb)}</p>${btn("Go there", "travel", `data-id="${p.id}" class="row primary"`)}`;
  }
  return inGame("detail", body, { showBack: true });
};

function foodButtons(id) {
  const full = game().hunger >= cfg().meters.hungerMax - 0.001;
  const check = full ? { ok: false, message: "You are full." } : { ok: true };
  return `<div class="inline">${cmdBtn("Eat 1", "eatOne", id, check)}${cmdBtn(`Eat until Hunger reaches ${cfg().eatUntilHunger}`, "eatUntil", id, check)}</div>`;
}

SCREENS.bag = () => {
  const g = game();
  const W = App.W;
  const ids = Object.keys(g.inventory).filter((id) => g.inventory[id] > 0);
  const rows = ids.map((id) => {
    const it = item(id);
    const qty = g.inventory[id];
    return `<li class="itemrow">
      ${btn(`<strong>${esc(it.name)}</strong> ×${qty} <span class="muted small">${esc(kindLabel(it.kind))} · ${Math.round(it.weightKg * qty * 100) / 100} kg</span>
        <div class="muted small">${esc(it.blurb)}${it.hunger ? ` Restores ${it.hunger} Hunger.` : ""}</div>`, "detail", `data-type="item" data-id="${id}" class="row"`)}
      ${it.kind === "food" ? foodButtons(id) : ""}
    </li>`;
  });
  return inGame("bag", `
    <h1>Bag</h1>
    <p>Weight ${weightOf(W, g.inventory)} / ${carryKg(cfg(), g)} kg · Slots ${slotsOf(W, g.inventory)} / ${cfg().inventory.bagSlots}</p>
    ${rows.length ? `<ul class="plain">${rows.join("")}</ul>` : `<p class="muted">Your bag is empty.</p>`}
    ${g.location === storagePlace(W) ? btn("Use storage", "toStorage", 'class="row"') : `<p class="muted small">Storage is at your Hut.</p>`}
  `);
};

SCREENS.storage = () => {
  const g = game();
  const W = App.W;
  if (g.location !== storagePlace(W)) return inGame("storage", `<h1>Storage</h1><p class="muted">Storage is at your Hut.</p>`, { showBack: true });
  const row = (inv, id, actOne, actAll, labelOne, labelAll) => `<li class="itemrow">
      <div><strong>${esc(item(id).name)}</strong> ×${inv[id]}</div>
      <div class="inline">${btn(labelOne, actOne, `data-id="${id}"`)}${btn(labelAll, actAll, `data-id="${id}"`)}</div>
    </li>`;
  const bagIds = Object.keys(g.inventory);
  const storeIds = Object.keys(g.storage);
  return inGame("storage", `
    <h1>Storage</h1>
    <p class="muted small">Items in storage do not count as tools, but recipes made at the Hut can use them.</p>
    <h2>Bag</h2>
    <p class="small">Weight ${weightOf(W, g.inventory)} / ${carryKg(cfg(), g)} kg · Slots ${slotsOf(W, g.inventory)} / ${cfg().inventory.bagSlots}</p>
    ${bagIds.length ? `<ul class="plain">${bagIds.map((id) => row(g.inventory, id, "deposit1", "depositAll", "Deposit 1", "Deposit all")).join("")}</ul>` : `<p class="muted">Bag is empty.</p>`}
    <h2>Storage</h2>
    <p class="small">Slots ${slotsOf(W, g.storage)} / ${cfg().inventory.storageSlots}</p>
    ${storeIds.length ? `<ul class="plain">${storeIds.map((id) => row(g.storage, id, "withdraw1", "withdrawAll", "Withdraw 1", "Withdraw all")).join("")}</ul>` : `<p class="muted">Storage is empty.</p>`}
  `, { showBack: true });
};

// Rest: pick hours (1 to 8) or "Sleep until full".
SCREENS.rest = () => {
  const g = game();
  const p = engine.restPreview(App.W, g, { untilFull: true });
  const c = cfg().rest;
  const hours = [];
  for (let h = c.minHours; h <= c.maxHours; h++) hours.push(btn(`${h} h`, "restPick", `data-id="${h}"`));
  return inGame("rest", `
    <h1>Rest</h1>
    <p>Shelter: <strong>${esc(SHELTER_LABELS[p.shelter] || p.shelter)}</strong> · ${p.hoursToFull} h to full Energy</p>
    <p class="muted small">Your home shelter is used only at your Hut. Anywhere else you rest on the ground.</p>
    <div class="hours">${hours.join("")}</div>
    ${btn(`Sleep until full (${p.hours} h)`, "restPick", 'data-id="full" class="row primary"')}
  `, { showBack: true });
};

SCREENS.restConfirm = ({ hours }) => {
  const g = game();
  const opts = hours === "full" ? { untilFull: true } : { hours: Number(hours) };
  const p = engine.restPreview(App.W, g, opts);
  return inGame("restConfirm", `
    <h1>Rest ${p.hours} h?</h1>
    <dl>
      <dt>Shelter</dt><dd>${esc(SHELTER_LABELS[p.shelter] || p.shelter)} (${p.hoursToFull} h to full)</dd>
      <dt>Hours</dt><dd>${p.hours}${p.untilFull ? " (until full)" : ""}</dd>
      <dt>Wake</dt><dd>${dayTime(cfg(), { minutes: p.wakeMinutes })}</dd>
      <dt>Energy</dt><dd>${r0(p.e0)} → ${r0(p.e1)}</dd>
      <dt>Hunger</dt><dd>${r0(p.h0)} → ${r0(p.h1)}</dd>
    </dl>
    ${p.atFull ? `<p class="muted">Energy is already full. You can still rest.</p>` : ""}
    ${p.short ? `<p class="warnline">Hunger is too low: recovery stops after about ${Math.round(p.recoveryHours * 10) / 10} hours.</p>` : ""}
    ${p.willPassOut ? `<p class="warnline">You have no food and will be starving: you will pass out after this rest.</p>` : ""}
    <div class="stack">
      ${btn("Confirm rest", "restConfirm", `data-id="${hours}" class="primary"`)}
      ${btn("Cancel", "back")}
    </div>
  `, { showBack: true });
};

SCREENS.tree = () => {
  const g = game();
  const W = App.W;
  const STATE_LABEL = { done: "✓ done", available: "available", locked: "🔒 locked" };
  const recipeName = (id) => (W.recipes.find((r) => r.id === id) || { name: id }).name;
  const rows = W.nodes.map((n) => {
    const st = engine.nodeStatus(W, g, n);
    const isOpen = !!App.open.nodes[n.id];
    let inner = "";
    if (isOpen) {
      const cost = n.actions * W.config.energy.baseActionCost;
      inner = `<div class="nodebody">
        ${st.missing.length ? `<p class="small">Still needed: ${esc(st.missing.join(", "))}</p>` : ""}
        <p class="small">Cost: ${n.actions} action${n.actions === 1 ? "" : "s"} (${costText(cost, n.actions * W.config.time.actionMinutes)})</p>
        <p class="small">Unlocks: ${n.unlocks.length ? esc(n.unlocks.map(recipeName).join(", ")) : "nothing yet"}</p>
        ${st.state === "available" ? cmdBtn(`Research ${esc(n.name)}`, "research", n.id, engine.checkResearch(W, g, n)) : ""}
      </div>`;
    }
    return `<li class="node ${st.state}">
      ${btn(`${isOpen ? "▾" : "▸"} <strong>${esc(n.name)}</strong> <span class="muted small">${STATE_LABEL[st.state]}</span>`, "toggleNode", `data-id="${n.id}" class="row"`)}
      ${inner}
    </li>`;
  });
  return inGame("tree", `
    <h1>Tree</h1>
    <p class="muted small">Research can be done anywhere. It costs Energy and time, paid up front, and gives no XP.</p>
    <ul class="plain">${rows.join("")}</ul>
  `);
};

SCREENS.journal = () => inGame("journal", `<h1>Journal</h1><p class="muted">Placeholder. Comes in a later slice.</p>`, { showBack: true });

SCREENS.me = () => {
  const g = game();
  const W = App.W;
  const x = W.config.xp;
  const left = unspentPoints(W.config, g);
  const attrs = W.attributes.map((a) => {
    const st = g.attributes[a.id];
    const plus = left > 0
      ? btn("+", "addPoint", `data-id="${a.id}" aria-label="Add a point to ${a.name}" ${engine.canAddPoint(W, g, a.id) ? "" : "disabled"}`)
      : "";
    return `<li class="attr">
      <div><strong>${esc(a.name)}</strong> <span class="level">${st.level}</span>
        <span class="muted small">XP ${st.xp || 0} / ${xpToNext(x.attrBase, x.exponent, st.level)}</span>
        <div class="muted small">${esc(a.drives)}</div></div>
      <div class="pm">${plus}</div>
    </li>`;
  });

  const skillRow = (s) => {
    if (s.state !== "open") return `<li class="skill locked">🔒 ${esc(s.name)}<div class="muted small">${esc(s.unlockNote)}</div></li>`;
    const sk = g.skills[s.id] || { level: 1, xp: 0 };
    return `<li class="skill"><strong>${esc(s.name)}</strong> <span class="level">${sk.level}</span>
        <span class="muted small">XP ${sk.xp} / ${xpToNext(x.skillBase, x.exponent, sk.level)}</span>
        <div class="muted small">trains in ${esc(s.trainsIn)}${s.unlockNote ? ` · ${esc(s.unlockNote)}` : ""}${s.subskills ? ` · sub-skills: ${esc(s.subskills.join(", "))}` : ""}</div></li>`;
  };

  const groups = W.skills.groups.map((gr) => {
    const inGroup = W.skills.skills.filter((s) => s.group === gr.id);
    const inner = gr.families
      ? gr.families.map((f) => `<h4>${esc(f)}</h4><ul class="plain">${inGroup.filter((s) => s.family === f).map(skillRow).join("")}</ul>`).join("")
      : `<ul class="plain">${inGroup.map(skillRow).join("")}</ul>`;
    return `<section class="card"><h3>${esc(gr.name)}</h3>${inner}</section>`;
  });

  return inGame("me", `
    <h1>${esc(g.name)}</h1>
    <p class="muted small">Carry limit ${carryKg(W.config, g)} kg (10 + Strength).</p>
    <h2>Attributes</h2>
    <p>Unspent points: <strong>${left}</strong>${left > 0 ? ` <span class="muted small">(max ${W.config.creation.maxPerAttrFromFree} free points each)</span>` : ""}</p>
    <ul class="list">${attrs.join("")}</ul>
    <h2>Skills</h2>
    ${groups.join("")}
    ${btn("Journal", "toJournal", 'class="row"')}
  `);
};

SCREENS.quests = () => {
  const g = game();
  const Q = App.D.quests;
  const acc = g.quests.accepted.map((id) => Q.find((q) => q.id === id)).filter(Boolean);
  const avail = Q.filter((q) => !g.quests.accepted.includes(q.id));
  const accRow = (q) => {
    const isActive = q.id === g.quests.active;
    return `<li class="quest ${isActive ? "active" : ""}">
      <button type="button" class="row" data-act="setActive" data-id="${q.id}">
        ${isActive ? "📌 " : ""}<strong>${esc(q.title)}</strong> <span class="muted small">(${HORIZON_LABELS[q.horizon]})${isActive ? " · ACTIVE" : " · tap to make active"}</span>
        <div class="muted small">${esc(q.summary)}</div>
      </button>
      ${q.abandonable ? btn("Abandon", "abandon", `data-id="${q.id}"`) : ""}
    </li>`;
  };
  const availRow = (q) => `<li class="quest">
      <div><strong>${esc(q.title)}</strong> <span class="muted small">(${HORIZON_LABELS[q.horizon]})</span><div class="muted small">${esc(q.summary)}</div></div>
      ${btn("Accept", "accept", `data-id="${q.id}"`)}
    </li>`;
  return inGame("quests", `
    <h1>Quests</h1>
    <h2>Accepted (${acc.length}/${cfg().quests.maxAccepted})</h2>
    ${acc.length ? `<ul class="plain">${acc.map(accRow).join("")}</ul>` : `<p class="muted">None yet.</p>`}
    <h2>Available</h2>
    ${avail.length ? `<ul class="plain">${avail.map(availRow).join("")}</ul>` : `<p class="muted">None.</p>`}
  `, { showBack: true });
};

// ---------- Actions (what each button does) ----------
// el is the tapped button; el.dataset.id holds its data-id.

const quest = (id) => App.D.quests.find((q) => q.id === id);

export const ACTIONS = {
  // Navigation
  toOverview: () => goRoot("overview"),
  toHere: () => go("here"),
  toMe: () => go("me"),
  toQuests: () => go("quests"),
  toJournal: () => go("journal"),
  toRest: () => go("rest"),
  toStorage: () => go("storage"),
  tab: (el) => goRoot(el.dataset.id),
  detail: (el) => go("detail", { type: el.dataset.type, id: el.dataset.id }),

  // Game commands (productive = true where the brief counts them)
  gather: (el) => run(engine.gather(game(), App.W, el.dataset.id), true),
  recipe: (el) => run(engine.makeRecipe(game(), App.W, el.dataset.id), true),
  research: (el) => run(engine.research(game(), App.W, el.dataset.id), true),
  eatOne: (el) => run(engine.eat(game(), App.W, el.dataset.id, "one"), true),
  eatUntil: (el) => run(engine.eat(game(), App.W, el.dataset.id, "until"), true),
  travel: (el) => {
    const r = run(engine.travel(game(), App.W, el.dataset.id));
    if (!r.ok) return;
    const msg = App.flash; // goRoot clears the flash: keep the travel message
    goRoot("here");
    App.flash = msg;
  },
  restPick: (el) => go("restConfirm", { hours: el.dataset.id }),
  restConfirm: (el) => {
    const h = el.dataset.id;
    const r = run(engine.rest(game(), App.W, h === "full" ? { untilFull: true } : { hours: Number(h) }), true);
    const msg = App.flash;
    goRoot(r.events.some((e) => e.type === "passOut") ? "overview" : "here");
    App.flash = msg;
  },
  deposit1: (el) => run(engine.deposit(game(), App.W, el.dataset.id, false)),
  depositAll: (el) => run(engine.deposit(game(), App.W, el.dataset.id, true)),
  withdraw1: (el) => run(engine.withdraw(game(), App.W, el.dataset.id, false)),
  withdrawAll: (el) => run(engine.withdraw(game(), App.W, el.dataset.id, true)),
  toggleNode: (el) => { App.open.nodes[el.dataset.id] = !App.open.nodes[el.dataset.id]; },

  // Me
  addPoint: (el) => run(engine.addPoint(game(), App.W, el.dataset.id)),

  // Quests
  accept: (el) => run(engine.acceptQuest(game(), App.W, quest(el.dataset.id))),
  setActive: (el) => run(engine.setActiveQuest(game(), el.dataset.id)),
  abandon: (el) => run(engine.abandonQuest(game(), App.W, quest(el.dataset.id))),

  // Overview
  toggleLog: () => { App.open.log = !App.open.log; },
};
