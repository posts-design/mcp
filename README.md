# posts.design MCP

Connect your agent to [posts.design](https://posts.design) and get back directions, examples and
breakdowns to nail your next post's design. posts.design is a hand-curated library of social posts
brands actually published: launch videos, carousels, OG images and X headers, each linked to its
original.

- **Server URL:** `https://posts.design/mcp` (Streamable HTTP)
- **Sign-in:** OAuth with your posts.design account, or a personal key from
  [Settings → MCP](https://posts.design/settings?section=mcp)
- **Cost:** 100 credits a month on a free account, 1,000 with [Pro](https://posts.design/pricing)
- **About:** [posts.design/mcp](https://posts.design/mcp)

This repository holds the server's documentation and its
[MCP Registry](https://registry.modelcontextprotocol.io) listing (`design.posts/mcp`). The server
itself is hosted by posts.design and is not open source.

## Set up

You need a free [posts.design](https://posts.design/signup) account.

**Claude** (claude.ai and the desktop app): Settings → Connectors → Add custom connector. Paste
`https://posts.design/mcp`, then sign in.

**ChatGPT:** Plugins → Add custom MCP server with OAuth. Paste `https://posts.design/mcp`, then
install it and sign in.

**Claude Code:**

```bash
claude mcp add --transport http posts https://posts.design/mcp
```

Then run `/mcp` and sign in. To use a personal key instead, add
`--header "Authorization: Bearer <your-key>"`.

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.posts]
url = "https://posts.design/mcp"
http_headers = { Authorization = "Bearer <your-key>" }
```

**Cursor** (`~/.cursor/mcp.json`), or use **Add to Cursor** in Settings → MCP:

```json
{
  "mcpServers": {
    "posts": {
      "url": "https://posts.design/mcp",
      "headers": { "Authorization": "Bearer <your-key>" }
    }
  }
}
```

**Any other client:** add a remote Streamable HTTP server at `https://posts.design/mcp`. Clients
with OAuth sign in in the browser; others send `Authorization: Bearer <your-key>`.

Your personal key is in [Settings → MCP](https://posts.design/settings?section=mcp). Keep it
private; regenerating it there stops the old key working.

Once connected, ask your agent to call `get_my_access` to confirm.

## Tools

| Tool | Title | What it does | Plan |
|---|---|---|---|
| `search_references` | Search references | Search the published library by what you're making: a launch video, a hiring post, an OG image. Filters by format and category | Free |
| `get_reference` | Get reference | Open one post, OG image or X header: attribution, dates, classification and all its media links, plus a video's stills at its shot changes | Free |
| `search_saved_references` | Search saves | Search or list everything you've saved on posts.design | Free |
| `get_saved_reference` | Get saved reference | Open one saved reference with all its assets | Free |
| `get_saved_asset` | Get saved asset | Read one asset of a saved reference, with a preview image when one fits | Free |
| `get_my_access` | My access and credits | Show what this connection may read and how many credits are left | Free |
| `get_video_breakdown` | Video breakdown | How a video is directed: structure, hook, timed beats, type, colour, end card and what to borrow, each tied to a still | Pro |
| `get_video_scenes` | Video scenes | Every scene of a video with its time range, stills and the beats over it | Pro |
| `get_scene_frames` | Scene frames | Stills across one scene, as images in time order | Pro |
| `get_scene_clip` | Scene clip | A short silent MP4 of one scene, as a link that expires in an hour | Pro |

On a free account the Pro tools reply with a link to Pro instead of answering, and use no credits.

**Credits:** one credit is one request: a search, a page of results, a post, a breakdown or a saved
item. Repeating a request, a failed request and `get_my_access` are free, and downloading media or
stills from returned links never uses credits. Credits reset on the 1st of each month (UTC).

## What it can and can't do

- Every tool is read-only. It can't post, edit, save or delete anything.
- It reads two things: the published library, and your own Saves. Sign-in asks for exactly those
  (`references:read`, `saved:read`).
- Results link to the original post and credit its brand and creator.

## Help

Open an [issue](https://github.com/posts-design/mcp/issues).

Documentation in this repository is MIT licensed. The posts in the library belong to their
creators.
