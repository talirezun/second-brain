# My Curator — Private MCP Bridge

> **Version 2.3.0+** · Local-only · macOS tested

**My Curator** is your private bridge between the Curator wiki and Claude Desktop (or any MCP-compatible LLM client). It lets frontier models — Opus, Sonnet — do deep research against your local second brain without uploading anything to the cloud.

This is a *personal* MCP: it reads only your local wiki folder, nothing more, and no one else can connect to it. Think of it as an extra window into the same knowledge that Obsidian renders as a graph — except the reader is a frontier LLM.

---

## What it does

My Curator exposes **ten tools** to Claude Desktop:

| Tool | Purpose |
|---|---|
| `list_domains` | Show available knowledge domains |
| `get_index` | Browse a domain's full page catalog |
| `get_graph_overview` | Compact topology snapshot: stats, top hubs, orphans, top tags |
| `get_tags` | Tag inventory (top 50 by default; filter for specifics) |
| `search_wiki` | Ranked search enriched with tags + link counts |
| `search_cross_domain` | Search across every domain at once |
| `get_node` | Fetch a page with frontmatter, outgoing links, backlinks |
| `get_connected_nodes` | Multi-hop graph traversal |
| `get_backlinks` | Find every page that links TO a given page |
| `get_summary` | Pull a source summary page |

The key idea: a frontier model doesn't just *read* your wiki — it can *traverse* it. Hubs, clusters, tags, and bidirectional links are exposed as first-class structured data, so the model can reason about your knowledge as a graph.

## How it scales

MCP tool responses have a hard 1 MB cap enforced by the client (Claude Desktop). My Curator is designed to fit under that ceiling regardless of wiki size:

- **`get_graph_overview`** returns a compact summary by default (≈4 KB at any scale): node/edge/tag counts, type breakdown, top 20 hubs, orphan sample, top 10 tags. Ask for `include_nodes: true` to enumerate every page, or `include_edges: true` for the full edge list — both are size-guarded: if the response would exceed the limit, it auto-trims heavy arrays and flags what was dropped.
- **`get_tags`** defaults to the top 50 tags with 50-page samples each. Use `filter` to zoom in on a single tag and `max_pages_per_tag: 0` for the full page list.
- **`search_wiki`** and **`search_cross_domain`** are ranked, so `max_results` keeps responses small.

Practical guidance:

| Wiki size | Default behaviour |
|---|---|
| Up to ~100 source documents | Everything works without filters |
| 100–500 documents | Prefer `get_graph_overview` (compact), use `include_nodes: true` with `min_connections: 2` to focus on the meaningful graph |
| 500+ documents | Compact `get_graph_overview` still fits; use `get_connected_nodes` for neighborhoods instead of enumerating everything |

A frontier model can always get the full picture — it just has to ask in pieces. The hints returned in `_hints` fields guide the model toward the right follow-up calls.

---

## Setup (under 2 minutes)

1. Open The Curator → **Settings** tab → **My Curator — Private MCP Bridge** section.
2. Click **Copy snippet** — a JSON block is now in your clipboard.
3. Click **Reveal in Finder** — Finder opens the folder containing `claude_desktop_config.json`.
4. Open that file in any text editor (TextEdit, VS Code). If it doesn't exist, create one containing just `{}`.
5. Paste the snippet inside the `mcpServers` key (the wizard shows you exactly what "before" and "after" look like).
6. Save, then **fully quit and reopen Claude Desktop** (⌘Q).
7. Back in the Curator, click **Run self-test** to confirm the bridge responds. Then in Claude Desktop:

    > *Use `list_domains` to show my available knowledge domains, then use `get_graph_overview` on the most interesting one to see how everything is connected.*

---

## Research prompts to try

Once connected, these prompts unlock what the graph layer is actually for:

- **Topology orientation.** *"Use `get_graph_overview` on domain `<name>`. Identify the three most central hubs and tell me what they reveal about the shape of this knowledge."*
- **Tag-driven synthesis.** *"Use `get_tags` on `<name>` to find every page tagged `ai-safety`. Pull each one with `get_node` and write a synthesis."*
- **Backlink tracing.** *"Use `get_backlinks` on entity `<slug>`. For every source that mentions them, summarise how each source positions them."*
- **Cross-domain connection.** *"Use `search_cross_domain` for `organisational resilience`. Identify patterns that appear across more than one domain."*
- **Multi-hop traversal.** *"Use `get_connected_nodes` on `<slug>` with depth 2. Which second-hop nodes reveal non-obvious connections?"*

---

## Things to know

**If you move your domains folder, MCP stops working.** The config file has an absolute path baked in. When you change the Knowledge Base Location in the Domains tab (or move the Curator install), come back to Settings → My Curator, click **Regenerate**, paste the new snippet, and restart Claude Desktop. The wizard detects staleness and shows a warning banner when it happens.

**The Curator server does not need to be running.** Claude Desktop spawns `mcp/server.js` as a child process on demand. It's a separate, read-only path into the same markdown files.

**Existing wiki? It just works.** My Curator reads the files that ingest already produces — no migration, no re-ingest. For the cleanest possible graph on day one, you can optionally run **Wiki Health → Apply All Fixes** once, but it's not required.

**Privacy.** Everything stays on your machine. There is no network component. No telemetry.

**Security.** The MCP is read-only. Every tool validates its `domain` and `slug` arguments against a strict alphanum-plus-hyphen/underscore pattern, and the filesystem adapter refuses to resolve any path outside your domains folder — even if a prompt injection tries to steer the model toward `../../../etc/passwd`, the request returns "Invalid slug" without ever touching disk.

---

## Troubleshooting

| Symptom | Most likely cause | Fix |
|---|---|---|
| Claude Desktop shows no `my-curator` tools | Snippet pasted incorrectly, or Claude Desktop not restarted | Double-check the "After" preview in the wizard, then ⌘Q and reopen Claude Desktop |
| "Stale config" banner in Settings | Knowledge Base Location changed since you last generated the snippet | Click **Regenerate**, paste the new snippet, restart Claude Desktop |
| Self-test fails with "domains folder not found" | `DOMAINS_PATH` is wrong or folder was deleted | Set a valid path in the Domains tab, then regenerate |
| Tools show but return "no domains" | You haven't created any domains yet | Open the Curator, create a domain, ingest a source |
| Self-test passes but Claude Desktop still doesn't see the tool | Config file has a JSON syntax error | Open `claude_desktop_config.json` — the wizard's self-test reports `claude_config_parse_error` when it can't parse the file |

---

## What it is *not*

- Not a cloud service. Not hosted. Not shared.
- Not multi-user. My Curator = *my* Curator. Phase 3 will add an optional hosted/collective version with API keys — that's a separate thing.
- Not a replacement for the built-in Chat tab, Obsidian graph view, or the ingest pipeline. It's an *additional* access path: Obsidian gives you spatial exploration, Chat gives you a quick Q&A, and My Curator gives you frontier-model research.
