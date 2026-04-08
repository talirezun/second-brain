# Second Brain — Documentation

## What is Second Brain?

We live in the age of information overload. Every day you read articles, watch lectures, skim research papers, and save "interesting things" — then forget them completely within a week. Your notes app is a graveyard. Your bookmarks are never opened again. And when you actually need to recall something, it's gone.

**Second Brain solves this.** It is a local, AI-powered knowledge system that turns the documents you consume into a living, searchable, interconnected wiki — one that you can actually query like a knowledgeable assistant.

The core insight, from researcher Andrej Karpathy and educator Nick Spisak: **one general-purpose second brain that covers everything ends up good at nothing.** Instead, you maintain focused wikis per domain — one for AI/Tech, one for Business, one for Personal Growth. Each one is a specialist. Each one compounds in value with every source you add.

### What you can do with it

- **Ingest** any PDF, article, or note — the AI reads it and automatically writes interlinked wiki pages: summaries, entity pages (people, tools, companies), and concept pages (ideas, frameworks, techniques)
- **Query** your knowledge base in plain language — "What do I know about RAG vs fine-tuning?" — and get a cited answer sourced from your own wiki
- **Explore** your knowledge visually as an interactive graph in Obsidian — see how ideas, people, and tools connect across everything you've read
- **Build** a personal library that gets smarter over time — the more you add, the richer the connections

### Why it matters

Most people consume information passively and retain almost none of it. Second Brain turns passive consumption into active knowledge. Instead of reading an article and forgetting it, you ingest it — and from that point on, it's part of a growing, queryable, visual knowledge graph that is entirely yours, stored on your computer, with no subscriptions or cloud accounts required.

For students, researchers, entrepreneurs, and lifelong learners: this is the difference between having a pile of notes and having a thinking partner that knows everything you've ever read.

---

## Start here

**New to the project?** Read the [User Guide](user-guide.md) — it covers everything from installation to using Obsidian, written in plain language for non-technical users.

**On a Mac?** Read [Mac App Setup](mac-app.md) to turn Second Brain into a double-click app in your Dock — no terminal needed.

---

## All documents

| Document | Who it's for | What's inside |
|----------|-------------|---------------|
| [user-guide.md](user-guide.md) | Everyone | Step-by-step setup, using the app, Obsidian integration, daily workflow, troubleshooting |
| [mac-app.md](mac-app.md) | Mac users | How to create a double-click Dock app so you never need the terminal |
| [domain-schemas.md](domain-schemas.md) | Users who want custom domains | How the AI schemas work, templates, examples |
| [adding-domains.md](adding-domains.md) | Users who want custom domains | Step-by-step guide to creating a new domain |
| [api-reference.md](api-reference.md) | Developers | Full REST API documentation |
| [architecture.md](architecture.md) | Developers | System design, data flow, module reference |

---

## Quick start (experienced users)

```bash
# 1. Clone and install
git clone https://github.com/talirezun/second-brain.git
cd second-brain
npm install

# 2. Create .env and add your Gemini API key
cp .env.example .env
# Open .env and set: GEMINI_API_KEY=your_key_here

# 3. Start
node src/server.js

# 4. Open the app
# Go to http://localhost:3333 in your browser
```

Get a free Gemini API key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
