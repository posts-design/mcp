// The editor's timeline, drawn as video tools draw it: track headers on the left (V1, A1…), a ruler, a V1 filmstrip
// of the post's shots, and one audio track per lane whose clips draw their stem's own waveform. The tracks scroll
// under a fixed playhead that carries the running time; the sounding clip fills white and the playing shot is outlined.
// Below the tracks, the act now playing, numbered.
import { clamp, easeOut, mix, T } from "./ease.mjs";
import { COLOR, FOOTER, LABEL, SCROLL, STICK, WINDOW } from "./layout.mjs";
import { envelopeRms } from "./media.mjs";
import { FONT, esc, labelWidth, measureWords, wordAt, wordReveal } from "./svg.mjs";
import { WORD_REVEAL, actIndexAt, beatGrid, lit, timecode } from "./timing.mjs";

const grey = (g) => `rgb(${Math.round(g)},${Math.round(g)},${Math.round(g)})`;
const fx = (n) => n.toFixed(1);
/** A clip at rest is white at 7% over the ground; its label tab is the same colour, opaque. */
const REST = 16 + 0.07 * (255 - 16);
const PXS = SCROLL.pxPerSecond;
/** The running time uses fixed advances per character, so it doesn't jitter as digits change. */
const TIME = { digit: 14.4, sep: 7.4, size: 24 };

/**
 * Measures every label once and returns `svg(t)` for the tracks and `footer(t)` for the act line.
 * `thumbAt(tc)` gives a data URI of the post at time tc for the filmstrip; `envelopes[stem]` its loudness.
 */
export async function createTimeline({ spec, tl, view, duration, pull, thumbAt, envelopes }) {
  // Whether a name fits inside its clip is decided once per clip from its length at the scroll scale: testing the
  // scrolled width every frame flipped on float noise for a clip exactly as wide as its label.
  const shots = await Promise.all(spec.shots.map(async (s) => {
    const w = await labelWidth(s.name, LABEL.shot, 500, -0.3);
    return { ...s, w, fits: w + 28 < (s.end - s.start) * PXS - 3 };
  }));
  const lanes = await Promise.all(spec.lanes.map(async (lane) => ({
    ...lane,
    clips: await Promise.all(lane.clips.map(async (c) => {
      const w = await labelWidth(c.label, LABEL.clip, 500, -0.4);
      return { ...c, w, fits: w + 26 + 4 < (c.end - c.start) * PXS - 4 };
    })),
  })));
  const acts = await Promise.all(spec.acts.map(async (a) => ({ ...a, m: await measureWords(a.title, { size: FOOTER.size, weight: 500, ls: -0.015, fill: COLOR.fg }) })));
  const actNo = (i) => String(i + 1).padStart(2, "0");
  const actNoW = Math.max(...await Promise.all(acts.map((_, i) => labelWidth(actNo(i), FOOTER.size, 500, -0.5))));
  const grid = spec.bpm ? beatGrid(spec.bpm, spec.barAnchor) : null;
  const thumb = { h: tl.videoH, w: Math.round(tl.videoH * WINDOW.w / WINDOW.h) };

  async function shotSvg(sh, v, id, busy) {
    const xa = v.X(sh.start) + 1.5, xb = v.X(sh.end) - 1.5, w = xb - xa, y = tl.video, h = tl.videoH;
    if (xb < tl.x0 - 20 || xa > tl.x1 + 20 || w < 2) return "";
    const on = v.tt >= sh.start && v.tt < sh.end ? 1 - v.z : 0, r = Math.min(10, w / 2);
    let s = `<clipPath id="s${id}"><rect x="${fx(xa)}" y="${y}" width="${fx(w)}" height="${h}" rx="${r}"/></clipPath><g clip-path="url(#s${id})">`;
    // continuous thumbnails: each tile shows the frame at its own place on the timeline
    for (let x = xa; x < xb; x += thumb.w) {
      if (x + thumb.w < tl.x0 - 20 || x > tl.x1 + 20) continue;
      s += `<image href="${await thumbAt(sh.start + (x - xa) / v.pxs + 0.05)}" x="${fx(x)}" y="${y}" width="${thumb.w}" height="${thumb.h}" preserveAspectRatio="none"/>`;
    }
    s += `<rect x="${fx(xa)}" y="${y}" width="${fx(w)}" height="${h}" fill="rgba(16,16,16,${(0.5 * (1 - on)).toFixed(3)})"/>`;
    // the shot's name on a tab, kept at the visible edge as it scrolls out; the playing shot's name is drawn on top
    // separately, and neighbours' names it would cover step aside
    const tx = clamp(xa + 8, xb - sh.w - 28, tl.x0 + STICK);
    if (sh.fits && v.z < 1 && !on && !(busy && tx < busy[1] + 6 && tx + sh.w + 20 > busy[0] - 6)) {
      s += `<g opacity="${(1 - v.z).toFixed(3)}"><rect x="${fx(tx)}" y="${y + 8}" width="${sh.w + 20}" height="36" rx="9" fill="rgba(16,16,16,0.78)"/>`
        + `<text x="${fx(tx + 10)}" y="${y + 34}" font-family="${FONT}" font-weight="500" letter-spacing="-0.3" font-size="${LABEL.shot}" fill="${COLOR.fg}">${esc(sh.name)}</text></g>`;
    }
    s += `</g><rect x="${fx(xa + 0.5)}" y="${y + 0.5}" width="${fx(w - 1)}" height="${h - 1}" rx="${r}" fill="none" stroke="${COLOR.line}"/>`;
    if (on > 0) s += `<rect x="${fx(xa + 1.5)}" y="${y + 1.5}" width="${fx(w - 3)}" height="${h - 3}" rx="${Math.max(0, r - 1)}" fill="none" stroke="${COLOR.fg}" stroke-opacity="${on.toFixed(3)}" stroke-width="3"/>`;
    return s;
  }

  // A dissolve or wipe straddles its edit as a small tab with a bowtie, as editors draw one; it lights at the edit.
  function transitionSvg(tc, v) {
    const x = v.X(tc), y = tl.video + tl.videoH / 2;
    if (x < tl.x0 - 20 || x > tl.x1 + 20) return "";
    const k = (1 - v.z) * (Math.abs(v.tt - tc) < 0.25 ? 1 : 0.0), g = mix(38, 245, k), ink = mix(200, 16, k);
    const s = mix(1, 0.6, v.z), bw = 36 * s, bh = 52 * s;
    return `<rect x="${fx(x - bw / 2)}" y="${fx(y - bh / 2)}" width="${fx(bw)}" height="${fx(bh)}" rx="${fx(8 * s)}" fill="${grey(g)}" stroke="${COLOR.lineStrong}"/>`
      + `<path d="M${fx(x - 9 * s)} ${fx(y - 8 * s)}L${fx(x + 9 * s)} ${fx(y + 8 * s)}L${fx(x + 9 * s)} ${fx(y - 8 * s)}L${fx(x - 9 * s)} ${fx(y + 8 * s)}Z" fill="${grey(ink)}"/>`;
  }

  function clipSvg(c, y, v, t, id, over) {
    const xa = v.X(c.start) + 2, xb = v.X(c.end) - 2, w = xb - xa;
    if (xb < tl.x0 - 40 || xa > tl.x1 + 40 || w < 2) return "";
    const k = lit(c, t) * (1 - v.z), h = tl.laneH, r = Math.min(10, w / 2), g = mix(REST, 245, k);
    let s = `<clipPath id="c${id}"><rect x="${fx(xa)}" y="${y}" width="${fx(w)}" height="${h}" rx="${r}"/></clipPath>`
      + `<rect x="${fx(xa)}" y="${y}" width="${fx(w)}" height="${h}" rx="${r}" fill="${grey(g)}"/><g clip-path="url(#c${id})">`;
    // the stem's own waveform, mirrored, one point every 3 px; on a lit clip the part already played is darker
    const n = Math.max(2, Math.floor(w / 3)), cy = y + h / 2, amp = h / 2 - 8, top = [], bot = [];
    for (let j = 0; j <= n; j++) {
      const x = xa + (j / n) * w, tc = c.start + (j / n) * (c.end - c.start), half = 1.5 / v.pxs;
      const a = Math.max(0.5, Math.pow(envelopeRms(envelopes[c.stem], tc - half, tc + half), 0.75) * amp);
      top.push(`${fx(x)} ${fx(cy - a)}`); bot.push(`${fx(x)} ${fx(cy + a)}`);
    }
    const d = `M${top.join("L")}L${bot.reverse().join("L")}Z`, ink = mix(255, 16, k), played = v.X(v.tt);
    s += `<path d="${d}" fill="rgba(${Math.round(ink)},${Math.round(ink)},${Math.round(ink)},${mix(0.2, 0.22, k).toFixed(3)})"/>`;
    if (k > 0 && played > xa) s += `<clipPath id="p${id}"><rect x="${fx(xa)}" y="${y}" width="${fx(Math.min(played, xb) - xa)}" height="${h}"/></clipPath><path d="${d}" clip-path="url(#p${id})" fill="rgba(16,16,16,${(0.62 * k).toFixed(3)})"/>`;
    // the label sticks to the visible left edge of a long clip; labels leave during the pull-back, so the whole post
    // reads as shape
    const lw = c.w + 26, lx = clamp(xa, xb - lw, tl.x0 + STICK);
    const label = (x) => `<rect x="${fx(x)}" y="${y}" width="${lw}" height="${h}" fill="${grey(g)}"/>`
      + `<text x="${fx(x + 12)}" y="${y + h / 2 + 9}" font-family="${FONT}" font-weight="500" letter-spacing="-0.4" font-size="${LABEL.clip}" fill="${k > 0.5 ? COLOR.ground : "#d4d4d4"}">${esc(c.label)}</text>`;
    if (c.fits && v.z < 1) s += `<g opacity="${(1 - v.z).toFixed(3)}">${label(lx)}</g>`;
    // a sounding clip too short for its words shows them anyway, on a tab over its neighbours, only while it sounds
    else if (t >= c.start && t <= c.end && v.z < 1) {
      const x = clamp(tl.x0 + STICK, tl.x1 - lw, xa);
      over.push(`<g opacity="${(1 - v.z).toFixed(3)}"><clipPath id="o${id}"><rect x="${fx(x)}" y="${y}" width="${lw}" height="${h}" rx="10"/></clipPath><g clip-path="url(#o${id})">${label(x)}</g>`
        + `<rect x="${fx(x + 0.5)}" y="${y + 0.5}" width="${lw - 1}" height="${h - 1}" rx="10" fill="none" stroke="${COLOR.lineStrong}"/></g>`);
    }
    return s + `</g><rect x="${fx(xa + 0.5)}" y="${y + 0.5}" width="${fx(w - 1)}" height="${h - 1}" rx="${r}" fill="none" stroke="${COLOR.line}"/>`;
  }

  function timePill(v, op) {
    const str = timecode(v.tt), wText = [...str].reduce((a, ch) => a + (/\d/.test(ch) ? TIME.digit : TIME.sep), 0), pw = wText + 28, ph = 38;
    const cx = clamp(tl.x0 + pw / 2, tl.x1 - pw / 2, v.head), y = tl.ruler - 2;
    let s = `<rect x="${fx(cx - pw / 2)}" y="${y}" width="${fx(pw)}" height="${ph}" rx="10" fill="${COLOR.fg}"/>`, x = cx - wText / 2;
    for (const ch of str) {
      const adv = /\d/.test(ch) ? TIME.digit : TIME.sep;
      s += `<text x="${fx(x + adv / 2)}" y="${y + 27}" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="${TIME.size}" fill="${COLOR.ground}">${ch}</text>`;
      x += adv;
    }
    return `<g opacity="${op.toFixed(3)}">${s}</g>`;
  }

  // Ruler: bar numbers with beat ticks from the tempo, or, for a song edited to picture whose bars don't hold,
  // seconds (with beat ticks when there is a tempo).
  function rulerSvg(v) {
    const ry = tl.ruler + 14;
    let s = `<rect x="${tl.x0}" y="${ry + 20}" width="${tl.x1 - tl.x0}" height="1" fill="${COLOR.line}"/>`;
    const tick = (x) => `<rect x="${fx(x - 0.75)}" y="${ry + 6}" width="1.5" height="14" fill="${COLOR.lineStrong}"/>`;
    const beatTick = (x) => `<rect x="${fx(x - 0.5)}" y="${ry + 14}" width="1" height="6" fill="${COLOR.line}"/>`;
    const num = (x, label) => `<text x="${fx(x + 6)}" y="${ry + 17}" font-family="${FONT}" font-size="20" fill="${COLOR.faint}">${label}</text>`;
    if (spec.ruler === "seconds") {
      const every = v.pxs < 40 ? 10 : 2;
      for (let sec = 0; sec < duration; sec++) {
        const x = v.X(sec);
        if (x < tl.x0 - 40 || x > tl.x1 + 40 || (v.pxs < 40 && sec % 5)) continue;
        s += tick(x);
        if (sec % every === 0 && Math.abs(x + 22 - v.head) > 88) s += num(x, timecode(sec).slice(0, -2));
      }
      if (grid && v.pxs * grid.beat > 14) for (let tc = grid.firstBeat; tc < duration; tc += grid.beat) { const x = v.X(tc); if (x > tl.x0 - 4 && x < tl.x1 + 4) s += beatTick(x); }
      return s;
    }
    const barStep = v.pxs * grid.bar < 80 ? 2 : 1;
    for (let b = 0; grid.firstBar + b * grid.bar < duration; b++) {
      const tc = grid.firstBar + b * grid.bar, x = v.X(tc);
      if (x < tl.x0 - 30 || x > tl.x1 + 30) continue;
      s += tick(x);
      if (b % barStep === 0 && Math.abs(x + 12 - v.head) > 78) s += num(x, b + 1);
      if (v.pxs * grid.beat > 14) for (let q = 1; q < 4; q++) s += beatTick(v.X(tc + q * grid.beat));
    }
    return s;
  }

  async function svg(t) {
    const v = view(t);
    let s = `<clipPath id="win"><rect x="${tl.x0}" y="${tl.ruler - 10}" width="${tl.x1 - tl.x0}" height="${tl.bottom - tl.ruler + 20}"/></clipPath><g clip-path="url(#win)">`, id = 0;
    s += rulerSvg(v);
    // V1 and its transitions; the playing shot's name, white, goes on top and may pass a short clip's edge
    s += `<rect x="${tl.x0}" y="${tl.video}" width="${tl.x1 - tl.x0}" height="${tl.videoH}" rx="10" fill="rgba(255,255,255,0.025)"/>`;
    const now = shots.find((sh) => v.tt >= sh.start && v.tt < sh.end);
    const lx = now ? clamp(tl.x0 + 8, tl.x1 - now.w - 28, v.X(now.start) + 9.5) : 0, busy = now ? [lx, lx + now.w + 20] : null;
    for (const sh of shots) s += await shotSvg(sh, v, id++, busy);
    for (const tr of spec.transitions) s += transitionSvg(tr, v);
    if (now && v.z < 1) {
      s += `<g opacity="${(1 - v.z).toFixed(3)}"><rect x="${fx(lx)}" y="${tl.video + 8}" width="${now.w + 20}" height="36" rx="9" fill="${COLOR.fg}"/>`
        + `<text x="${fx(lx + 10)}" y="${tl.video + 34}" font-family="${FONT}" font-weight="500" letter-spacing="-0.3" font-size="${LABEL.shot}" fill="${COLOR.ground}">${esc(now.name)}</text></g>`;
    }
    lanes.forEach((lane, li) => {
      const y = tl.laneY(li), over = [];
      s += `<rect x="${tl.x0}" y="${y}" width="${tl.x1 - tl.x0}" height="${tl.laneH}" rx="10" fill="rgba(255,255,255,0.025)"/>`;
      for (const c of lane.clips) s += clipSvg(c, y, v, t, id++, over);
      s += over.join("");
    });
    s += "</g>";
    // edges fade into the ground while scrolling
    const fe = (1 - v.z).toFixed(3), fy = tl.ruler + 34, fh = tl.bottom - fy + 4;
    s += `<linearGradient id="fl" x1="0" x2="1"><stop offset="0" stop-color="${COLOR.ground}" stop-opacity="${fe}"/><stop offset="1" stop-color="${COLOR.ground}" stop-opacity="0"/></linearGradient>`
      + `<linearGradient id="fr" x1="1" x2="0"><stop offset="0" stop-color="${COLOR.ground}" stop-opacity="${fe}"/><stop offset="1" stop-color="${COLOR.ground}" stop-opacity="0"/></linearGradient>`
      + `<rect x="${tl.x0}" y="${fy}" width="56" height="${fh}" fill="url(#fl)"/><rect x="${tl.x1 - 72}" y="${fy}" width="72" height="${fh}" fill="url(#fr)"/>`;
    // track headers: tag and name; a sounding track reads brighter
    const header = (y, h, tag, name, k) => `<text x="${tl.head}" y="${y + h / 2 - 8}" font-family="${FONT}" font-weight="500" font-size="19" fill="${COLOR.faint}">${tag}</text>`
      + `<text x="${tl.head}" y="${y + h / 2 + 22}" font-family="${FONT}" font-size="25" letter-spacing="-0.4" fill="${grey(mix(163, 245, k))}">${esc(name)}</text>`;
    if (spec.bpm) s += `<text x="${tl.head}" y="${tl.ruler + 30}" font-family="${FONT}" font-size="21" letter-spacing="-0.3" fill="${COLOR.subtle}">${Math.round(spec.bpm)} BPM</text>`;
    s += header(tl.video, tl.videoH, "V1", "Video", 1 - v.z);
    lanes.forEach((lane, li) => { s += header(tl.laneY(li), tl.laneH, `A${li + 1}`, lane.name, Math.max(0, ...lane.clips.map((c) => lit(c, t))) * (1 - v.z)); });
    // the playhead and the running time, gone once the post is whole
    const ho = 1 - easeOut(T(t, pull.b, pull.b + 0.4));
    if (ho > 0) s += `<rect x="${fx(v.head - 1)}" y="${tl.ruler + 30}" width="2" height="${tl.bottom - tl.ruler - 22}" fill="${COLOR.fg}" fill-opacity="${ho.toFixed(3)}"/>` + timePill(v, ho);
    return s;
  }

  function footer(t) {
    const v = view(t), i = actIndexAt(acts, v.tt), act = acts[i], n = wordAt(t, act.start, 0);
    return `<g opacity="${(1 - v.z).toFixed(3)}"><text x="${tl.head}" y="${(FOOTER.y + n.dy * FOOTER.size).toFixed(1)}" font-family="${FONT}" font-weight="500" font-size="${FOOTER.size}" letter-spacing="-0.5" fill="${COLOR.faint}" opacity="${n.opacity.toFixed(3)}">${actNo(i)}</text>`
      + wordReveal(act.m, tl.head + actNoW + FOOTER.gap, FOOTER.y, t, act.start + WORD_REVEAL.stagger) + `</g>`;
  }

  return { svg, footer };
}
