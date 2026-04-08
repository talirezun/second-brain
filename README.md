# Second Brain

A local, AI-powered knowledge system built on the [Karpathy llm-wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) concept. Instead of one general-purpose second brain, you maintain **dedicated wikis per domain** — each one stays focused, compounds knowledge from every source you add, and can be queried like a domain specialist.

## How it works

1. **Ingest** — drop a `.txt`, `.md`, or `.pdf` file into a domain. The AI reads it and automatically writes summary, entity, and concept pages to a local markdown wiki.
2. **Query** — ask a natural-language question. The AI reads your entire wiki and returns a synthesised answer with citations back to specific pages.
3. **Browse** — read the wiki in the app, or open the `domains/` folder in [Obsidian](https://obsidian.md) for a graph view.

All knowledge is stored as plain markdown files on disk. No vector database, no external sync, no accounts.

## Features

- Domain-specific wikis (AI/Tech, Business/Finance, Personal Growth — or any domain you define)
- Automatic entity extraction (people, tools, companies, frameworks)
- Automatic concept extraction with cross-references
- Chronological ingest log + master index per domain
- Vanilla JS web UI — no build step, no framework
- PDF, Markdown, and plain text support
- Supports **Google Gemini** and **Anthropic Claude** — switch by changing one env var

## Prerequisites

- Node.js 18+
- A **Google Gemini API key** (free at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)) — or an Anthropic API key

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/talirezun/second-brain.git
cd second-brain
npm install
```

### 2. Configure your API key

```bash
cp .env.example .env
```

Open `.env` and paste your key:

```
# Google Gemini (recommended — very low cost)
GEMINI_API_KEY=AIza...

# OR Anthropic Claude
# ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Start the server

```bash
node src/server.js
```

You should see:

```
Second Brain running at http://localhost:3333
LLM provider: 🟦 Gemini  |  model: gemini-2.5-flash-lite
```

### 4. Open the app

Go to **http://localhost:3333** in your browser.

---

## Project structure

```
second-brain/
├── src/
│   ├── server.js          Express server (port 3333)
│   ├── routes/            API route handlers
│   ├── brain/
│   │   ├── llm.js         LLM abstraction (Gemini + Claude)
│   │   ├── ingest.js      Ingest pipeline
│   │   ├── query.js       Query pipeline
│   │   └── files.js       Filesystem helpers
│   └── public/            Web UI (vanilla JS)
├── domains/
│   └── <domain>/
│       ├── CLAUDE.md      Domain schema (system prompt for the AI)
│       ├── raw/           Your original uploaded files
│       └── wiki/
│           ├── index.md   Content catalog
│           ├── log.md     Ingest history
│           ├── entities/  People, tools, companies
│           ├── concepts/  Ideas, techniques, frameworks
│           └── summaries/ One page per source
└── docs/                  Full documentation
```

## Documentation

| Doc | Description |
|-----|-------------|
| [Architecture](docs/architecture.md) | Data flow, module reference, design decisions |
| [User Guide](docs/user-guide.md) | How to ingest, query, browse, and troubleshoot |
| [Domain Schemas](docs/domain-schemas.md) | How to customise `CLAUDE.md` for any domain |
| [Adding Domains](docs/adding-domains.md) | Step-by-step guide |
| [API Reference](docs/api-reference.md) | REST API docs |

## Adding a new domain

Create the directory structure, write a `CLAUDE.md` schema, and the app picks it up automatically — no code changes needed. See [docs/adding-domains.md](docs/adding-domains.md) for a full guide and checklist.

## Security note

This app runs locally and has no authentication. Do not expose it on a public network. Your API key lives in `.env` which is gitignored and never committed.

> **Axios note:** This project does not use Axios. If you extend it to fetch URLs, avoid the known-compromised versions `axios@1.14.1` and `axios@0.30.4`.

## License

MIT — see [LICENSE](LICENSE).
