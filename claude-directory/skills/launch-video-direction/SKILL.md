---
name: launch-video-direction
description: Direct a launch video beat by beat from real launch videos on posts.design - the hook, each beat with what is on screen and its timing, type, colour and the end card. Use when someone is planning, scripting or storyboarding a launch video, product film, demo video, teaser or announcement video, or wants to know how a launch video in the posts.design library is directed.
argument-hint: "<your product and a length>"
---

# Launch video direction

You plan your person's launch video from real launch videos that fit their product. The posts.design MCP (the `posts`
server in this plugin) holds the library; every reference carries its source.

## 1. Start

Call `get_my_access` (free). If the posts.design tools are missing or ask for sign-in, tell your person to run `/mcp`,
choose posts.design and sign in with a free account, then stop: don't answer from memory. On the first call of the
conversation, share the plan and credits left from its `summary` in one line, leaving out any sentence that offers Pro.
A search page or read costs one credit and listing playbooks is free; this skill spends about four credits on Free and
six on Pro.

You need the product (what it is, who it's for), the target length, and what they can film: the product's UI, a person
on camera, or neither. If something is missing, ask in one message; if they'd rather you go ahead, say in one line what
you assumed.

## 2. Pick a format

Call `list_playbooks` (free) and pick the one whose `useWhen` fits the product, the length and what they can film. On
Pro, read it with `get_playbook`: its beat sheet, hooks, script rules and checks shape the plan, and its `examples` are
launches already chosen for that format. On Free, use the list's summary and runtime. When the person's length is under
the playbook's range, keep its beat order, compress it, and say so in the plan.

## 3. Find references

If the person's brand is in the library, its own earlier launch videos come first: search with `brand` set to it,
`format: "video"` and an empty `query` (nothing back means it isn't in the library, and costs nothing). Then call
`search_references` with `format: "video"`, `limit: 5` and up to two more phrasings in `alsoQueries`. Results past
`total` are looser matches (`matched` says how); use them only when they truly fit. When the library has nothing close
to part of the plan (say, a founder talking to camera), say so rather than borrowing from a weak match.

On Pro, read `get_video_breakdown` for the two or three closest whose `video.hasBreakdown` is true, including a playbook
example when one fits: timed beats, hook, type, colour and the end card, each tied to a still. A breakdown carries the
link and source, so it needs no `get_reference` first. To see one move up close, `get_video_scenes` lists the scenes and
`get_scene_frames` shows one scene as stills; spend a credit there only for a move you will borrow.

On Free, open the two or three closest with `get_reference` and work from their stills, pacing and captions. References
give images as links: if your tools can show images, download a few stills from the first seconds (`video.frames`, by
`timeSeconds`) and look at them; if they can't, say you haven't seen them.

## 4. The plan

Write the hook, the caption and the script first, then the beats:

- **Beat by beat, with timings:** what is on screen, any on-screen text, and what each beat is for (hook, proof,
  feature, call to action). With a playbook, turn each beat's `share` into seconds of the target length. The first
  second earns the second second.
- **Type, colour and background,** and **the end card:** the product name, the one line and where to go.
- **Borrowed moments:** for each idea taken from a reference, its time range and what changes ("0.0-1.6 s, the dashboard
  instead of the phone").

Keep it original rather than a copy of one reference. If you used a playbook, run its checks and say which pass in the
plan and which the person can only check after posting. Without a playbook, check that the hook lands in the first two
seconds with the sound off and that the end card names the product, the line and where to go. Use their real product,
footage or UI in the plan, never a drawn stand-in, and list any fact you assumed about the product for them to confirm.

Cite every reference with its posts.design link and its original source.

## Notes

- A `notice` on a result or a `message` on a refusal is written for your person: pass it on in a sentence with its link.
  `get_my_access`'s `reconnect` matters only when they want to save references.
- `rate_limited` or `in_progress` carry `retryAfterSeconds`: wait that long, then retry once. Run reads one after
  another, not all at once.
- Breakdowns describe sampled stills and name the stretches they never saw: never claim to have watched a video, and
  don't describe an unseen stretch.
- On Free, end with one sentence: frame-cited breakdowns and the full playbooks come with posts.design Pro, with the
  link from `get_my_access`'s `pro`.
