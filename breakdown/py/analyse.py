"""Measures a film for a sound breakdown: its shots, the tempo of its drum stem, and when each stem is playing.

    python3 -I py/analyse.py <film> <fps> <stems folder> <out.json>

Shots: hard cuts are one-frame spikes in frame-to-frame change; soft boundaries (whip pans, match moves, dissolves)
are where the frames a third of a second apart differ while each side holds still. Tempo: the drum stem's onsets,
autocorrelated at bar-length lags, refined to the grid that puts the most onsets on its beats; the downbeat is the beat
of four with the most low end. Stems: runs where each stem is within its floor of its own peak, with their loudness.

Everything here is a candidate. Check shots against the contact sheet and clips against the spectrograms, by ear.
Needs numpy and ffmpeg.
"""
import json
import os
import subprocess
import sys

import numpy as np

SR = 22050
AUDIO = (".mp3", ".wav", ".flac", ".m4a", ".ogg")


def decode(src, w, h, fmt, ch):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-vf", f"scale={w}:{h}", "-pix_fmt", fmt, "-f", "rawvideo", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, h, w, ch).astype(np.float32)


def shots(src, fps):
    gray = decode(src, 160, 90, "gray", 1)[..., 0]
    n = len(gray)
    whole = np.abs(np.diff(gray, axis=0)).mean((1, 2))                                        # frame-to-frame change
    blocks = np.abs(np.diff(gray.reshape(n, 18, 5, 32, 5).mean((2, 4)), axis=0)).mean((1, 2))  # on 5×5 blocks, ignoring grain
    hard = []
    for i in range(len(whole)):
        nb = np.concatenate([whole[max(0, i - 3):i], whole[i + 1:i + 4]])
        nbb = np.concatenate([blocks[max(0, i - 4):i], blocks[i + 1:i + 5]])
        spike = len(nb) and whole[i] > 12 and whole[i] > 2.5 * np.median(nb) + 4
        block = len(nbb) and blocks[i] > 4 and blocks[i] / (np.median(nbb) + 1) > 3
        if (spike or block) and not (hard and i - hard[-1] <= 2):
            hard.append(i)
    rgb = decode(src, 32, 18, "rgb24", 3)
    k = 8

    def dist(i, j):
        return np.abs(rgb[i] - rgb[j]).mean()

    across = np.array([dist(max(0, i - k), min(n - 1, i + k)) for i in range(n)])
    within = np.array([0.5 * (dist(max(0, i - k), max(0, i - k // 2)) + dist(min(n - 1, i + k // 2), min(n - 1, i + k))) for i in range(n)])
    score = across - 1.5 * within
    soft = []
    for i in range(k, n - k):
        if score[i] > 18 and score[i] == score[i - k:i + k + 1].max() and all(abs(i - (h + 1)) > 0.3 * fps for h in hard):
            lo, hi = max(0, i - int(0.45 * fps)), min(len(blocks), i + int(0.45 * fps))
            soft.append(lo + int(blocks[lo:hi].argmax()))                                   # the sharpest change near it

    def t(i):
        return round((i + 1) / fps, 3)
    cuts = sorted([{"t": t(i), "kind": "hard"} for i in hard] + [{"t": t(i), "kind": "soft"} for i in soft], key=lambda c: c["t"])
    return cuts, round(n / fps, 3), len(hard), len(soft)


def load(path, af=None):
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR)] + (["-af", af] if af else []) + ["-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)


HOP = 220                                                                                    # 10 ms
# per stem: (floor below its own peak in dB, gap that joins two runs in s, shortest run kept in s)
FLOOR = {"drums": (-34, 0.18, 0.1), "bass": (-30, 0.06, 0.08), "vocals": (-36, 0.06, 0.06)}


def activity(path, name):
    floor, gap, minlen = FLOOR.get(name, (-36, 0.25, 0.12))
    x = load(path)
    m = len(x) // HOP
    db = 20 * np.log10(np.sqrt((x[:m * HOP].reshape(m, HOP) ** 2).mean(1)) + 1e-9)
    smooth = np.convolve(db, np.ones(5) / 5, "same")
    on = smooth > smooth.max() + floor
    runs, i = [], 0
    while i < m:
        if not on[i]:
            i += 1
            continue
        j = i
        while j < m and on[j]:
            j += 1
        if runs and (i - runs[-1][1]) * HOP / SR < gap:
            runs[-1][1] = j
        else:
            runs.append([i, j])
        i = j
    clips = [{"start": round(a * HOP / SR, 3), "end": round(b * HOP / SR, 3), "peakDb": round(float(db[a:b].max()), 1)}
             for a, b in runs if (b - a) * HOP / SR >= minlen]
    return {"peakDb": round(float(db.max()), 1), "audible": bool(db.max() > -35), "clips": clips}


def tempo(drums, first_hit):
    hop = 110
    fr = SR / hop

    def flux_of(x):
        m = len(x) // hop
        return np.concatenate([[0], np.maximum(0, np.diff(np.log(np.sqrt((x[:m * hop].reshape(m, hop) ** 2).mean(1)) + 1e-5)))])
    flux = flux_of(load(drums))
    seg = flux - flux.mean()
    ac = np.correlate(seg, seg, "full")[len(seg) - 1:]

    def lag(bpm, k):
        return np.interp(k * 60 / bpm * fr, np.arange(len(ac)), ac)
    # bar-length lags: beat lags alone mistook 94 BPM for 4/3 of it
    coarse = max(np.arange(70, 180, 0.05), key=lambda v: lag(v, 2) + lag(v, 4) + 0.5 * lag(v, 8))

    def fit(bpm):
        beat, best = 60 / bpm, (0, 0)
        for o in np.arange(0, beat, 0.005):
            idx = (np.arange(o, len(flux) / fr, beat) * fr).astype(int)
            idx = idx[(idx > 1) & (idx < len(flux) - 2)]
            best = max(best, (float(np.mean([flux[i - 1:i + 2].max() for i in idx])), float(o)))
        return best
    bpm = max(np.arange(coarse - 1.5, coarse + 1.5, 0.05), key=lambda v: fit(v)[0])
    beat, phase = 60 / bpm, fit(bpm)[1]
    first = phase + np.ceil((first_hit - 0.1 - phase) / beat) * beat                         # the first beat with drums
    low = flux_of(load(drums, "lowpass=f=150"))
    acc = np.zeros(4)
    for k, s in enumerate(np.arange(first, len(low) / fr - 0.1, beat)):
        acc[k % 4] += low[max(0, int(s * fr) - 3):int(s * fr) + 4].max()
    clear = np.sort(acc)[-1] > 1.25 * np.sort(acc)[-2]                                       # a clear downbeat, else the first beat
    return {"bpm": round(float(bpm), 2), "firstBeat": round(float(first), 3),
            "barAnchor": round(float(first + (int(acc.argmax()) if clear else 0) * beat), 3), "downbeatEnergy": acc.round(1).tolist()}


def main():
    if len(sys.argv) != 5:
        sys.exit("usage: analyse.py <film> <fps> <stems folder> <out.json>")
    src, fps, stem_dir, out = sys.argv[1], float(sys.argv[2]), sys.argv[3], sys.argv[4]
    cuts, duration, n_hard, n_soft = shots(src, fps)
    files = {os.path.splitext(f)[0]: os.path.join(stem_dir, f) for f in sorted(os.listdir(stem_dir)) if f.lower().endswith(AUDIO)}
    stems = {name: activity(path, name) for name, path in files.items()}
    beat = None
    if "drums" in stems and stems["drums"]["audible"]:
        beat = tempo(files["drums"], stems["drums"]["clips"][0]["start"] if stems["drums"]["clips"] else 0)
    with open(out, "w") as f:
        json.dump({"duration": duration, "fps": fps, "cuts": cuts, "tempo": beat, "stems": stems}, f, indent=1)
    print(f"{len(cuts)} boundaries ({n_hard} hard, {n_soft} soft), tempo {beat and beat['bpm']} BPM, stems "
          + ", ".join(f"{k} {len(v['clips'])}{'' if v['audible'] else ' (inaudible)'}" for k, v in stems.items()))


if __name__ == "__main__":
    main()
