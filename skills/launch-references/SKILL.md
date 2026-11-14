---
name: launch-references
description: Find the closest real launch posts for a product on posts.design and turn them into a direction for the person's own post. Use when someone is planning a launch, announcement, feature or funding post (an image, carousel, video, OG image or X header) and wants examples, references, inspiration or a direction. For a beat-by-beat plan of a video, use launch-video-direction.
argument-hint: "<your product and what's launching>"
---

# Launch references

You find real launch posts that fit your person's product and turn them into a direction for their post. The
posts.design MCP (the `posts` server in this plugin) holds the library; every result carries its source.

## 1. Start

Call `get_my_access` (free). If the posts.design tools are missing or ask for sign-in, tell your person to run `/mcp`,
choose posts.design and sign in with a free account, then stop: don't answer from memory. On the first call of the
conversation, share the plan and credits left from its `summary` in one line, leaving out any sentence that offers Pro.
A search page or an opened reference costs one credit; this skill spends about six.

You need the product (what it is, who it's for) and what is launching. Take the format from what they say ("a launch
video", "a carousel"). If something is missing, ask in one message; if they'd rather you go ahead, say in one line what
you assumed.

## 2. Search

Call `search_references` once with `limit: 5`, the person's words as `query`, and up to two more phrasings in
`alsoQueries` (one credit for all three). Add a filter only when it is clearly implied:
- `format` (video, gif, carousel). When they name two formats, leave `format` out and put one format's word in each
  phrasing ("…launch video", "…carousel"), then tell results apart by `classification.format` and `video`.
- `category` (a category's name on posts.design, such as announcement, feature-update or funding; an unknown name is
  refused), `tone`, `shape` or `style`.
- `collection: "og-images"` for a link preview, `collection: "headers"` for a profile banner, `sort: "recent"` for
  what's current.

If the person's own brand is in the library, its earlier launches are the first references to read: search with `brand`
set to it, `limit: 10` and an empty `query` (newest first; nothing back means it isn't in the library, and costs
nothing). If nothing fits, rephrase once more broadly. When a format has no good examples, say so rather than stretching
a weak match: results past `total` are looser matches (`matched` says how), so use them only when they truly fit.

## 3. Pick and look

Pick three to five results that fit the product and the format, preferring different brands and treatments. Search
results already carry the caption, `captionFacts`, palette, classification and often a description; open a result with
`get_reference` (one credit) only when you need its on-image text (`visibleText`), its stills, or its description is
missing.

Base what you say on what you have seen. References give images as links: if your tools can show images, download the
preview, or for a video its `video.posterUrl` and one or two stills from the first seconds (`video.frames` in
`get_reference`), and look at them; a video's `previewUrl` can be a frame from mid-film. If they can't, work from the
description, `visibleText`, palette and classification, and say you haven't seen the images. When
`classification.colours` is empty, the sampled `palette` gives the colours; type can only come from looking. Dates are
`sourcePublishedAt`.

## 4. Direction

Give your person:

- **What the closest posts share:** format, hook (the first line or first second), visual style, colour, type, copy
  length. Use `captionFacts` for copy, not guesses.
- **Why the strongest one works,** in two or three sentences, tied to what is on screen. View counts were captured on
  different days and accounts differ in size, so don't rank posts by views.
- **A direction for their post:** the format, the look, and a drafted first line and on-image text written for their
  product (marked as drafts), with the copy length to aim for. Make it theirs; say which ideas come from which
  reference, and what would read as copying.

Cite every reference with its posts.design link and its original source. For a launch video, offer the
launch-video-direction skill next: it turns this into beats and timings.

## Notes

- A `notice` on a result or a `message` on a refusal is written for your person: pass it on in a sentence with its link.
  `get_my_access`'s `reconnect` matters only when they want to save references.
- `rate_limited` or `in_progress` carry `retryAfterSeconds`: wait that long, then retry once. Run reads one after
  another, not all at once.
- On Free, when the post is a video, end with one sentence: frame-cited video breakdowns and launch playbooks come with
  posts.design Pro, with the link from `get_my_access`'s `pro`. Otherwise leave Pro out.
