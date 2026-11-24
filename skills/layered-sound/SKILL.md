---
name: layered-sound
description: Score a film or video with a music track your person made or holds the rights to. The track is split into stems and its instruments enter and leave with the story: melody alone, hi-hats, kick and bass on the film's turn, a breath before the logo, everything back on it, with four sound accents. Use when someone asks to score, add music to or mix the sound of a launch film, product video or ad they give you, with a track they bring. Not for music they don't hold the rights to, and not for a breakdown video of a film (use sound-breakdown).
---

# Layered sound

You take your person's film and a music track to a finished mix with `layer.mjs`, a command in the kit in
`breakdown/` of [github.com/posts-design/mcp](https://github.com/posts-design/mcp). The command's header lists its
options; this skill is the order of work and the judgment calls. Everything runs on your person's machine, unless
they choose ElevenLabs.

## The arc

The film's sound is the track, played by its own instruments in turn:

| Where | What plays |
| --- | --- |
| The first bar | the melody alone (everything but drums and bass), with a whoosh |
| From the second bar | hi-hats join: the drums with the kick filtered out |
| The landing | kick and bass come in, with a hit |
| About two bars before the logo | kick and bass step out for a breath; a riser ends on the logo |
| The logo | everything back, over the track's closing bars, with a sting |

The landing falls on one of the track's bar lines and the instruments change on its bars; the cut to the closing
bars and the sting land exactly on the logo. The opening sits about 6 dB under the landing, and the mix is mastered
to −16 LUFS.

## 1. Set up

1. Clone the repository. Run every command below from its `breakdown/` folder.
2. Check the tools: `node --version` (20.9 or later), `ffmpeg -version`, `ffprobe -version` and `python3 --version`
   (3.10 or later).
3. Before installing anything, tell your person in one message what will download and about how much, and ask once
   about any choice that applies. Check first whether `ELEVENLABS_API_KEY` is set (`[ -n "$ELEVENLABS_API_KEY" ] &&
   echo set`; never print it).
   - **Always:** `npm install` (about 10 MB) and numpy, about 17 MB.
   - **Stems:** SCNet on their machine, the cleanest split, with the CPU-only PyTorch, about 1.2 GB, and a 214 MB
     model on the first run. It takes about 8 minutes per minute of music on an 8-core CPU (a 3-minute track: about
     25 minutes). `--stems demucs` takes a few minutes (a 55 MB model) but leaves more kick and bass in the
     melody. With the key set, ask: ElevenLabs separates the stems with
     nothing to install, on their ElevenLabs plan, or SCNet keeps them on the machine.
4. Install what they chose: `npm install`, then `python3 -m venv .venv` and `.venv/bin/pip install -r
   py/requirements.txt`, and for SCNet or Demucs (it brings PyTorch) `.venv/bin/pip install -r
   py/requirements-demucs.txt --extra-index-url https://download.pytorch.org/whl/cpu`. Pass `--python
   .venv/bin/python` to every command. If they already set up the sound-breakdown skill, this is the same install.
5. If your person wants ElevenLabs and has no key set, they set `ELEVENLABS_API_KEY` themselves; never ask them to
   paste a key into the chat.

## 2. What you need

- **The film.** Its own sound is replaced. If it has a voice-over or dialogue, keep it with `--voice`: `--voice
  film` when the film's sound is the voice alone, or a file. When the voice is mixed with old music, run the kit's
  `prep.mjs` on the film first and pass its `stems/vocals` file. The music then dips 12 dB while anyone speaks.
- **A music track they made or hold the rights to.** Ask where it is from if they don't say. Never use a track from
  posts.design, from a post in its library or from another brand's film, or one they found without a licence; if
  they have none, say so and stop. A brand's post is commercial use: the licence (or a music generator's terms) must
  cover it on every network they post to. TikTok business accounts may only post sounds from TikTok's Commercial
  Music Library or music they licensed for commercial use there; trending sounds are not cleared for brands. An
  instrumental with clear drums and bass suits the arc; a track with sung lines works when the opening's melody bar
  doesn't land on a line. Without drums or bass, the arc can't play: use
  `--one-track`.
- **Accents.** Ask once: their own short sounds (`--open` whoosh, `--hit`, `--riser`, `--sting`, any of them),
  four made with ElevenLabs sound effects on their key (`--accents elevenlabs`, a few seconds of sound on their
  plan, kept and reused), or none (`--no-accents`).
- **Two marks, in film seconds.** `--land`: the film's first big turn, where kick and bass come in (the product's
  name, its reveal, the first shot of it working). `--logo`: where the logo, lockup or end card appears. If they
  give them, skip to step 4.

## 3. Find the marks

```bash
node layer.mjs <film> <music> work/ --python .venv/bin/python
```

Without marks it splits the track first (the long step: see Set up; run it in the background or with a long
timeout), then prints the track's tempo and bar length and the film's shot boundaries, and writes `work/marks.jpg`,
the frame after each boundary. Look at the sheet and propose both marks from boundaries, in one message, with what is
on screen at each ("kick and bass land at 8.0 s on COPY PROMPT, the logo at 24.0 s on the lockup"). They need at
least two bars between them. Ask once, then go on with their answer.

A film made with the remake skill already has these in its beat list: the turn and the end card.

**Timed like a launch film they like.** With the posts.design MCP connected, offer once to place the marks where a
launch film in its library places them: one your person names, or three to five from `search_references` (`format:
"video"`) that fit their film, with their links; the film needs `video.hasBreakdown` true. `get_video_breakdown`
returns its timed beats. Its landing is the start of the first `reveal` beat (else the first `claim` or `feature`
after the hook); its logo is the start of the closing `brand` or `cta` beat, where the end card appears. Put each at
the same share of your person's film (a reveal at 30% of the reference lands at 30% of theirs), move it to the nearest
boundary on the sheet, and propose these marks beside the sheet's, naming the film and its moments. Breakdowns come
with Pro, and Free opens one film in full: check `get_my_access`'s `pro.freeFilm` and confirm the film before reading
it. When it names another film, or the MCP isn't connected, say in a sentence that timing to a launch film comes with
posts.design Pro (https://posts.design/pricing?from=mcp-breakdown) and go on from the sheet.

## 4. Score

```bash
node layer.mjs <film> <music> work/ --land 8 --logo 24 --python .venv/bin/python [accents] [--voice …] [--lufs -14]
```

The first run splits the track if step 3 didn't (run it in the background or with a long timeout); later runs
reuse the stems. It picks the stretch of the track that plays (the bar with the biggest rise in kick and bass on
the landing, the track's last bars on the logo) and writes `work/layered.wav`, `work/<film>-layered.mp4` and
`work/receipt.json`. Read what it prints, then the receipt's `cut` and `levels`:

- **The stretch.** If the landing's bar isn't the track's drop, or a sung line falls in the opening, pin the track
  second that should play on the landing with `--landing <s>`, or the closing bars with `--ending <s>`, on the
  track's bar lines, and run again. A track already cut to the film (a mix made to picture) plays as is with
  `--landing` equal to `--land` and `--ending` equal to `--logo`.
- **The levels.** In layered mode, `opening` should sit about 6 dB under `landing`, and `lufs` near the target.
  `breath` under `landing` is the drums stepping out. `monoLossDb` is what a phone speaker loses; over 4 dB, parts of
  the track cancel in mono, so try `--one-track` or another track.
- **The sound of the stems.** Separation can leave a melody watery, let a kick through the hi-hats, or file the
  whole melody under drums and bass (the command then stops and says so). If it does, try another split in a new
  folder (`--stems demucs` after SCNet, or `--stems elevenlabs`) or `--one-track`, the whole track with the kick
  filtered out of the opening and the breath.

## Sound basics

- **Most people watch muted first.** The film has to make sense with the sound off; sound adds energy and
  confirms a moment, never carries the only copy of a message.
- **Phones are the speaker.** Most of the bass vanishes and the sound plays in mono: the melody and mids carry
  the film, and the `monoLossDb` check matters more than how the low end feels on headphones.
- **Loudness.** −16 LUFS is the default; YouTube turns louder films down to about −14, so
  a YouTube- or TikTok-first film can take `--lufs -14`. No network publishes a short-form target; don't go louder
  than −14.
- **A voice wins.** Music sits 12 dB or more under speech while it plays. If words are still hard to make out, the
  track is too busy in the mids: pick a sparser one rather than ducking deeper.
- **Accents mark story moments,** the four this skill places, not every move on screen. Never add sounds that
  pretend the product did something (typing, a success chime, a notification) the film doesn't show it doing.
- **Hits land on the frame.** A hit that lands a frame late reads as a mistake; if a mark moves in the edit, run
  again with the new mark rather than nudging the mix.

## Hand over

Ask your person to watch the film once in real time before posting. Give them its path, length and loudness, the
marks, which seconds of their track play where, and any pin you set and why.
