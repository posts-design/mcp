---
name: remake
description: Remake a launch film your person likes, shot by shot, for their own product - its scenes, layout, motion and timing, with their words, logo, colours and fonts - built in HTML with HyperFrames and rendered on their machine. Use when someone wants a launch video "like this one", "in the style of" a brand's film, or asks to remake, recreate or closely copy a launch film, product film or teaser for their product. To plan a launch video from several references instead, use launch-video-direction.
argument-hint: "<the film you like> for <your product>"
---

# Remake

You remake one launch film your person likes for their product: the reference's scenes, where everything sits, its
moves and its timing, with their words, product, logo, colours and fonts. The posts.design MCP (the `posts` server in
this plugin) holds the film's scenes and stills; HyperFrames turns your HTML into the video on their machine.

## 1. Start

Call `get_my_access` (free). If the posts.design tools are missing or ask for sign-in, tell your person to run `/mcp`,
choose posts.design and sign in, then stop. On the first call, share the plan and credits left from its `summary` in
one line, leaving out any sentence that offers Pro. A remake reads the film scene by scene with
`get_video_scenes` and `get_scene_frames`, which come with Pro. Free opens one film in full: when
`get_my_access`'s `pro.freeFilm.open` is true, tell your person this remake uses their free film and confirm which film
before the first scene read. When `pro.freeFilm` names another film, only that one can be remade on Free: say so in a
sentence with the link from `pro`, and stop. A film of about 30 s spends about 15 to 25 credits.

## 2. The brief

You need, in one message if anything is missing:

- **The film.** A posts.design link or a brand and what it launched. Find it with `search_references`
  (`format: "video"`, the brand in `brand`); if they want ideas, show three to five videos that fit their product with
  their links and let them pick. The film must be in the library with `video.hasBreakdown` true.
- **The product, in facts.** What it does and for whom, and the numbers or claims they want in the film. Use only
  these: a remake copies the reference's shots, never its claims.
- **The brand.** Its name, logo as SVG, colours and font files. In their project, look for them yourself first
  (design tokens, `public/`, the site's CSS) and say what you found.
- **How close.** By default every scene, its layout, moves and timing; they may ask for less in their own words
  ("just the pacing", "its opening only") or for a different length. Say in one line what you will keep.

## 3. Study the reference

1. `get_video_breakdown` for its beats, hook, type, colour and end card.
2. `get_video_scenes` for every scene's start and end. Your film keeps these times unless your person asked otherwise.
3. `get_scene_frames` for each scene, one call per scene, and look at every still. Use `get_scene_clip` only for a
   move you can't read from stills.

Write a beat list before any code: one row for every change you can see in the stills (a card or label changing, a
line appearing or being typed, a move starting or settling, a cut), with its time to the quarter second, what is on
screen and where, and what it becomes for the product. A scene usually holds several beats; a card that changes every
second is a row per change. Count what fills the frame (cards, lines of code, list items, questions) and keep those
counts. Note what each beat ends on: what stays typed, lit or on screen into the next one. Then the **meaning pass**, row by row: would this make sense to someone who knows
the product? A copied move that means nothing for it goes or changes: a cursor clicking something nobody would
click, the product speaking, replying or acting where it never does, a feature or number it doesn't have, a screen
it doesn't have. Show your person the beat list and carry on unless they change it.

## 4. Set up HyperFrames

HyperFrames needs Node.js 22 or later and FFmpeg, and downloads a headless Chrome on its first render.
Tell your person what will download before anything installs, and ask once. Turn its usage telemetry off for every
command: `export HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1`. Start the project with
`npx hyperframes init film --skip-skills`. If the HyperFrames skills are installed, follow them for how compositions,
timelines and assets are written; this skill decides what the film shows.

## 5. Build

- One composition per scene, at the scene's times, 1920×1080 (or the reference's shape), 30 fps, silent.
- Their logo, colours and fonts throughout. Never the reference's logo, brand name, copy, footage or images; product
  screens are drawn in HTML and CSS from their real UI, simply. Load every font and image from the project.
- **Its timing, beat for beat.** Every beat starts within a quarter second of the reference's, and the film is the
  reference's length, unless your person asked for another. Write your lines to fit the reference's holds (about
  three words a second): shorten the words rather than hold them longer. A line that can't be shortened may hold
  longer only by taking the time from the next beat in the same scene, so every scene still ends on the reference's
  cut.
- **Readable.** Text people need to read is at least 45 px tall at 1920 wide. Small labels, counters and timestamps
  the reference has can stay small as texture, or go.
- Settled frames hold still: no drift on a frame that is meant to be read.
- `npx hyperframes lint` after the first pass and after every structural change; fix every error.

## 6. Render, compare, fix

1. `npx hyperframes render --quality draft -o draft.mp4`. Check it isn't empty and its length matches the root
   composition.
2. Pull your film's frames at the reference stills' times (`ffmpeg -i draft.mp4 -vf fps=4 stills/f%04d.png` gives a
   frame every quarter second) and look at each beside the reference still of the same second, through the whole film.
   Go down your beat list: does each beat start at its time, end in the same state, with the same layout, sizes,
   positions, counts and move? List every beat that is early, late, missing or extra. Look for broken frames too:
   half-turned or mirrored letters, empty frames, one picture showing through another.
3. Check readability by machine, scene by scene: `npx hyperframes check <scene folder> --json --at-transitions`
   (a whole film can run past the check's two-minute limit; then it reports `check_runtime_failure`). Fix every
   `text_below_floor` finding; a `line_unread` finding means the line has more words than its hold: shorten it. Its size floor (2.6% of the frame's short side, 28 px at 1080) is
   below this skill's 45 px, so also look for text between the two on your stills.
4. Fix what differs, run the meaning pass again on what you see, and render once more with `--quality delivery`.
   Compare that render the same way; keep fixing while a beat is more than a quarter second off or a detail differs.

## Hand over

Give your person the film's path and length beside the reference's, the beats you changed from the reference and why (meaning,
readability, length), and anything you assumed about the product for them to confirm. The film is silent: suggest
music cut to its scene changes. Name the reference with its posts.design link and its original source. Ask them to
watch it once in real time before posting.

## Notes

- A `notice` on a result or a `message` on a refusal is written for your person: pass it on in a sentence with its link.
- `rate_limited` or `in_progress` carry `retryAfterSeconds`: wait that long, then retry once. Run reads one after
  another, not all at once.
- Never claim to have watched the reference: you read its scenes and stills.
