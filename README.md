# Second Brain

A local, AI-powered knowledge system. Feed it documents — articles, PDFs, notes — and it automatically builds an interlinked wiki of key people, tools, and ideas. Ask it questions. Explore everything as a visual knowledge graph in Obsidian.

Built on the [Karpathy llm-wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) concept: instead of one general-purpose second brain that tries to cover everything, you maintain **dedicated wikis per domain** (e.g. AI/Tech, Business, Personal Growth). Each one gets smarter with every source you add.

## How it works

```
1. Upload a PDF, article, or note
         ↓
2. AI reads it and writes 5–15 interlinked wiki pages
   (summary + entity pages + concept pages)
         ↓
3. Ask questions → get cited answers from your own wiki
         ↓
4. Open Obsidian → explore the visual knowledge graph
```

Everything is stored as plain markdown files on your computer. No cloud sync, no database, no accounts.

## Features

- Drop in a `.pdf`, `.txt`, or `.md` file — the AI does the rest
- Automatic extraction of people, tools, companies, frameworks, and concepts
- Every page cross-references related pages with `[[wiki-links]]`
- Ask natural-language questions, get cited answers from your own knowledge
- Visual knowledge graph via [Obsidian](https://obsidian.md) (free app, no setup needed)
- Supports **Google Gemini** (recommended, very cheap) and **Anthropic Claude**
- Three built-in domains: AI/Tech · Business/Finance · Personal Growth
- Add unlimited custom domains — no code changes required

## Quick start

### Prerequisites
- [Node.js 18+](https://nodejs.org) (free)
- A [Google Gemini API key](https://aistudio.google.com/app/apikey) (free)
- [Obsidian](https://obsidian.md) for the knowledge graph (free, optional)

### Setup

```bash
# 1. Download the project
git clone https://github.com/talirezun/second-brain.git
cd second-brain

# 2. Install dependencies
npm install

# 3. Create your config file
cp .env.example .env
```

Open `.env` in any text editor and add your API key:
```
GEMINI_API_KEY=AIza...your key here...
```

### Run

```bash
node src/server.js
```

Then open **http://localhost:3333** in your browser.

> First time? Read the full **[User Guide](docs/user-guide.md)** — it covers every step in plain language, including how to get your API key and how to set up Obsidian.

## Using Obsidian for the knowledge graph

After ingesting your first document, open Obsidian → **Open folder as vault** → select the `second-brain/domains` folder. Click the graph icon in the sidebar to see all your knowledge as an interactive, zoomable network. No configuration needed — it reads the same files the app writes.

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
│   └── public/            Web UI (vanilla JS, no build step)
├── domains/
│   └── <domain>/
│       ├── CLAUDE.md      Domain schema (instructions for the AI)
│       ├── raw/           Your original uploaded files
│       └── wiki/          Auto-generated knowledge pages
└── docs/                  Full documentation
```

## Documentation

| | |
|-|-|
| [User Guide](docs/user-guide.md) | Full setup + usage guide for all levels |
| [Adding Domains](docs/adding-domains.md) | Create custom domain wikis |
| [Domain Schemas](docs/domain-schemas.md) | Customise how the AI structures knowledge |
| [API Reference](docs/api-reference.md) | REST API documentation |
| [Architecture](docs/architecture.md) | System design for developers |

## Security

- Your API key lives in `.env` — this file is in `.gitignore` and is **never committed to GitHub**
- The app runs entirely on your local machine — no data leaves your computer except the API call to Gemini/Claude
- Do not expose the server on a public network (it has no authentication)

> **Axios note:** This project does not use Axios. If you extend it to fetch URLs, avoid compromised versions `axios@1.14.1` and `axios@0.30.4`.

## License

MIT — see [LICENSE](LICENSE).
