---
name: launch-copy
description: Write the caption for a launch post - the first line, length, line breaks, mentions and link - from how real launch posts on posts.design are written. Use when someone asks for a launch tweet, announcement copy, a caption, a hook or a first line for a launch, feature or funding post, or wants their draft caption checked against real launches.
argument-hint: "<what's launching, or your draft caption>"
---

# Launch copy

You write your person's launch caption from how real launch posts that fit their product are written. The posts.design
MCP (the `posts` server in this plugin) holds the library; every post carries its source.

## 1. Start

Call `get_my_access` (free). If the posts.design tools are missing or ask for sign-in, tell your person to run `/mcp`,
choose posts.design and sign in with a free account, then stop: don't answer from memory. On the first call of the
conversation, share the plan and credits left from its `summary` in one line, leaving out any sentence that offers Pro.
A search page costs one credit; this skill spends two or three.

You need the product, what is launching, and the facts the caption may state (names, numbers, dates, the link). If
you're in their project, read its README or landing copy for the product's own words and facts. If something is missing,
ask in one message; if they'd rather you go ahead, or can't answer now, use a `[placeholder]` for it, never an invented
fact, and list the placeholders at the end. When their message and their project disagree (a date, a name), go with the
message and say so.

## 2. Find captions to learn from

Search results already carry each post's `caption` and `captionFacts` (characters, words, lines, `firstLine` as the
hook, hashtags, mentions, emoji, links), so one page of results is the material: no need to open posts.

If the person's brand is in the library, its earlier posts set their voice: search with `brand` set to it, an empty
`query` and `limit: 10` (nothing back means it isn't in the library, and costs nothing). Then call `search_references`
with `limit: 5` and no filter: the product's category and the feature as `query` ("recurring invoices for freelancers",
without launch words like "now available"), and in `alsoQueries` the kind of launch ("a new feature for a payments
product") and one more phrasing; their results come back under `also`. Only posts with a `caption` count. Results past
`total` are looser matches (`matched` says how): keep one only when it announces the same kind of thing for a similar
customer, not when it just shares a word. If a result is saved to a file, take the captions from the file rather than
searching again.

## 3. Read the pattern

Across the captions that fit, count and say:

- **Length:** the typical characters and lines, and the range ("most are 120-220 characters over two to four lines").
- **The first line:** what the hooks do (name the product, state the outcome, a number, a question, "Introducing"), with
  two or three real examples quoted with their brand.
- **What's in them:** how many tag someone or use emoji or hashtags.

With fewer than five captions that fit, say so first and describe them one by one rather than calling it a pattern.
Links in captions are removed, so don't count them or suggest leaving the link out; a caption that stops mid-sentence
was cut off, so leave it out of the length. View counts were captured on different days and accounts differ in size:
don't rank captions by views or claim a pattern performs better.

## 4. Write

When they gave a draft, start there: check it against the captions (first line, length, line breaks, emoji, hashtags,
mentions) and list the smallest edits.

Then give three captions, each with a different kind of first line, in their voice (their earlier posts, else their own
copy) and never reusing a reference's wording. Mark each as a draft with its character count, not counting the link,
keep it within the pattern's length unless the person asked otherwise, and say which reference it borrows its shape
from. Match the tense to the date ("coming" before launch, "now live" after), and recommend one of the three in a line,
for how well it fits their product and voice.

Cite each reference you quote or borrow a shape from with its posts.design link and its original source. When the post
also needs an image or a video, offer launch-references or launch-video-direction next.

## Notes

- A `notice` on a result or a `message` on a refusal is written for your person: pass it on in a sentence with its link.
  `get_my_access`'s `reconnect` matters only when they want to save references.
- `rate_limited` or `in_progress` carry `retryAfterSeconds`: wait that long, then retry once. Run reads one after
  another, not all at once.
