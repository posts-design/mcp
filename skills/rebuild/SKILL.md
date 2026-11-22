---
name: rebuild
description: Rebuild your person's own video as an editable HyperFrames project, frame for frame - type, shapes, UI, logos, product shots and abstract motion redrawn in HTML, the original sound kept - and check it against the original until it matches. Use when someone wants their own video as code, to edit its words, colours, size or language, or asks to rebuild, reverse, recreate or exactly copy a video they made or have the rights to. To make a new film for their product after a launch film they like, use remake.
argument-hint: "<your video file>"
---

# Rebuild

Your person's video goes in; an HTML project comes out whose render matches it frame for frame and that they can
edit: a word, a colour, the size, the language. It suits films made of graphics: type, shapes, UI, logos, product
shots, abstract motion. Footage (people, places, live action) stays as clips cut from the original. Rebuild only a
video your person made or has the right to use; for someone else's film, use remake, which makes a new film for
their product.

## 1. Start

- **The video.** A file on their machine, or a link to their own post (download it with `yt-dlp` if they have it).
- **Their source files**, if they have them: logo as SVG, font files, images and product shots. Look in their
  project first (`public/`, design tokens, the site's CSS) and say what you found. Source files beat anything cut
  from frames.
- HyperFrames needs Node.js 22 or later and FFmpeg, and downloads a headless Chrome on its first render. Tell your
  person what will download before anything installs, and ask once. Turn its usage telemetry off for every command:
  `export HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1`. Start with `npx hyperframes init film --skip-skills` and copy
  the video into the project. If the HyperFrames skills are installed, follow them for how compositions, timelines
  and assets are written; this skill decides what the film shows.

## 2. Measure the original

1. **Its frame.** `ffprobe` its width, height, frame rate and frame count. The root composition is that size and rate
   exactly (a fractional rate such as `30000/1001` stays a fraction), and its duration is frames ÷ rate. A file can
   carry a cover image as a second video stream: use the first (`0:v:0`). Frame 0 may be a poster, a still of
   another moment: compare it with frame 1.
2. **Every cut, to the frame.** A scene score misses jump cuts and hard switches between graphics, so measure the
   change between consecutive frames:
   `ffmpeg -i original.mp4 -map 0:v:0 -vf "scale=320:-2,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=change.txt" -f null -`.
   Its line i is the change from frame i to frame i + 1. Spikes are cuts, switches and flashes; look at the frames
   either side of each to tell them apart. Many graphic films have few hard cuts: their changes are grows, reveals,
   pull-backs and blurs, which show as a run of raised lines. Write a time as its frame ÷ rate, rounded down: at
   30 fps frame 83 is `2.766666`, and `2.767` lands a frame late.
3. **Consecutive frames wherever something changes**: each cut, entrance, exit and transition, a few frames either
   side, cropped to the part that moves (`ffmpeg -ss <t> -i original.mp4 -frames:v 12 -vf "crop=w:h:x:y,tile=6x2" sheet.png`).
   Stills a second apart miss which way things enter and leave, blur and dissolves at cuts, and one-frame flashes.
4. **A shot list** before any code: a row per shot and per visible change inside it, with its frames, what is on
   screen, its box in source pixels, and how it arrives, changes and leaves. Follow every large word from the frame
   it appears to the frame it leaves: how it arrives (pop, scale, fade, typed, word by word, wipe), what it does on
   screen (a fill sweeping across, a counter, a colour change), how it leaves, and what its letters are made of
   (solid, gradient, outline, glow). For a move, track one edge frame by frame and fit its curve (a power ease, an
   exponential settle) and its duration; those numbers go straight into the timeline. Save the list as `SHOTS.md` in
   the project: it is how your person finds things later.

## 3. Build

- One composition per shot, at its measured frames; a shot that shrinks into or grows out of another stays in one
  composition with it. Graphics change on exact frames: something fully there on frame
  241 is set there, not faded in; tween only what you saw move over several frames. A dissolve, wipe or blur flash at
  a cut is part of the cut: rebuild it over its measured frames.
- **Type.** Their font files first; otherwise match the family by its traits (geometry, contrast, x-height,
  terminals), try two or three at the measured size and keep the closest. Size each line from its ink: crop the line
  in a source frame and in a still of yours, compare the ink's height and width, and adjust the size, then the letter
  spacing, until both agree within a few pixels. Compare darkness for weight, and look for an outline or shadow. Keep
  the original's small text: this is a copy, not a redesign.
- **Images, logos, product shots.** Their source files first: compare each with the frame where it appears (the
  right logo variant, the same crop), and use only those that are in the film. Otherwise cut each from the original
  where it is largest, on its own box. Never draw a logo by hand, and never play the original's whole frame.
- **Moving pictures inside the frame** (playing cards, screen recordings) are clips cut from the original at their
  box, over the frames where nothing else crosses that box; rebuild what passes over them.
- **Footage.** A shot of people or live action is cut from the original as a clip at its box and frames, muted;
  graphics over it are rebuilt on top. Text burned into the footage comes along with it: say so.
- **Backdrops** cover most of the frame: sample the empty background at several moments and match its colour,
  gradient and brightness over time. Grain and noise: match the look, not the pixels.
- **Fast moves** are blurred in the original; sharp shapes at speed look wrong. Blur along the move while it is fast:
  an SVG `feGaussianBlur` on the moving wrapper with its `stdDeviation` tweened (`"24 0"` smears sideways); CSS
  `blur()` blurs every way.
- **Sound** is the original's: one `<audio>` from the original file over the whole film, every clip muted.
- **A still of yours**, to size type or check a layout: render a small test project holding only those lines (seconds),
  or pull the frame from your last render with ffmpeg. These don't count as rounds.
- `npx hyperframes lint` after the first pass and after every structural change. Fix what differs from the original;
  a copy keeps the original's choices, so words rising from under a mask, small text and short holds it flags can stay.
- Hand over HTML your person can edit by hand. If you generate it with a script, say that running the script again
  overwrites their edits.

## 4. Compare and fix

1. `npx hyperframes render --quality draft -o draft.mp4`. It has the original's size and frame count.
2. Score every frame against the original:
   `ffmpeg -i draft.mp4 -i original.mp4 -lavfi "[0:v:0][1:v:0]ssim=stats_file=ssim.txt" -f null -`. The `All:` figure it
   prints is the whole film's similarity (1 is identical; a close rebuild of graphics scores above 0.9), and
   `ssim.txt` scores each frame.
3. Look at the ten lowest-scoring moments and every cut beside the original's frame (`hstack` the two): a missing
   or extra element, a cut early or late, a wrong size, position, weight or colour.
4. Fix what you can see, render with `--quality delivery`, score again, and stop there: two rounds.

## Hand over

Give your person the film's path, its length beside the original's, its similarity score, and how to edit it: which
file holds the words, the colours and the timing. List what is rebuilt in code, what is cut from the original
(footage, playing pictures, images, logos), which fonts are substitutes and what is approximate. Ask them to watch
it once beside the original before using it.

## Notes

- Never claim to have watched the video in real time: you read its frames.
- A long film rebuilds in parts: measure and list every shot first, then build and compare a section at a time.
