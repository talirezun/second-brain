# Second Brain — Documentation

> A domain-specific, AI-powered knowledge system based on the Karpathy/Spisak llm-wiki concept.

## Start here

**New to the project?** Read the [User Guide](user-guide.md) — it covers everything from installation to using Obsidian, written for non-technical users.

## All documents

| Document | Who it's for | What's inside |
|----------|-------------|---------------|
| [user-guide.md](user-guide.md) | Everyone | Step-by-step setup, using the app, Obsidian integration, daily workflow, troubleshooting |
| [domain-schemas.md](domain-schemas.md) | Users who want custom domains | How the AI schemas work, templates, examples |
| [adding-domains.md](adding-domains.md) | Users who want custom domains | Step-by-step guide to creating a new domain |
| [api-reference.md](api-reference.md) | Developers | Full REST API documentation |
| [architecture.md](architecture.md) | Developers | System design, data flow, module reference |

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

## Core concept

The problem with a general-purpose second brain is that one system trying to cover everything ends up good at nothing. This system uses **dedicated wikis per domain** — each one stays focused, compounds knowledge from every source you add, and can be queried like a domain specialist.

Each domain is an isolated wiki of interlinked markdown files. The AI reads your sources, extracts entities and concepts, writes cross-referenced pages, and synthesises answers with citations on demand. Obsidian reads the same files and renders them as an interactive knowledge graph.
