---
name: sound-breakdown
description: Make a sound breakdown of a film, where the film plays over an editor's timeline of itself with a filmstrip of its shots and one audio track per stem, named for what you see and hear. Use when someone asks for a sound breakdown, a timeline breakdown or a "how this film is cut" video of a launch film, product film or ad they give you.
---

# Sound breakdown

You take a film your person gives you to a finished breakdown with the kit in `breakdown/` of
[github.com/posts-design/mcp](https://github.com/posts-design/mcp). Its README has the options and the spec
reference; this skill is the order of work and the judgment calls. Everything runs on your person's machine, unless
they choose ElevenLabs.

## 1. Set up

1. Clone the repository. Run every command below from its `breakdown/` folder.
2. Check the tools: `node --version` (20.9 or later), `ffmpeg -version` and `ffprobe -version`, and the Inter font
   (render stops with a clear message if it is missing; it installs from rsms.me/inter).
3. Before installing anything, tell your person in one message what will download and about how much, and ask once
   about any choice that applies. Check first whether `ELEVENLABS_API_KEY` is set (`[ -n "$ELEVENLABS_API_KEY" ] &&
   echo set`; never print it) and, on Linux, whether `nvidia-smi` finds an NVIDIA GPU.
   - **Always:** `npm install` for sharp, which renders (about 10 MB), and numpy for measuring, about 17 MB.
   - **Stems:** Demucs on their machine with the CPU-only PyTorch, about 250 MB, and a 55 MB model on the first prep.
     With the key set, ask: ElevenLabs separates the stems with nothing to install, on their ElevenLabs plan, or
     Demucs keeps them on the machine. With an NVIDIA GPU on Linux, also ask whether they want the CUDA PyTorch,
     which separates faster and is about 3 GB.
   - **Words:** prep skips them when the film's vocal stem is silent. With the key set, ElevenLabs Scribe hears them
     and nothing installs; ask if they would rather keep them local. Otherwise faster-whisper, about 130 MB, and its
     `small` model, about 490 MB, the first time it hears words; ask whether they want `large-v3-turbo` instead, which
     hears more and is about 1.6 GB.
4. Install what they chose: `npm install`, then in a virtual environment `python3 -m venv .venv` and
   `.venv/bin/pip install -r py/requirements.txt`, and for Demucs
   `.venv/bin/pip install -r py/requirements-demucs.txt --extra-index-url https://download.pytorch.org/whl/cpu`
   (leave the index out only for the CUDA build). Leave faster-whisper until prep asks for it: when the film has
   vocals and no key is set, prep stops before the words with `.venv/bin/pip install -r py/requirements-whisper.txt`;
   install it and run prep again. On an Intel Mac, use Python 3.10 to 3.12. Your shell may
   not keep an activated environment between commands, so pass `--python .venv/bin/python` to prep every time.
5. If your person wants ElevenLabs and has no key set, they set `ELEVENLABS_API_KEY` themselves; never ask them to
   paste a key into the chat.

## 2. The film

Ask for the film file and the brand's name. A designed 16:9 film with music cut to picture and a few distinct layers
works best (a launch film, product film or ad); say so if they bring a UI recording, voice-over alone, a loop or a
vertical video. If they want the brand's mark in the corner, ask for its avatar or logo image.

## 3. Prep

```bash
node prep.mjs <film> work/ --python .venv/bin/python
```

Add `--avatar <logo>` when they gave you the brand's mark, and what they chose: `--stems elevenlabs`, `--words whisper` to keep words local while a key is set, or
`--whisper-model large-v3-turbo`. Prep takes about a minute for a short film, longer on its first run while it
downloads models. Run it in the background or with a long timeout; if it is cut off, run it again, since it keeps
finished stems and words. Read what it prints (the number of boundaries, the tempo, each stem's clip count), then
look at `prep/shots.jpg`, `prep/stems.png` and `prep/words.txt`. You name from these.

**With the posts.design MCP connected** and the film in its library (search for it with `search_references`):
`get_video_scenes` gives scene times to check the shot list against, and `get_video_breakdown` gives beats to group
into acts. Both are Pro; on a free account, tell your person in a sentence and carry on from the sheets.

## 4. Name everything

Edit `work/breakdown.json`. The README's Naming section has the rules; the ones agents miss:

- **Never invent** words, sounds or shots. Clip names come from `words.txt` or from what the spectrogram and the
  stem show. A "Words?" clip or a word marked `?` that you can't confirm becomes "Lyric unclear" or is dropped;
  whisper often misses sung lines, so expect several.
- **Dialogue and Song vocal.** When the film has both spoken lines and a song with vocals, make two lanes from the
  vocal stem, `Dialogue` and `Song vocal`, and put each line on the lane it belongs to. The announcer goes on
  Dialogue as `VO: …`.
- **Fewer, truer tracks.** Four or five lanes. Drop stems that are silent or only leak other instruments, and label a
  misfiled sound by what it is, with its real stem as the clip's fourth value.
- **Clip edges** sit where a layer becomes audible, not where the separator first puts energy into its stem.
- **Acts** take the film's own on-screen words where it has them.
- **The ruler.** If bars don't land on the film's edits after a few checks, set `"ruler": "seconds"`.
- **`pullBack`** goes before the film's own end card or legal text, and **`cover`** on a settled, busy moment.

## 5. End scene

Ask whether they want a wall of the brand's other posts at the end. With the MCP, call `search_references` with
`brand` set to the brand and `format: "video"`. Leave out the film itself, keep links whose `video.role` is
`analysis`, pick 7 to 12 that play well small, and put their `video.url` in `end.posts` (they download when
rendering). Without the MCP, use video files your person gives you. Write the closing line with them, two short
lines ("Every Acme post," / "in one place."). Leave `end` out if they don't want a wall.

## 6. Check, then render

1. `node render.mjs work/breakdown.json --stills a,b,c…` with one still per act, one during the pull-back and two
   in the end scene, which starts at `pullBack` + 1.5 s + `hold`. Stills land beside the spec as
   `work/breakdown-<seconds>.png`. Look at every one: labels readable at phone size, the playing shot outlined, no
   black tile. Fix and repeat.
2. `node render.mjs work/breakdown.json` (a minute or two for a short film; run it in the background). Read its
   warnings and the loudness line; if it suggests `gainDb`, set it and render again. The film is
   `work/breakdown.mp4`.
3. Ask your person to watch it once in real time before posting.

## 7. Variants

- For Reels, TikTok and Shorts: `"aspect": "9:16"`, rendered to its own file.
- For networks capped at 60 s: `node excerpt.mjs work/breakdown.json cut/ --from <s> --pull <s> --to <s>`, then
  render `cut/breakdown.json`. Start on an edit and the start of a line.

## Hand over

Give your person the film's path, its length and loudness, any warnings you left in place and why, and a suggested
caption in the pattern "breakdown of @brand's <thing> film by @<who posted it>". Call the film new only when your
person says it is.
