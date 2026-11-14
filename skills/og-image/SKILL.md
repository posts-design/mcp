---
name: og-image
description: Design and build a website's Open Graph image (the link preview) from real OG images on posts.design - pick a direction from the closest ones, then make it in the person's project with their own colours, type and logo, in Next.js as an opengraph-image.tsx. Use when someone wants an OG image, social preview, link preview, social card or share image for their site or one of its pages.
argument-hint: "<the page, e.g. homepage or pricing>"
---

# OG image

You design your person's link preview image from real OG images that fit their page, then build it in their project. The
posts.design MCP (the `posts` server in this plugin) holds the library; every image carries its source.

## 1. Start

Call `get_my_access` (free). If the posts.design tools are missing or ask for sign-in, tell your person to run `/mcp`,
choose posts.design and sign in with a free account, then stop: don't answer from memory. On the first call of the
conversation, share the plan and credits left from its `summary` in one line, leaving out any sentence that offers Pro.
A search page or an opened reference costs one credit; this skill spends one to three.

Read the brand from the project before asking: colours (CSS variables, the Tailwind or theme config), fonts, logo files,
the page's title and description, and any OG image it already has (`opengraph-image.*`, an `og:image` tag, an `og` file
in its public folder). You need which page the image is for; ask only for what the project doesn't hold.

## 2. Find references

If the person's brand is in the library, search its own OG images first (`brand` set to it, `limit: 5`, an empty
`query`; nothing back costs nothing). Then call `search_references` with `collection: "og-images"`, `limit: 5`, what the
product is and who it's for as `query` ("invoicing app for freelancers"), and up to two more phrasings in `alsoQueries`,
one of them the look; colour and type words match little on their own. Set `pageType` when the page is one of homepage,
product, pricing, docs, blog, changelog, company, careers, security or solutions; if no result is in the product's
field, search once more without it, using the product's category ("invoicing", "billing"). Results past `total` are
looser matches (`matched` says how), and with a descriptive query all of them can be: judge those by how they look. Each
result's `pageUrl` is the page it previews.

Pick up to five that fit, preferring different brands and layouts, and say when none is in the product's field. If your
tools can show images, download their `previewUrl`s into a scratch folder outside the project in one command and look at
them; if they can't, work from the description, palette and classification and say you haven't seen them. Open one with
`get_reference` only for its exact on-image text (`description.visibleText`).

## 3. Direction

Say what the closest references share (layout, headline size, logo placement, product shot or none, colour) and pick one
direction for the person's image, naming the reference each idea comes from. Borrow structure, not identity: their
colours, type and logo, never a reference's.

Make it 1200×630 (1.91:1). The words are theirs: the page's own title or heading, never a claim you can't check (a
price, "simple", "free"). Keep any text meant to be read large enough at a third of that width (about 72 px or more at
full size), and keep text and the logo clear of the lower-left corner, where X lays the site's domain over the image;
many references put their logo there, so move it rather than copy it. With no real product screenshot, make it type-led
and say where one would go. posts.design's free guide `https://posts.design/opengraph/size.md` has what each platform
documents and what 1,000+ real OG images measure; read it (no credit) when the person asks about another size or
platform.

## 4. Build

Use the project's stack and its real assets: the logo file, a real screenshot of the product, the brand's fonts. Never
draw a stand-in logo or invent UI. When the page doesn't exist yet, add only the image in its route folder and say the
page still needs building; don't write the page.

- **Next.js (App Router):** an `opengraph-image.tsx` in the page's route folder (`app/` for the whole site), exporting
  `size` (1200×630), `contentType` (`image/png`), `alt`, and a default function that returns an `ImageResponse` from
  `next/og`. If the project's Next.js version behaves differently, its own docs are in `node_modules/next/dist/docs/`.
  The renderer takes flexbox only (an element with more than one child needs `display: "flex"`; no grid), fonts as ttf,
  otf or woff (not woff2) read once at module scope, images as absolute URLs or data URIs (a relative path doesn't
  load), and a bundle under 500 KB, fonts and images included. Set `metadataBase` in the root layout's `metadata` so the
  image URL is absolute, taking the domain from the project (README, `package.json`, a canonical tag) and saying where.
- **Other stacks:** the framework's own OG image route, else a script with Satori and resvg, else a static 1200×630 PNG
  in the public folder with an `og:image` tag (absolute URL) and `og:image:width`, `og:image:height` and `og:image:alt`.

Check that the page sets `twitter:card` to `summary_large_image`, or X shows a small square card; X takes the image from
`og:image`. In Next.js that is `metadata.twitter.card`, set wherever a page sets `twitter`, since a page's `twitter`
replaces the layout's. Say which files you changed. When the brand's font file isn't in the project, ask before fetching
one: build with a fallback that can't fail the build (the renderer's default is a sans), and name the file to add.
Install a package only after asking.

## 5. Check

Look at the result: open the image route or the PNG, and view it at about 400 pixels wide as a timeline shows it. Check
the headline reads, nothing important sits under the domain corner, and the colours hold on light and dark timelines. If
you can't render it here, say so and list those checks for the person. Leave deploying to the person.

Cite each reference you used with its posts.design `url` and, when it differs from `pageUrl`, its `sourceUrl`. For a
profile banner, offer the x-header skill next.

## Notes

- A `notice` on a result or a `message` on a refusal is written for your person: pass it on in a sentence with its link.
  `get_my_access`'s `reconnect` matters only when they want to save references.
- `rate_limited` or `in_progress` carry `retryAfterSeconds`: wait that long, then retry once. Run reads one after
  another, not all at once.
