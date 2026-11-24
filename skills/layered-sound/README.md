# Layered sound

Give your agent a film and a music track you made or hold the rights to, and it scores the film in layers. The track
is split into its instruments, which enter and leave with the story: the melody alone in the first bar, hi-hats from
the second, kick and bass on the film's turn, a breath of about two bars before the logo, and everything back on it,
over the track's closing bars. A whoosh, a hit, a riser and a sting mark those moments, from your own sounds or made
with ElevenLabs on your key. A voice-over stays on top: the music dips under it while anyone speaks. The mix is
mastered for phones (it reports what a mono speaker loses) to −16 LUFS, or the loudness you choose.

It is how we score our own launch films at [posts.design](https://posts.design).

## Example

Our Copy prompt film, 26 s, on an electro house take at 120 BPM:

```bash
node layer.mjs copy-prompt.mp4 take.mp3 work/ --land 8 --logo 24 --python .venv/bin/python \
  --open whoosh.mp3 --hit hit.mp3 --riser riser.mp3 --sting sting.mp3
```

| Film | What plays |
| --- | --- |
| 0–2 s | the synths alone, a whoosh |
| 2–8 s | hi-hats join |
| 8 s, COPY PROMPT | kick and bass in, a sub hit |
| 20–24 s, Copy. Paste. Launch. | kick and bass out, a riser |
| 24 s, the lockup | a sting over the take's closing chord |

The command found the take's drop on its own and mastered the mix to −16 LUFS.

## Start

In Claude Code, add the posts.design plugin and ask for a layered score of your film:

```text
/plugin marketplace add posts-design/mcp
/plugin install posts-design@posts-design
```

In other agents, copy this skill's folder into your agent's skills. It runs on your machine with Node.js, FFmpeg and
Python; SCNet splits the track, or ElevenLabs with your own key. Your agent tells you what it will install and asks
first.

The skill itself is [SKILL.md](SKILL.md); the command is `layer.mjs` in the [breakdown kit](../../breakdown/).
