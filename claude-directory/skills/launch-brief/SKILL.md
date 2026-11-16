---
name: launch-brief
description: Turn a one-line idea for a launch post or video into the creative brief its author would have written - one committed look, moves worth copying and numbered beats, each grounded in real launches on posts.design. Use when someone has only an idea or a vibe ("a launch video for our API, like Stripe", "something bold for our funding news") and wants a brief, a concept or a creative direction before making anything.
argument-hint: "<your idea in a line>"
---

# Launch brief

You turn your person's one-line idea into a full creative brief, grounded in real launches. The posts.design MCP (the
`posts` server in this plugin) holds the library; every reference carries its source.

## 1. Start

Call `get_my_access` (free). If the posts.design tools are missing or ask for sign-in, tell your person to run `/mcp`,
choose posts.design and sign in with a free account, then stop: don't answer from memory. On the first call of the
conversation, share the plan and credits left from its `summary` in one line, leaving out any sentence that offers Pro.
A search page or a read costs one credit; this skill spends two to eight on Free (a still skips the motion step) and up
to twelve on Pro.

Don't ask questions first: make the creative calls and show them at the end. If you're in their project, read what the
product is and take its real assets from it (logo, screenshots, UI, footage); its colours and fonts win over the decoded
look's palette and type. Leave news the project hasn't announced out of the post. Never invent facts (an investor, an
amount, a customer): name what is missing. When the idea leaves the medium to you, make it a video only when it holds a
transformation or a demo; a number or a statement is a still.

## 2. Decode the look

If the idea names a style, a brand or a medium ("like Stripe", "clean and minimal", "claymation"), say in a sentence
what that word pictures: it fixes palette, type and material, never layout, camera or the move. If the idea says nothing
about the look, choose the most striking look that could carry the subject, not the safest match.

## 3. Ground the look: five stills from one aesthetic

When the idea names a brand, list its posts first: `search_references` with `brand` set to it, `limit: 10` and an empty
`query` (filters are strict, so `brand` with a descriptive query usually finds nothing). Then search without `brand`,
with `limit: 5`, the look as `query` and up to two more phrasings in `alsoQueries`, adding `tone` or `style` when they
fit; try `collection: "og-images"` or `"headers"` when their stills fit better (a header's image is `image.url`). Pick
up to five that each do one job: overall look, palette, material or surface, composition, one detail; fewer is fine when
only some fit. Never blend two aesthetics; if a second keeps winning, switch to it wholesale. Results past `total` are
looser matches (`matched` says how), and all of them can be: say when the stills are only loose fits. If your tools can
show images, download the `previewUrl`s into a scratch folder in one command and look at them together; if they can't,
say you haven't seen them. Keep each result's full `key.id`: a shortened one fails.

## 4. Ground the motion (skip it for a still post)

Find three launch videos whose moves are worth copying, even on a different subject: the main move, the turn, and the
exit or camera. Search for them in one call with `format: "video"`, `limit: 5`, the main move as `query` and the turn
and the exit as `alsoQueries` (or `brand` and an empty `query` when a brand is named).

On Pro, read `get_video_breakdown` for each whose `video.hasBreakdown` is true and take an exact time range from its
beats; `get_video_scenes` and `get_scene_frames` show a move up close; spend a credit there only for a move you will
borrow. On Free, open each with `get_reference` and take the range from its stills (`video.frames`, by `timeSeconds`):
download and look at the ones you cite, since a video's stills come without text, and say the move was read from stills.
Either way, never claim to have watched a video, cite a time no still or beat shows, or describe a stretch nothing
showed you.

## 5. Write the brief

Every reference feeds a beat; cut any reference that feeds none. For a still, the beats are its layers in reading order.
For a video, include a turn: a reveal, a morph, a zoom out to a larger whole, or one thing becoming another. If the idea
already holds a transformation, that is the turn: make it the biggest beat and add no second one. About five seconds
carries one idea, so a longer video takes one more beat for each five seconds, still with one turn; the action fills
each beat, with under a second of end hold.

Style the product's real assets from step 1, never a drawn stand-in; if one is needed and missing, say so in one line
above the brief and name what to supply.

Give three things:

1. **The brief, in a code block,** under about 150 words above its reference list: a first line naming the look;
   numbered beats, each the subject, its action and what it reveals or becomes, citing references inline (a1-a5 for
   stills, m1-m3 for motion); one line on camera and pace in plain words; aspect, length and background only where they
   aren't obvious. Describe the mechanism, not an adjective ("the old screen peels from a corner to show the new one
   underneath", not "a slick transition"). One hero element fills at least 40% of the frame at its beat, and no text is
   smaller than 24 px at 1080p.
2. **Under the beats, each reference:** its handle, its job (look, palette, material, composition, detail or a move),
   the beat it feeds, what is taken ("m1 0.0-1.6 s, subject swapped for the dashboard"), its posts.design link and its
   original source.
3. **Outside the code block,** up to three creative calls you made, each with the one alternative worth considering.

Then offer the next step that fits: launch-video-direction for a timed plan, launch-copy for the caption, og-image or
x-header for a still.

## Notes

- A `notice` on a result or a `message` on a refusal is written for your person: pass it on in a sentence with its link.
  `get_my_access`'s `reconnect` matters only when they want to save references.
- `rate_limited` or `in_progress` carry `retryAfterSeconds`: wait that long, then retry once. Run reads one after
  another, not all at once.
- `list_playbooks` (free) lists formats for a launch film and a raise announcement; when one fits the idea, its
  `useWhen` and runtime shape the beats, and on Pro `get_playbook` gives its full beat sheet.
- On Free, when the brief has motion, end with one sentence: frame-cited breakdowns that give exact moves come with
  posts.design Pro, with the link from `get_my_access`'s `pro`.
- Adapted from Stewdio's [blank-page](https://github.com/StewdioAI/blank-page) skill, MIT License, Copyright (c) 2026
  Cekura, Inc.; the notice is in `LICENSE-blank-page` beside this file.
