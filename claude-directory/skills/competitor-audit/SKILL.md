---
name: competitor-audit
description: Audit a brand's launch posts on posts.design - recurring formats, hooks, visual style and copy, what changed over time, and what to borrow without copying. Use when someone asks how a competitor or a brand they admire launches, announces or posts, or wants to compare their launches with another brand's.
argument-hint: "<a brand or @handle>"
---

# Competitor audit

You read one brand's launches in the posts.design library and report what they repeat, what changed and what is worth
borrowing. The posts.design MCP (the `posts` server in this plugin) holds the library.

## 1. Start

Call `get_my_access` (free). If the posts.design tools are missing or ask for sign-in, tell your person to run `/mcp`,
choose posts.design and sign in with a free account, then stop: don't answer from memory. On the first call of the
conversation, share the plan and credits left from its `summary` in one line, leaving out any sentence that offers Pro.
A page of results or an opened reference costs one credit; one brand takes four to six. For a comparison, audit up to
three brands the same way: say the total before you start, and on Free open one standout per brand.

You need the brand, by name or X handle, and ideally what the person makes, so "what to borrow" fits them. If they don't
say, assume from context and say so in one line.

## 2. List the brand's launches

Call `search_references` with `brand` set to the brand, an empty `query` and `limit: 25`: results come newest first, 25
to a page. Follow `nextCursor` once if there are more. A full page is large: if your tools save it to a file, count
across it with a short script rather than by reading. When the person cares about the whole presence, list the brand's
headers (`collection: "headers"`) and OG images (`collection: "og-images"`) the same way.

If the brand has nothing, search for it by name as a `query`: the library may file it under a parent brand, or have
posts that mention it. Say what you found instead.

## 3. Read the list, then open a few

The list already carries each post's caption, `captionFacts`, palette, classification and often a description. Count
patterns across the whole list from those fields, and say how many were classified when some are empty ("dark in 19 of
23"). Use `sourcePublishedAt` for dates. The brand's own accounts include its regional and other-platform ones; posts by
its founders or staff are part of its presence, but count them separately (by `creator.handle`).

Open two or three standouts with `get_reference` (one credit each): the newest, a distinctive one and an older one, so
the report can say what changed. An open is worth it for on-image text (`description.visibleText`, when there is any), a
video's stills (`video.frames`), or a missing description. View counts were captured on different days: use them to find
the brand's big launches, never to rank posts in the report.

Base what you say on what you have seen. References give images as links: if your tools can show images, download the
`previewUrl` (or an `assets` rendition) and a still or two and look at them. If they can't, work from the description,
`visibleText`, palette and classification, and say you haven't seen the images.

## 4. Report

- **Recurring patterns:** formats, hooks, visual style, colour, type, copy length and tone, with counts.
- **What changed over time,** with dates.
- **What is worth borrowing** for your person, and **what would read as copying** this brand.

Cite every reference with its posts.design link and its original source.

## Notes

- A `notice` on a result or a `message` on a refusal is written for your person: pass it on in a sentence with its link.
  `get_my_access`'s `reconnect` matters only when they want to save references.
- `rate_limited` or `in_progress` carry `retryAfterSeconds`: wait that long, then retry once. Run reads one after
  another, not all at once.
- On Pro, `get_video_breakdown` shows how one of the brand's videos is directed, beat by beat, when its
  `video.hasBreakdown` is true; read one for the brand's biggest video launch. On Free, don't call it: when any of the
  brand's videos has `video.hasBreakdown`, end with one sentence saying how many have breakdowns with posts.design Pro,
  with the link from `get_my_access`'s `pro`; otherwise leave Pro out.
