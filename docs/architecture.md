# Architecture

> This document is intended for developers who want to understand how the system works internally.

## Overview

Second Brain is a local Node.js web application. It has no external database — all knowledge is stored as plain markdown files on disk. An LLM (Google Gemini or Anthropic Claude, selected by which API key is in `.env`) is the only external dependency at runtime.

```
Browser (http://localhost:3333)
        │
        │  HTTP
        ▼
┌─────────────────────────────────────┐
│           Express server            │
│           src/server.js             │
│                                     │
│  /api/domains  /api/ingest          │
│  /api/query    /api/wiki/:domain    │
└───────────────┬─────────────────────┘
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
┌──────────────┐  ┌──────────────┐
│  brain/      │  │  brain/      │
│  ingest.js   │  │  query.js    │
└──────┬───────┘  └──────┬───────┘
       │                 │
       └────────┬─────────┘
                │
                ▼
┌─────────────────────────────────────┐
│           brain/llm.js              │
│  Provider abstraction layer         │
│  (Gemini or Claude, auto-detected)  │
└─────────────────────────────────────┘
                │
                │  API call
                ▼
┌─────────────────────────────────────┐
│  Google Gemini  OR  Anthropic Claude│
│  (whichever key is set in .env)     │
└─────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│           brain/files.js            │
│  read / write markdown on disk      │
└─────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│  domains/<domain>/                  │
│  ├── CLAUDE.md  (schema)            │
│  ├── raw/       (source files)      │
│  └── wiki/      (knowledge pages)  │
└─────────────────────────────────────┘
```

Obsidian (a separate desktop app) reads the same `domains/` folder directly — no sync or export required.

---

## Directory structure

```
second-brain/
├── src/
│   ├── server.js               Express entry point (port 3333)
│   ├── routes/
│   │   ├── domains.js          GET  /api/domains
│   │   ├── ingest.js           POST /api/ingest
│   │   ├── query.js            POST /api/query
│   │   └── wiki.js             GET  /api/wiki/:domain
│   ├── brain/
│   │   ├── llm.js              LLM abstraction (Gemini + Claude)
│   │   ├── files.js            Filesystem helpers
│   │   ├── ingest.js           Ingest pipeline (LLM call + file writes)
│   │   └── query.js            Query pipeline (LLM call)
│   └── public/
│       ├── index.html          Single-page UI shell
│       ├── app.js              Vanilla JS frontend
│       └── styles.css          Dark-theme styles
├── domains/
│   └── <domain>/
│       ├── CLAUDE.md           Domain schema (system prompt for the LLM)
│       ├── raw/                Immutable uploaded source files
│       └── wiki/
│           ├── index.md        Content catalog
│           ├── log.md          Chronological ingest log
│           ├── entities/       People, tools, companies, datasets
│           ├── concepts/       Ideas, techniques, frameworks
│           └── summaries/      One page per ingested source
├── docs/                       This documentation
├── package.json
├── .env                        API key (never committed)
└── .gitignore
```

---

## LLM provider selection (`src/brain/llm.js`)

The app auto-detects which LLM provider to use based on which key is present in `.env`. `GEMINI_API_KEY` takes priority if both are set.

```
GEMINI_API_KEY set      →  Google Gemini  (default model: gemini-2.5-flash-lite)
ANTHROPIC_API_KEY set   →  Anthropic Claude (default model: claude-sonnet-4-6)
Neither set             →  Error on startup
```

The optional `LLM_MODEL` env var overrides the default model for whichever provider is active.

`generateText(systemPrompt, userPrompt, maxTokens, responseFormat)` is the single function both `ingest.js` and `query.js` call. It handles the provider-specific API differences internally.

For ingest calls, `responseFormat: 'json'` is passed, which enables Gemini's native `responseMimeType: 'application/json'` — this forces the model to produce structurally valid JSON even when the content contains markdown characters (backticks, quotes, backslashes) that would otherwise break parsing.

---

## Data flow: Ingest

```
User uploads file
      │
      ▼
POST /api/ingest  (multipart/form-data: file + domain)
      │
      ▼  multer saves to OS temp dir
src/routes/ingest.js  —  validates domain + file type
      │
      ▼
src/brain/ingest.js
      ├─ 1. Copy file → domains/<domain>/raw/<filename>
      ├─ 2. Extract text (.txt/.md → readFile, .pdf → pdf-parse)
      ├─ 3. Load domains/<domain>/CLAUDE.md  (system prompt)
      ├─ 4. Load domains/<domain>/wiki/index.md  (current wiki state)
      ├─ 5. Call LLM via llm.js  (JSON mode, 32 768 max output tokens)
      │     System:  domain CLAUDE.md schema
      │     User:    date + index + source text (≤80 000 chars) + instructions
      │     Returns: { title, pages: [{path, content}], index }
      ├─ 6. Write each page → domains/<domain>/wiki/<path>
      ├─ 7. Write updated index.md
      └─ 8. Append timestamped entry to log.md

HTTP response → { success: true, title, pagesWritten: [...] }
```

## Data flow: Query

```
User submits question
      │
      ▼
POST /api/query  { domain, question }
      │
      ▼
src/brain/query.js
      ├─ 1. Load domains/<domain>/CLAUDE.md  (system prompt)
      ├─ 2. Read all .md files under domains/<domain>/wiki/
      ├─ 3. Call LLM via llm.js  (text mode, 4 096 max output tokens)
      │     System:  domain schema
      │     User:    all wiki pages (≤90 000 chars) + question
      │     Returns: markdown answer with [source: path] citation tags
      └─ 4. Parse [source: ...] tags → deduplicated citation list

HTTP response → { answer, citations: [...] }
```

---

## Module reference

### `src/brain/llm.js`

| Export | Description |
|--------|-------------|
| `getProviderInfo()` | Returns `{ provider, model }` based on env vars |
| `generateText(system, user, maxTokens, responseFormat)` | Single LLM call; handles Gemini and Claude API differences |

### `src/brain/files.js`

Pure filesystem helpers. No LLM calls.

| Export | Description |
|--------|-------------|
| `listDomains()` | Names of all subdirectories under `domains/` |
| `readSchema(domain)` | Contents of `domains/<domain>/CLAUDE.md` |
| `readWikiPages(domain)` | All `.md` files under `wiki/`, returned as `{path, content}[]` |
| `writePage(domain, relativePath, content)` | Write a wiki page, creating parent directories as needed |
| `appendLog(domain, entry)` | Append a string to `log.md` |
| `readIndex(domain)` | Contents of `index.md` |

### `src/brain/ingest.js`

```js
ingestFile(domain, filePath, originalName)
  → Promise<{ title: string, pagesWritten: string[] }>
```

### `src/brain/query.js`

```js
queryDomain(domain, question)
  → Promise<{ answer: string, citations: string[] }>
```

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.39 | Anthropic Claude API client |
| `@google/generative-ai` | ^0.24 | Google Gemini API client |
| `express` | ^4 | HTTP server and routing |
| `multer` | ^2 | Multipart file upload handling |
| `pdf-parse` | ^1 | Extract text from PDF files |
| `fs-extra` | ^11 | Extended filesystem utilities |
| `dotenv` | ^16 | Load `.env` into `process.env` |

**No Axios.** All HTTP is handled by the Express server or Node's native `fetch`. If Axios is added in future (e.g. for URL ingestion), avoid compromised versions `1.14.1` and `0.30.4`; pin to a safe version such as `1.7.9`.

---

## Design decisions

**Why markdown files instead of a vector database?**
At the scale of a focused domain wiki (tens to low hundreds of pages), the LLM can read the entire wiki in a single context window and reason across all of it precisely. Markdown files are human-readable, portable, and work natively with Obsidian's graph view.

**Why a provider abstraction layer?**
`llm.js` keeps `ingest.js` and `query.js` free of provider-specific code. Switching between Gemini and Claude requires only changing an env var — no code changes. Adding a third provider (e.g. local Ollama) means only touching `llm.js`.

**Why one CLAUDE.md schema per domain?**
Domain context shapes how the LLM categorises knowledge. An AI/Tech wiki uses different entity types and concept hierarchies than a Personal Growth wiki. Per-domain schemas give each wiki a specialist, not a generalist.

**Why vanilla JS instead of React/Vue?**
The UI has three tabs and a handful of fetch calls. A framework adds build complexity and bundle size with no meaningful benefit for a local personal tool.

**Why JSON mode for ingest but not query?**
Ingest requires structured output (pages + index as a JSON object) that must be machine-parsed. Query returns free-form markdown prose; JSON mode would constrain the writing style unnecessarily.
