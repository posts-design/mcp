// The breakdown spec: one JSON file describes one film. parseSpec checks it and returns it in a form the renderer can
// use directly; it is pure, so every rule here is tested (test/spec.test.mjs). Field reference: README.md.
import { placeholders } from "./draft.mjs";
import { MAX_LANES } from "./layout.mjs";

const RULERS = ["bars", "seconds"];
const ASPECTS = ["4:5", "9:16"];
const MARK_KEYS = ["black", "white"];
const KNOWN = new Set(["source", "stems", "cover", "bpm", "barAnchor", "ruler", "gainDb", "aspect", "avatar", "markKey", "url",
  "pullBack", "hold", "acts", "shots", "transitions", "lanes", "end"]);
export const MIN_END_POSTS = 3;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";

/**
 * Checks a parsed spec and returns it normalised: tuples become objects, defaults are filled and a clip names the
 * stem it draws. Every problem is collected, so one run reports them all; the error lists them one per line.
 */
export function parseSpec(raw) {
  const problems = [], fail = (msg) => problems.push(msg);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("spec: expected a JSON object");
  for (const key of Object.keys(raw)) if (!KNOWN.has(key) && !key.startsWith("_")) fail(`unknown field "${key}" (notes go in fields starting with _)`);

  const need = (key, ok, what) => (ok(raw[key]) ? raw[key] : (fail(`${key}: ${raw[key] === undefined ? "missing" : "invalid"}, expected ${what}`), undefined));
  const optional = (key, ok, what, fallback) => (raw[key] === undefined ? fallback : need(key, ok, what));
  const span = (where, a, b) => {
    if (!isNum(a) || !isNum(b) || a < 0 || b <= a) { fail(`${where}: expected start < end, both seconds ≥ 0`); return false; }
    return true;
  };

  const ruler = optional("ruler", (v) => RULERS.includes(v), `one of ${RULERS.join(", ")}`, "bars");
  const spec = {
    source: need("source", isText, "the film's file"),
    stems: need("stems", isText, "the folder of stems"),
    cover: need("cover", (v) => isNum(v) && v >= 0, "the second shown as frame 0"),
    ruler,
    bpm: ruler === "bars" ? need("bpm", (v) => isNum(v) && v >= 30 && v <= 300, "beats per minute, 30–300")
      : optional("bpm", (v) => isNum(v) && v >= 30 && v <= 300, "beats per minute, 30–300", null),
    barAnchor: optional("barAnchor", (v) => isNum(v) && v >= 0, "the second a bar starts on", 0),
    gainDb: optional("gainDb", (v) => isNum(v) && v >= -24 && v <= 12, "dB, −24 to 12", 0),
    aspect: optional("aspect", (v) => ASPECTS.includes(v), `one of ${ASPECTS.join(", ")}`, "4:5"),
    avatar: optional("avatar", isText, "an image of the brand's mark", null),
    markKey: optional("markKey", (v) => MARK_KEYS.includes(v), `one of ${MARK_KEYS.join(", ")}`, "black"),
    pullBack: need("pullBack", (v) => isNum(v) && v > 0, "the second the timeline pulls back"),
    hold: optional("hold", (v) => isNum(v) && v >= 0 && v <= 10, "seconds, 0–10", undefined),
    transitions: optional("transitions", (v) => Array.isArray(v) && v.every((t) => isNum(t) && t > 0), "a list of seconds", []),
  };

  spec.shots = [];
  if (!Array.isArray(raw.shots) || raw.shots.length === 0) fail("shots: expected [[start, end, name], …]");
  else raw.shots.forEach((s, i) => {
    if (!Array.isArray(s) || !isText(s[2])) return fail(`shots[${i}]: expected [start, end, name]`);
    if (span(`shots[${i}] "${s[2]}"`, s[0], s[1])) spec.shots.push({ start: s[0], end: s[1], name: s[2] });
    if (i > 0 && isNum(s[0]) && isNum(raw.shots[i - 1]?.[0]) && s[0] < raw.shots[i - 1][0]) fail(`shots[${i}]: starts before the shot above it`);
  });

  spec.acts = [];
  if (!Array.isArray(raw.acts) || raw.acts.length === 0) fail("acts: expected [{ start, title }, …]");
  else raw.acts.forEach((a, i) => {
    if (!a || !isNum(a.start) || a.start < 0 || !isText(a.title)) return fail(`acts[${i}]: expected { start, title }`);
    if (i > 0 && a.start < raw.acts[i - 1]?.start) fail(`acts[${i}]: starts before the act above it`);
    spec.acts.push({ start: a.start, title: a.title });
  });

  spec.lanes = [];
  if (!Array.isArray(raw.lanes) || raw.lanes.length === 0 || raw.lanes.length > MAX_LANES) fail(`lanes: expected 1 to ${MAX_LANES} tracks`);
  else raw.lanes.forEach((l, i) => {
    if (!l || !isText(l.name) || !isStem(l.stem) || !Array.isArray(l.clips)) return fail(`lanes[${i}]: expected { name, stem, clips }`);
    const clips = [];
    l.clips.forEach((c, j) => {
      const where = `lanes[${i}].clips[${j}]`;
      if (!Array.isArray(c) || !isText(c[2])) return fail(`${where}: expected [start, end, label] or [start, end, label, stem]`);
      if (c[3] !== undefined && !isStem(c[3])) return fail(`${where}: the fourth item names a stem (a file name in the stems folder)`);
      if (span(`${where} "${c[2]}"`, c[0], c[1])) clips.push({ start: c[0], end: c[1], label: c[2], stem: c[3] ?? l.stem });
    });
    spec.lanes.push({ name: l.name, stem: l.stem, clips });
  });

  spec.end = null;
  if (raw.end !== undefined) {
    const e = raw.end, line = e?.line, posts = e?.posts;
    if (!Array.isArray(line) || line.length < 1 || line.length > 2 || !line.every(isText)) fail("end.line: expected one or two lines of text");
    if (!Array.isArray(posts) || posts.length < MIN_END_POSTS) fail(`end.posts: expected at least ${MIN_END_POSTS} posts (8–12 fill the wall best)`);
    else {
      const parsed = posts.map((p, i) => {
        const [file, from] = Array.isArray(p) ? p : [p, undefined];
        if (!isText(file) || (from !== undefined && !(isNum(from) && from >= 0))) return fail(`end.posts[${i}]: expected a file or link, or [file, from seconds]`);
        return { file, from };
      });
      if (Array.isArray(line) && line.every(isText)) spec.end = { line, posts: parsed };
    }
  }

  if (problems.length) throw new Error(`spec has ${problems.length} problem${problems.length > 1 ? "s" : ""}:\n  ${problems.join("\n  ")}`);
  return spec;
}

/** A stem is named by its file in the stems folder, without the extension: drums, bass, vocals, other… */
const isStem = (v) => typeof v === "string" && /^[a-z0-9][a-z0-9_-]*$/i.test(v);

/** What to look at before rendering, given the film's measured duration. Warnings never stop a render. */
export function warnings(spec, duration) {
  const out = [];
  const past = (where, t) => t > duration + 0.05 && out.push(`${where} at ${t.toFixed(2)} s is past the film's end (${duration.toFixed(2)} s)`);
  past("cover", spec.cover);
  past("pullBack", spec.pullBack);
  spec.shots.forEach((s, i) => past(`shot ${i + 1} "${s.name}"`, s.end));
  spec.lanes.forEach((l) => l.clips.forEach((c) => past(`${l.name} clip "${c.label}"`, c.end)));
  if (spec.cover >= spec.pullBack) out.push("cover is at or after the pull-back, so frame 0 won't show the timeline");
  const left = placeholders(spec);
  if (left) out.push(`${left} names are still prep's placeholders`);
  return out;
}
