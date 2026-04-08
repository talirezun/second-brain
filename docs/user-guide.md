# User Guide

## Setup

### 1. Get an API key

**Google Gemini** (recommended — very low cost, free tier available)
- Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- Click **Create API key** and copy it

**Anthropic Claude** (alternative)
- Go to [console.anthropic.com](https://console.anthropic.com)
- Create an API key and copy it

### 2. Add your key to `.env`

The `.env` file lives in the root of the project folder (`second-brain/.env`). Open it in any text editor and paste your key:

**Using Gemini:**
```
GEMINI_API_KEY=AIza...your key here...
```

**Using Anthropic:**
```
ANTHROPIC_API_KEY=sk-ant-...your key here...
```

Leave everything else in the file as-is.

> If `.env` doesn't exist yet, run this in the project folder:
> ```bash
> cp .env.example .env
> ```

### 3. Install dependencies

Open a terminal, navigate to the project folder, and run:

```bash
cd /path/to/second-brain
npm install
```

Only needed once after cloning.

### 4. Start the server

In the same terminal, run:

```bash
node src/server.js
```

You should see:

```
Second Brain running at http://localhost:3333
LLM provider: 🟦 Gemini  |  model: gemini-2.5-flash-lite
```

The server keeps running in this terminal window. To stop it, press `Ctrl + C`.

### 5. Open the app

Open your browser and go to:

```
http://localhost:3333
```

You'll see three tabs: **Ingest**, **Query**, and **Wiki**.

> **Every time you want to use the app**, open a terminal in the project folder and run `node src/server.js`, then go to `http://localhost:3333`.

---

## Ingesting a source

The **Ingest** tab is how you feed knowledge into your brain.

### Supported file types

| Type | Extension | Notes |
|------|-----------|-------|
| Plain text | `.txt` | Articles, notes, transcripts, anything you've copied |
| Markdown | `.md` | Existing notes, research write-ups |
| PDF | `.pdf` | Papers, reports, books (text-based PDFs; scanned PDFs are not supported) |

### Steps

1. Select a **domain** from the dropdown (AI/Tech, Business/Finance, or Personal Growth).
2. Drag a file onto the drop zone, or click it to browse your files.
3. Click **Ingest**.
4. Wait — the AI reads the entire source and updates the wiki. This typically takes 15–45 seconds depending on document length.
5. When done, you'll see a list of every wiki page that was created or updated.

### What happens behind the scenes

The AI reads your source and produces:

- A **summary page** — key takeaways from the document.
- **Entity pages** — one page per notable person, tool, company, framework, or dataset mentioned.
- **Concept pages** — one page per key idea or technique.
- **Cross-references** — every page links to related pages using `[[page-name]]` syntax.
- An updated **index** — the master catalog of everything in the wiki.
- A **log entry** — a timestamped record of the ingest.

On subsequent ingests, the AI reads the existing index and updates existing pages rather than duplicating them. Knowledge compounds.

### Tips for better ingests

- **Clean up your source first.** Remove boilerplate (navigation menus, footers, email headers) before saving to a `.txt` file. The cleaner the input, the sharper the wiki pages.
- **Use descriptive filenames.** `atomic-habits-chapter-5.txt` is more useful than `doc1.txt` — the filename appears in the log and summary page.
- **One source at a time.** Ingest documents one by one so each gets a proper summary page.
- **PDF caveat.** Complex layouts (multi-column, heavy graphics) may produce garbled text. For those, copy-paste the text into a `.txt` file instead.

---

## Querying your brain

The **Query** tab lets you ask questions and get synthesised answers with citations.

### Steps

1. Select a **domain**.
2. Type your question in the text area.
3. Click **Ask** (or press `Cmd + Enter` on Mac / `Ctrl + Enter` on Windows).
4. The AI reads the entire wiki for that domain and returns a structured answer.

### What a good answer looks like

```
RAG (Retrieval-Augmented Generation) works by combining a retrieval step with
a generation step [source: concepts/rag.md]. Rather than relying purely on the
model's parametric memory, it fetches relevant documents first.

## Sources
- concepts/rag.md
- summaries/rag-survey.md
```

### Query tips

- **Be specific.** "What are the tradeoffs between RAG and fine-tuning?" works better than "Tell me about AI."
- **Ask comparative questions.** "How does X relate to Y?" synthesises across multiple pages.
- **The wiki must have relevant content.** If you haven't ingested sources about a topic, the AI will say so honestly rather than making things up.

---

## Browsing the wiki

The **Wiki** tab gives you a read-only view of everything in a domain.

1. Select a **domain**.
2. Click **Load**.
3. The sidebar shows all pages grouped by type (summaries, concepts, entities).
4. Click any page to read it.

For a richer experience with graph view and backlinks, open the `domains/` directory in [Obsidian](https://obsidian.md) — the `[[page-name]]` cross-references render as native links.

---

## Domain selection strategy

Each domain is an isolated wiki. Keep domains **focused and mutually exclusive**:

| Good domain definition | Too broad |
|------------------------|-----------|
| AI / Tech | Science and Technology |
| Business / Finance | Career and Money |
| Personal Growth | Life |

The three built-in domains are:

| Domain | What to put here |
|--------|-----------------|
| `ai-tech` | AI papers, developer tools, engineering articles, tech company analysis |
| `business-finance` | Business books, investing frameworks, startup analysis, market research |
| `personal-growth` | Self-improvement books, productivity systems, mental models, psychology |

To add a new domain, see [adding-domains.md](adding-domains.md).

---

## Switching between Gemini and Claude

Open `.env` and set the key for the provider you want. The app auto-detects which one to use.

```
# Use Gemini (uncomment this line, comment out the Anthropic one)
GEMINI_API_KEY=AIza...

# Use Anthropic Claude (uncomment this line, comment out the Gemini one)
# ANTHROPIC_API_KEY=sk-ant-...
```

To override the default model:
```
LLM_MODEL=gemini-2.0-flash
```

Restart the server after any `.env` change.

---

## Managing your wiki files

All wiki files are plain markdown under `domains/<domain>/wiki/`. You can:

- **Open them in any text editor** or open the folder in Obsidian.
- **Edit them manually** to add personal notes or correct something the AI got wrong.
- **Delete a page** by removing the file — the index will update on the next ingest.

### Key files in every domain

| File | Purpose |
|------|---------|
| `wiki/index.md` | Master catalog — every page with a one-line summary |
| `wiki/log.md` | Chronological history of every ingest |
| `wiki/summaries/` | One file per source you've ingested |
| `wiki/concepts/` | Key ideas extracted from your sources |
| `wiki/entities/` | People, tools, companies, and other named things |
| `raw/` | Your original uploaded files. Never modified by the system |

---

## Troubleshooting

**The server won't start — "No LLM API key found"**

Your `.env` file is missing or the key is not set. Check that the file exists and that the key is uncommented and filled in:
```bash
cat .env
```

**"command not found: node"**

Node.js is not installed or not in your PATH. Download it from [nodejs.org](https://nodejs.org) (version 18 or higher).

**"Cannot find module" error on startup**

Dependencies are not installed. Run:
```bash
npm install
```

**Ingest fails with a JSON parse error**

Very long documents may hit the model's output limit. Try splitting the document into smaller files.

**PDF text looks garbled**

The document is likely scanned (image-based) rather than text-based. Copy the text manually and save it as a `.txt` file.

**Port 3333 is already in use**

Add this line to `.env` to use a different port:
```
PORT=4000
```
Then restart the server and open `http://localhost:4000`.
