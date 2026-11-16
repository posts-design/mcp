---
name: x-header
description: Design an X (Twitter) profile header from real brand headers on posts.design and make it at 1500×500 with the person's own brand. Use when someone wants an X header, Twitter banner, profile banner or cover image for a brand, product or founder account.
argument-hint: "<the account, e.g. @yourbrand>"
---

# X header

You design your person's X profile header from real brand headers that fit, then make the file. The posts.design MCP
(the `posts` server in this plugin) holds the library; every header carries its source.

## 1. Start

Call `get_my_access` (free). If the posts.design tools are missing or ask for sign-in, tell your person to run `/mcp`,
choose posts.design and sign in with a free account, then stop: don't answer from memory. On the first call of the
conversation, share the plan and credits left from its `summary` in one line, leaving out any sentence that offers Pro.
A search page costs one credit; this skill usually spends one or two.

You need the account and what the header should say or show (the product, a launch, a line, or the brand alone). The
best headers come from four things: the brand's font files, its logo as SVG, a real screenshot of what the product
mainly does, and a way to render a PNG (below). If you're in their project, take the colours, fonts and logo files from
it. Ask only for what you can't find; if they can't answer now, go ahead and list what you assumed. A person's header carries their product or their role, not both, and
never repeats the @handle the profile already shows (a brand's name or logo is fine, even when it matches the handle).

## 2. Find references

If the account's brand is in the library, its current header comes first: call `search_references` with `collection:
"headers"`, `brand` set to its name or X handle, `limit: 3` and an empty `query` (nothing back costs nothing; try the
other spelling before deciding it isn't in the library). Then search `collection: "headers"` with `limit: 5`, what the
product is and who it's for as `query`, and up to two more phrasings in `alsoQueries`, one of them the look; add `style`
or `tone` when the person names a look. Results past `total` are looser matches (`matched` says how), and with `total` 0
all of them are: judge those by how they look, and say when nothing close to the product's field exists.

Pick three to five that fit, preferring different brands and treatments. A header's image is `image.url`: if your tools
can show images, download them into a scratch folder outside the project in one command and look; if they can't, work
from `description`, `styles` and `tone` and say you haven't seen them.

## 3. Direction and the frame

Say what the closest references share (photo, product UI, type, pattern or gradient; where the weight sits; how much is
left empty) and pick one direction, naming the reference each idea comes from. Use their colours, type, logo and words,
never a reference's. Put only their own words on it (a name, a product, a line they gave you or their site already
uses); with no line, the name alone. Don't invent taglines, numbers or sample text.

Make it 1500×500 (3:1), the size most brand headers on posts.design use. X crops up to 60 pixels from the top and bottom
on some screens, and the profile photo covers part of the lower left at a size X doesn't document: keep text and the
logo between 60 and 440 pixels down and clear of the left third. The free guide `https://posts.design/headers/size.md`
has the full measurements and X's own rules; read it (no credit) when the person asks.

## 4. Make it

Make the header as SVG or HTML and render it to PNG with what the project or machine already has: the approach the
project uses for its OG images, resvg, rsvg-convert, ImageMagick, sharp, or a headless browser's screenshot. With none
of these, ask once to add `satori` and `@resvg/resvg-js` in a scratch folder outside the project: they draw text from
the brand's font files, so the type matches without installing fonts. Take the font and logo files from the project;
without them, ask before downloading them from the brand's own site, or say which face stands in. Until the person
agrees to an install, give the SVG and say it is unrendered, with its sizes and positions unchecked: drawing it again
with an image library such as Pillow isn't rendering it.

Use the real logo file and a real product shot (the one showing what the product mainly does, cropped to read, its words
checked), never a redrawn stand-in; with no screenshot, make it type-led and say where one would go, and say when a
typed name stands in for a logo. X takes a PNG or JPG, not animated. Look at the PNG whole and at about 600 pixels wide,
with the crop and the profile photo area in mind.

The person uploads it: never post or change their profile. Cite each reference you used with its posts.design `url` and
that account's `profileUrl`.

## Notes

- A `notice` on a result or a `message` on a refusal is written for your person: pass it on in a sentence with its link.
  `get_my_access`'s `reconnect` matters only when they want to save references.
- `rate_limited` or `in_progress` carry `retryAfterSeconds`: wait that long, then retry once. Run reads one after
  another, not all at once.
