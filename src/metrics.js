// metrics.js
// Turns the playtest event log into the Metrics report (M1 to M15).
// Pure logic, no DOM: give it the events, the world and data/metrics.json.
//
// Every event carries: realMs, gameDay, gameMinute, version, tuningSetId,
// type, plus sid (session id), seg (metrics segment: changes on load),
// gid (game id), tuned, and snapshots hg (Hunger), en (Energy) and
// hd (total Hunger drained so far).
//
// Status per metric: OK (inside the band), WATCH (outside, but within 25%
// of the band edge, or not past an explicit flag line), FLAG (beyond),
// NO DATA (fewer than config.metrics.minSamples samples).

import { dayOf } from "./state.js";

const EPS = 0.001;

// ---------- Small helpers ----------

function median(list) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

function fmt(n, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "-";
  return String(Math.round(n * 10 ** digits) / 10 ** digits);
}

const RANK = { "NO DATA": 0, OK: 1, WATCH: 2, FLAG: 3 };
function worst(...statuses) {
  return statuses.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "NO DATA");
}

// Status of one value against a band { okMin, okMax, flagBelow, flagAbove }.
export function bandStatus(v, band) {
  if (v == null || !Number.isFinite(v)) return "NO DATA";
  const { okMin = null, okMax = null, flagBelow = null, flagAbove = null } = band;
  if (flagBelow != null && v < flagBelow - EPS) return "FLAG";
  if (flagAbove != null && v > flagAbove + EPS) return "FLAG";
  const lo = okMin == null ? -Infinity : okMin;
  const hi = okMax == null ? Infinity : okMax;
  if (v >= lo - EPS && v <= hi + EPS) return "OK";
  if (v < lo) {
    if (flagBelow != null) return "WATCH";
    return v >= lo - Math.abs(lo) * 0.25 - EPS ? "WATCH" : "FLAG";
  }
  if (flagAbove != null) return "WATCH";
  return v <= hi + Math.abs(hi) * 0.25 + EPS ? "WATCH" : "FLAG";
}

function bandText(def) {
  if (def.okMin == null && def.okMax == null) return def.note || "-";
  const lo = def.okMin == null ? "" : def.okMin;
  const hi = def.okMax == null ? "" : def.okMax;
  const range = def.okMin != null && def.okMax != null ? `${lo}-${hi}` : def.okMin != null ? `>= ${lo}` : `<= ${hi}`;
  return def.note ? `${range} (${def.note})` : range;
}

function modelText(model) {
  if (model == null) return "-";
  if (typeof model === "object") return Object.keys(model).map((k) => `${k}: ${model[k]}`).join(", ");
  return String(model);
}

// ---------- Preparing the events ----------

// Drop debug events and add _t = active real ms since the first event.
// Active time = gaps between consecutive events in a session, each capped.
export function prepare(events, config) {
  const cap = config.metrics.idleGapSec * 1000;
  const last = {};
  let active = 0;
  const out = [];
  for (const e of events) {
    if (e.debug || e.type === "debug") continue;
    const prev = last[e.sid];
    if (prev != null && e.realMs >= prev) active += Math.min(e.realMs - prev, cap);
    last[e.sid] = e.realMs;
    out.push({ ...e, _t: active });
  }
  return out;
}

const dayKey = (seg, day) => `${seg}:${day}`;
const COMMAND_TYPES = ["action", "craft", "research", "travel", "eat", "rest", "blocked"];

// Action units: a gather = 1, a craft or research = its number of actions.
function units(e) {
  if (e.type === "action") return 1;
  if (e.type === "craft" || e.type === "research") return e.actions || 1;
  return 0;
}

// Game days played: for each segment, (last game minute - first) / 1440.
function gameDaysPlayed(ev) {
  const span = {};
  for (const e of ev) {
    if (e.seg == null) continue;
    const s = (span[e.seg] = span[e.seg] || { lo: e.gameMinute, hi: e.gameMinute });
    s.lo = Math.min(s.lo, e.gameMinute);
    s.hi = Math.max(s.hi, e.gameMinute);
  }
  return Object.values(span).reduce((a, s) => a + (s.hi - s.lo) / 1440, 0);
}

// Level-up durations: for each level-up, time since the previous level-up
// of the same thing (or since `firstOf` for the first one).
function levelDurations(ev, kind, firstOf) {
  const out = [];
  const prev = {};
  for (const e of ev) {
    if (e.type !== "levelUp" || e.kind !== kind) continue;
    const key = `${e.gid}:${e.id}`;
    const start = prev[key] || firstOf(e);
    if (start) {
      out.push({
        id: e.id, from: e.level - 1, to: e.level,
        realMin: (e._t - start._t) / 60000,
        days: start.seg === e.seg ? (e.gameMinute - start.gameMinute) / 1440 : null,
      });
    }
    prev[key] = e;
  }
  return out;
}

// ---------- The report ----------

export function computeReport(events, W, meta = {}) {
  const config = W.config;
  const defs = W.metrics;
  const minN = config.metrics.minSamples;
  const ev = prepare(events, config);
  const days = gameDaysPlayed(ev);
  const perDay = (n) => (days > EPS ? n / days : null);
  const sessions = groupSessions(ev);
  const firstOfGid = {};
  for (const e of ev) if (!firstOfGid[e.gid]) firstOfGid[e.gid] = e;
  // First gather or craft event that trained the skill of a level-up.
  const firstActionOf = (lv) =>
    ev.find((e) => (e.type === "action" || e.type === "craft") && e.gid === lv.gid && (e.skill || skillOfRecipe(W, e.recipeId)) === lv.id);

  const rows = {};
  const set = (id, measured, status, n) => {
    const def = defs.find((d) => d.id === id);
    rows[id] = { id, name: def.name, measured, model: modelText(def.model), band: bandText(def), status, n };
  };
  const enough = (n, status) => (n < minN ? "NO DATA" : status);
  const def = (id) => defs.find((d) => d.id === id);

  // M1 real active minutes between level-ups of the same skill.
  {
    const d = levelDurations(ev, "skill", firstActionOf);
    const low = d.filter((x) => x.from < 5).map((x) => x.realMin);
    const high = d.filter((x) => x.from >= 10).map((x) => x.realMin);
    const byKey = (from) => median(d.filter((x) => x.from === from).map((x) => x.realMin));
    const st = worst(bandStatus(median(low), def("M1")), high.length ? bandStatus(median(high), { okMin: 8, okMax: 25 }) : "NO DATA");
    set("M1", `1-2: ${fmt(byKey(1))}, 4-5: ${fmt(byKey(4))}, 10-11: ${fmt(byKey(10))}; median <5: ${fmt(median(low))} min`, enough(low.length + high.length, st), low.length + high.length);
  }

  // M2 game days between skill level-ups (within 30% of model OK; over 2x FLAG).
  {
    const d = levelDurations(ev, "skill", firstActionOf).filter((x) => x.days != null);
    const low = median(d.filter((x) => x.from >= 1 && x.from < 5).map((x) => x.days));
    const high = median(d.filter((x) => x.from >= 10).map((x) => x.days));
    const ratioStatus = (v, model) => {
      if (v == null) return "NO DATA";
      const r = v / model;
      if (r > 2) return "FLAG";
      return r >= 0.7 && r <= 1.3 ? "OK" : "WATCH";
    };
    const m = def("M2").model;
    set("M2", `1-5: ${fmt(low)} days, 10-11: ${fmt(high)} days`, enough(d.length, worst(ratioStatus(low, m["1-5"]), ratioStatus(high, m["10-11"]))), d.length);
  }

  // Per-day action units, and which shelter each day's rest used.
  const dayUnits = {};
  const dayShelter = {};
  for (const e of ev) {
    const u = units(e);
    if (u) dayUnits[dayKey(e.seg, e.gameDay)] = (dayUnits[dayKey(e.seg, e.gameDay)] || 0) + u;
    if (e.type === "rest") {
      const startMin = e.m0 != null ? e.m0 : e.gameMinute - e.hours * 60;
      dayShelter[dayKey(e.seg, dayOf(config, startMin))] = e.shelter;
    }
  }
  const unitsOn = (shelters) => Object.keys(dayShelter).filter((k) => shelters.includes(dayShelter[k])).map((k) => dayUnits[k] || 0);

  // M3 actions per game day, on days with a ground rest.
  {
    const list = unitsOn(["ground"]);
    const v = mean(list);
    set("M3", `${fmt(v, 1)} actions/day over ${list.length} day(s)`, enough(list.length, bandStatus(v, def("M3"))), list.length);
  }

  // M4 median real seconds between consecutive action events (gaps up to 30 s).
  {
    const gaps = [];
    for (const s of sessions) {
      let prev = null;
      for (const e of s.events) {
        if (e.type !== "action") continue;
        if (prev) {
          const sec = (e.realMs - prev.realMs) / 1000;
          if (sec <= config.metrics.idleGapSec) gaps.push(sec);
        }
        prev = e;
      }
    }
    const v = median(gaps);
    set("M4", `${fmt(v, 1)} s`, enough(gaps.length, bandStatus(v, def("M4"))), gaps.length);
  }

  // M5 non-action taps per game day, and productive-tap share.
  {
    const taps = ev.filter((e) => e.type === "tap");
    const prod = taps.filter((e) => e.productive).length;
    const nonPerDay = perDay(taps.length - prod);
    const share = taps.length ? (prod / taps.length) * 100 : null;
    const shareSt = share == null ? "NO DATA" : share >= 60 ? "OK" : share < 45 ? "FLAG" : "WATCH";
    set("M5", `${fmt(nonPerDay, 1)} taps/day, ${fmt(share, 0)}% productive`, enough(taps.length, worst(bandStatus(nonPerDay, def("M5")), shareSt)), taps.length);
  }

  // M6 blocked events per game day by reason, plus Energy left at each rest start.
  {
    const blocked = ev.filter((e) => e.type === "blocked");
    const by = {};
    for (const e of blocked) by[e.reason] = (by[e.reason] || 0) + 1;
    const v = perDay(blocked.length);
    const e0 = median(ev.filter((e) => e.type === "rest").map((e) => e.e0));
    const reasons = Object.keys(by).map((k) => `${k} ${by[k]}`).join(", ") || "none";
    // Samples here = game days of play (blocked counts may well be 0).
    const n = Math.floor(days);
    set("M6", `${fmt(v, 1)}/day (${reasons}); median Energy at rest start ${fmt(e0, 0)}`, enough(n, bandStatus(v, def("M6"))), n);
  }

  // M7 8 h ground rests started with Hunger >= 16 must end at full Energy.
  {
    const rests = ev.filter((e) => e.type === "rest");
    const checked = rests.filter((e) => e.shelter === "ground" && e.hours === 8 && e.h0 >= config.rest.fullNightMinHunger - EPS);
    const misses = checked.filter((e) => e.e1 < e.eMax - EPS).length;
    const pct = checked.length ? ((checked.length - misses) / checked.length) * 100 : null;
    const untilFull = rests.filter((e) => e.untilFull).length;
    const interrupted = rests.filter((e) => e.interrupted).length;
    const st = misses > 0 ? "FLAG" : enough(checked.length, bandStatus(pct, def("M7")));
    set("M7", `${fmt(pct, 0)}% full (${checked.length} checked${misses ? `, ${misses} BUG` : ""}); until-full ${untilFull}; interrupted ${interrupted}`, st, checked.length);
  }

  // M8 actions per day in a tent / lean-to / bed divided by on the ground.
  {
    const ground = mean(unitsOn(["ground"]));
    const tentList = unitsOn(["tent", "lean_to"]);
    const bedList = unitsOn(["house_bed"]);
    const tent = ground && tentList.length ? mean(tentList) / ground : null;
    const bed = ground && bedList.length ? mean(bedList) / ground : null;
    const n = Math.min(unitsOn(["ground"]).length, tentList.length + bedList.length);
    set("M8", `tent ${fmt(tent)}x, bed ${fmt(bed)}x`, n ? enough(n, worst(bandStatus(tent, def("M8")), bandStatus(bed, def("M8")))) : "NO DATA", n);
  }

  // M9 Hunger health.
  {
    const zeros = ev.filter((e) => e.type === "meterZero" && e.meter === "hunger").length;
    const zerosPer7 = days > EPS ? (zeros / days) * 7 : null;
    let awake = 0;
    let under = 0;
    for (const e of ev) {
      if (!["action", "craft", "research", "travel", "eat"].includes(e.type) || !e.minutes) continue;
      awake += e.minutes;
      if (e.hg < config.advice.hungryBelow - EPS) under += e.minutes;
    }
    const share = awake ? (under / awake) * 100 : null;
    const drained = drainedTotal(ev);
    const drainPerDay = perDay(drained);
    const st = worst(bandStatus(zerosPer7, def("M9")), share != null && share > 70 ? "FLAG" : share != null ? "OK" : "NO DATA");
    set("M9", `${fmt(zerosPer7, 1)} zeros/7 days; ${fmt(share, 0)}% awake time hungry; ${fmt(drainPerDay, 1)} Hunger/day`, enough(Math.floor(days), st), Math.floor(days));
  }

  // M10 share of action units spent getting or cooking food.
  {
    let all = 0;
    let food = 0;
    for (const e of ev) {
      const u = units(e);
      all += u;
      if ((e.type === "action" && e.food) || (e.type === "craft" && e.kind === "cook")) food += u;
    }
    const v = all ? (food / all) * 100 : null;
    set("M10", `${fmt(v, 1)}% of ${all} actions`, enough(all, bandStatus(v, def("M10"))), all);
  }

  // M11 cooking payoff, from the current numbers (gather + cook chain).
  {
    const noTool = cookingPayoff(W, false);
    const withTool = cookingPayoff(W, true);
    set("M11", `${fmt(noTool)}x without tools, ${fmt(withTool)}x with stone tools (from current numbers)`, bandStatus(noTool, def("M11")), 1);
  }

  // M12 real active minutes per attribute level.
  {
    const ups = ev.filter((e) => e.type === "levelUp" && e.kind === "attribute");
    const at = (gid, id, level) => ups.find((e) => e.gid === gid && e.id === id && e.level === level);
    const s01 = [];
    const s05 = [];
    const s510 = [];
    for (const e of ups) {
      const start = firstOfGid[e.gid];
      if (e.level === 1) s01.push((e._t - start._t) / 60000);
      if (e.level === 5 && at(e.gid, e.id, 1)) s05.push((e._t - start._t) / 60000);
      if (e.level === 10) {
        const five = at(e.gid, e.id, 5);
        if (five) s510.push((e._t - five._t) / 60000);
      }
    }
    const v01 = median(s01);
    const v05 = median(s05);
    const v510 = median(s510);
    let st = worst(
      s05.length ? bandStatus(v05, { okMin: 20, okMax: 90, flagAbove: 480 }) : "NO DATA",
      s510.length ? bandStatus(v510, { okMin: 120, okMax: 360, flagAbove: 480 }) : "NO DATA"
    );
    if (st === "NO DATA" && s01.length) st = "OK"; // only the 0-1 step so far: collect
    set("M12", `0-1: ${fmt(v01)}, 0-5: ${fmt(v05)}, 5-10: ${fmt(v510)} min`, enough(ups.length, st), ups.length);
  }

  // M13 session shape.
  {
    const ended = sessions.filter((s) => s.ended);
    const lengths = sessions.map((s) => s.activeMs / 60000);
    const actions = sessions.map((s) => s.events.filter((e) => e.type === "action").length);
    const blockedQuits = ended.filter((s) => {
      const cmds = s.events.filter((e) => COMMAND_TYPES.includes(e.type));
      return cmds.length && cmds[cmds.length - 1].type === "blocked";
    }).length;
    const share = ended.length ? (blockedQuits / ended.length) * 100 : null;
    set("M13", `median ${fmt(median(lengths), 1)} min, ${fmt(median(actions), 0)} actions/session, ${fmt(share, 0)}% quit while blocked`, enough(sessions.length, bandStatus(share, def("M13"))), sessions.length);
  }

  // M14 UI friction.
  {
    const withTaps = sessions.filter((s) => s.events.some((e) => e.type === "tap"));
    const disabled = withTaps.map((s) => s.events.filter((e) => e.type === "tap" && e.disabled).length);
    const taps = ev.filter((e) => e.type === "tap").length;
    const gathers = ev.filter((e) => e.type === "action").length;
    const v = mean(disabled);
    set("M14", `${fmt(v, 1)} disabled taps/session; ${fmt(gathers ? taps / gathers : null, 1)} taps per gather`, enough(withTaps.length, bandStatus(v, def("M14"))), withTaps.length);
  }

  // M15 first-time milestones (real active minutes and game days since the game began).
  {
    const ms = ev.filter((e) => e.type === "milestone");
    const seen = {};
    const parts = [];
    for (const e of ms) {
      if (seen[e.id]) continue;
      seen[e.id] = true;
      const start = firstOfGid[e.gid];
      parts.push(`${e.id} ${fmt((e._t - start._t) / 60000, 1)} min / ${fmt(e.gameMinute / 1440)} game days`);
    }
    set("M15", parts.join("; ") || "-", parts.length ? "OK" : "NO DATA", parts.length);
  }

  const tuned = ev.some((e) => e.tuned);
  return {
    header: {
      version: config.version,
      tuningSetId: W.tuningSetId || "default",
      sessions: sessions.length,
      activeMinutes: ev.length ? ev[ev.length - 1]._t / 60000 : 0,
      gameDays: days,
      tuned,
      events: ev.length,
      ...meta,
    },
    rows: defs.map((d) => rows[d.id]),
  };
}

// Plain text for pasting into chat: one metric per line.
export function reportText(report) {
  const h = report.header;
  const lines = [
    `Peepap metrics report - version ${h.version}, tuning ${h.tuningSetId}${h.tuned ? " (TUNED)" : ""}`,
    `Sessions ${h.sessions}, active ${fmt(h.activeMinutes, 1)} real min, ${fmt(h.gameDays, 2)} game days, ${h.events} events`,
  ];
  for (const r of report.rows) lines.push(`${r.id} [${r.status}] ${r.measured} | model ${r.model} | band ${r.band}`);
  return lines.join("\n");
}

// ---------- Helpers used above ----------

function skillOfRecipe(W, recipeId) {
  const r = W.recipes.find((x) => x.id === recipeId);
  return r ? r.skill : null;
}

// Sessions by sid, with active time and whether a session "end" was logged.
function groupSessions(ev) {
  const map = new Map();
  for (const e of ev) {
    if (!map.has(e.sid)) map.set(e.sid, { sid: e.sid, events: [], activeMs: 0, ended: false, first: e._t, last: e._t });
    const s = map.get(e.sid);
    s.events.push(e);
    s.last = e._t;
    if (e.type === "session" && e.state === "end") s.ended = true;
  }
  for (const s of map.values()) s.activeMs = s.last - s.first;
  return [...map.values()];
}

// Total Hunger drained, from the running total hd, per segment.
function drainedTotal(ev) {
  const span = {};
  for (const e of ev) {
    if (e.hd == null || e.seg == null) continue;
    const s = (span[e.seg] = span[e.seg] || { lo: e.hd, hi: e.hd });
    s.lo = Math.min(s.lo, e.hd);
    s.hi = Math.max(s.hi, e.hd);
  }
  return Object.values(span).reduce((a, s) => a + (s.hi - s.lo), 0);
}

// Hunger gained per Energy spent: (roast roots chain) / (berries).
// The roast chain counts the Energy to gather every input and to cook.
export function cookingPayoff(W, withTools) {
  const item = (id) => W.items.find((i) => i.id === id);
  const cost = (a) => {
    if (withTools && a.toolType) return W.config.energy.toolCost.stone;
    return W.config.energy.baseActionCost;
  };
  // Cheapest Energy per unit of an item from gather actions (no tool-only actions without tools).
  const energyPer = (id) => {
    let best = null;
    for (const a of W.actions) {
      if (!a.yield[id] || (a.toolRequired && !withTools)) continue;
      const e = cost(a) / a.yield[id];
      if (best == null || e < best) best = e;
    }
    return best;
  };
  const berries = W.actions.find((a) => a.yield.berries);
  const roast = W.recipes.find((r) => r.id === "roast_roots");
  if (!berries || !roast) return null;
  const berryRate = (berries.yield.berries * item("berries").hunger) / cost(berries);
  let e = roast.actions * W.config.energy.baseActionCost;
  for (const id in roast.inputs) {
    const per = energyPer(id);
    if (per == null) return null;
    e += per * roast.inputs[id];
  }
  const gained = Object.keys(roast.outputs).reduce((a, id) => a + roast.outputs[id] * (item(id).hunger || 0), 0);
  return gained / e / berryRate;
}
