# User Guide — The Curator

This guide covers everything from first-time setup to daily use. No technical background is required.

---

## Table of contents

1. [What is this app?](#1-what-is-this-app)
2. [What you need before you start](#2-what-you-need-before-you-start)
3. [Installation](#3-installation)
4. [Get your free API key](#4-get-your-free-api-key)
5. [Configure the app](#5-configure-the-app)
6. [Start the server](#6-start-the-server)
7. [Open the app in your browser](#7-open-the-app-in-your-browser)
8. [Ingest a source](#8-ingest-a-source)
9. [Chat with your brain](#9-chat-with-your-brain)
10. [Manage your domains](#10-manage-your-domains)
11. [Browse the wiki tab](#11-browse-the-wiki-tab)
12. [See your knowledge graph in Obsidian](#12-see-your-knowledge-graph-in-obsidian)
13. [Two ways to explore your knowledge](#13-two-ways-to-explore-your-knowledge)
14. [Daily workflow](#14-daily-workflow)
15. [Sync across computers](#15-sync-across-computers)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. What is this app?

The Curator is a local, AI-powered knowledge curation system. You feed it documents — articles, PDFs, notes — and it:

- Automatically **atomizes** them into three network components: *Entities* (people, tools, companies), *Concepts* (ideas, techniques, frameworks), and *Summaries* (source narratives that connect them)
- Builds a **compounding wiki** of interlinked pages — unlike RAG systems that re-derive knowledge on every query, The Curator writes persistent pages that grow richer with every source you add
- Lets you have a **multi-turn AI conversation** with your knowledge base, with full memory of past conversations
- Produces a **visual knowledge graph** you can explore in Obsidian, with auto-colored nodes by type

The big idea: instead of one giant notebook where everything gets lost, you have **separate, focused wikis per topic** (e.g. AI/Tech, Business, Personal Growth). Each one compounds with every source you add. You are the curator; the AI is the diligent librarian.

---

## 1b. Who this is for

The Curator is domain-agnostic. Here are the main profiles who benefit from it:

**Content Creators (Writers, Podcasters, YouTubers)**
You consume hundreds of articles, books, and podcasts, but face a blank page when it's time to create. Ingest all your research — the Curator builds a content assembly line. The graph shows which themes you naturally gravitate toward; clicking an entity shows every source you've read about it.

**Researchers & Academics**
Batch-upload 20+ PDFs on a topic. The Curator extracts all distinct methodologies and authors. Use the graph's visual "Idea Collisions" to identify gaps in the literature — intersections between concepts that no existing paper has yet addressed. The chat synthesises findings across all papers with source citations.

**Executives & Strategists**
Upload reports, competitor analyses, and meeting transcripts. Build an intelligence layer where the most-referenced nodes grow largest, giving you a visual heat map of your knowledge. Query for synthesised strategic answers that bypass recency bias.

**Software Architects & Development Teams**
Ingest architecture decision records, API specs, and post-mortems. New team members can ask *"Why did we choose X over Y?"* and get an answer cited directly from a document written years ago. The Curator becomes a conversational Senior Engineer that never leaves.

**Medical & Scientific Researchers**
Drop in clinical trial PDFs and papers. The graph reveals hidden intersections — a compound used in one domain showing efficacy in another study — by visually bridging entity nodes across your entire literature corpus.

**Entrepreneurs & Startup Founders**
Feed it customer interview transcripts, investor updates, and market research. Query for synthesised strategic answers grounded entirely in your own collected intelligence, not generic AI output.

**Personal Growth & Self-Analysis**
Ingest journal entries, book highlights, and podcast notes. Query recurring patterns across months of writing. The Curator provides the objectivity of a third party on your own thinking.

→ See [docs/use-cases.md](use-cases.md) for detailed workflows for each profile.

---

## 2. What you need before you start

| Requirement | What it is | Where to get it |
|-------------|-----------|-----------------|
| A computer | Mac, Windows, or Linux | — |
| Node.js (version 18 or newer) | The engine that runs the app | [nodejs.org](https://nodejs.org) — download the LTS version |
| A Gemini API key | Gives the app access to Google's AI | Free at [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| Obsidian (optional) | App to visualise the knowledge graph | Free at [obsidian.md](https://obsidian.md) |

**How to check if Node.js is already installed:**
Open Terminal (Mac) or Command Prompt (Windows) and type:
```
node --version
```
If you see a number like `v22.0.0`, you're good. If you see an error, download Node.js from the link above and install it first.

---

## 3. Installation

> **What is a terminal?** On Mac, open **Terminal** (search for it in Spotlight). On Windows, open **Command Prompt** or **PowerShell**. It's just a text-based way to run commands.

### Step 1 — Download the project

In your terminal, paste this and press Enter:

```bash
git clone https://github.com/talirezun/the-curator.git
```

This downloads the project into a folder called `the-curator` in whatever directory you're currently in.

### Step 2 — Go into the project folder

```bash
cd the-curator
```

### Step 3 — Install dependencies

```bash
npm install
```

This downloads all the packages the app needs. You'll see a lot of text scroll by — that's normal. Wait until it finishes (usually under 30 seconds).

> You only need to do steps 1–3 **once**. After that, you just start the server each time you want to use the app.

---

## 4. Get your free API key

The app uses Google's Gemini AI to read your documents. You need a free API key to access it.

1. Go to **[aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)**
2. Sign in with your Google account
3. Click **Create API key**
4. Copy the key — it starts with `AIza` and is about 40 characters long
5. Keep it somewhere safe — you'll paste it in the next step

> Your API key is like a password. Never share it publicly or post it on the internet.

---

## 5. Configure the app

The app reads its settings from a file called `.env` in the project folder.

### Step 1 — Create the .env file

In your terminal (make sure you're still in the `the-curator` folder), run:

```bash
cp .env.example .env
```

This creates `.env` by copying the template.

### Step 2 — Add your API key

Open the `.env` file in any text editor (Notepad on Windows, TextEdit on Mac, or VS Code).

You'll see this:

```
GEMINI_API_KEY=your_gemini_key_here
```

Replace `your_gemini_key_here` with the key you copied from Google. It should look like:

```
GEMINI_API_KEY=AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567
```

Save the file and close it.

> **Important:** The `.env` file is private. It is listed in `.gitignore` so it is never uploaded to GitHub. Your key stays on your computer only.

---

## 6. Start the server

Every time you want to use The Curator, you need to start the server first.

Open your terminal, go to the project folder, and run:

```bash
node src/server.js
```

You should see:

```
The Curator running at http://localhost:3333
LLM provider: 🟦 Gemini  |  model: gemini-2.5-flash-lite
```

**The server keeps running in this terminal window.** Do not close it while you're using the app. To stop the server, press `Ctrl + C`.

> **Tip:** Every time you restart your computer, you need to start the server again with `node src/server.js`.

---

## 7. Open the app in your browser

With the server running, open your web browser (Chrome, Safari, Firefox — any browser works) and go to:

```
http://localhost:3333
```

You'll see the The Curator interface with five tabs at the top: **Ingest**, **Chat**, **Wiki**, **Sync**, and **Domains**.

> `localhost:3333` means "a web page running on your own computer, on port 3333". It only works when your server is running and is not accessible to anyone else on the internet.

---

## 8. Ingest a source

"Ingesting" means feeding a document to your The Curator. This is how you build up your knowledge.

### Supported file types

| File type | Extension | Example use |
|-----------|-----------|-------------|
| PDF | `.pdf` | Research papers, book chapters, reports |
| Text file | `.txt` | Articles you've copied, lecture notes |
| Markdown | `.md` | Notes from other apps, written summaries |

> **PDF tip:** Only text-based PDFs work. If a PDF is a scanned image (like a photo of a page), the text cannot be extracted. In that case, copy-paste the text into a `.txt` file instead.

### How to ingest

1. Click the **Ingest** tab
2. Select a **domain** from the dropdown (e.g. "AI Tech", "Business Finance", or "Personal Growth")
3. Drag your file onto the drop zone, or click it to browse your files
4. Click **Ingest**
5. Wait — you'll see a spinner that says "The Curator is reading your source and updating the wiki..." This usually takes **15–60 seconds** depending on the document length. Do not close the browser or refresh the page.
6. When finished, you'll see a list of all the wiki pages that were created or updated

### What happens automatically

The AI reads your document and creates:

- **1 summary page** — the key takeaways in bullet points
- **Entity pages** — one page for each person, tool, company, or framework mentioned
- **Concept pages** — one page for each key idea or technique
- **Cross-references** — every page links to related pages
- An updated **index** — a master catalog of everything in this domain
- A **log entry** — a record of this ingest with today's date

On the second, third, and subsequent ingests, the AI reads what's already in the wiki and *updates* existing pages rather than duplicating them. The more you add, the smarter it gets.

### Tips for better results

- **Use descriptive filenames.** `atomic-habits-summary.txt` is better than `notes.txt` — the filename appears in the log.
- **One document at a time.** Don't combine ten articles into one file; each document should get its own ingest so it gets its own summary page.
- **Clean up copy-pasted text.** If you paste an article from a website, remove the navigation menus, cookie banners, and footer text first. Cleaner input = better wiki pages.

---

## 9. Chat with your brain

After ingesting a few sources, you can have a full multi-turn conversation with your knowledge base. The AI answers from your wiki pages only, cites its sources, and remembers the entire thread — even after you restart the server.

### The chat interface

The Chat tab has two parts:

- **Left sidebar** — your conversation history. Each domain's conversations are listed separately. Click any conversation to reopen it.
- **Right panel** — the message thread. Your messages appear on the right (blue), the AI's replies on the left.

### Starting a conversation

1. Click the **Chat** tab
2. Select a **domain** from the dropdown at the top of the sidebar
3. Click **+ New Chat** (or just start typing — a new conversation is created automatically)
4. Type your question in the input box at the bottom
5. Press **Send** or use `Cmd + Enter` (Mac) / `Ctrl + Enter` (Windows)
6. Wait for the reply — usually 10–30 seconds

### What a good reply looks like

```
Retrieval-Augmented Generation (RAG) combines a retrieval step with
generation, so the model grounds its answer in real documents rather
than relying on memory alone [source: concepts/rag.md].

The key advantage over fine-tuning is that you can update the knowledge
base without retraining the model [source: summaries/rag-paper.md].
```

The `[source: ...]` tags tell you exactly which wiki page each claim came from. You can open that page in the Wiki tab or in Obsidian to read the full source.

### Multi-turn memory

You can keep asking follow-up questions and the AI remembers the entire conversation:

```
You:  What is RAG?
AI:   RAG stands for… [source: concepts/rag.md]

You:  How does it compare to fine-tuning?
AI:   As I mentioned, RAG updates knowledge without retraining…
      [source: summaries/rag-paper.md]

You:  Who are the key researchers in this area?
AI:   Based on your notes, the main contributors are…
```

Conversations are saved automatically and persist across server restarts. You can have as many conversations per domain as you like.

### Managing conversations

- **Rename / revisit** — click any conversation in the sidebar to reopen it in full
- **Delete** — hover over a conversation in the sidebar and click the **✕** button that appears

### Good questions to ask

- "What is [concept] and why does it matter?"
- "What are the key differences between [X] and [Y]?"
- "How does [idea from one source] connect to [idea from another source]?"
- "Who are the main people mentioned in my notes on [topic]?"
- "What tools are recommended for [task]?"
- "Summarise everything I know about [topic]"
- "What have I learned about this topic over time?"

> The AI only answers from your wiki. If you haven't ingested any sources about a topic, it will say so honestly rather than making things up.

---

## 10. Manage your domains

The **Domains** tab is your control panel for organising your The Curator. Instead of manually creating folders in Finder, you can create, rename, and delete domains entirely from within the app.

### What is a domain?

A domain is a focused knowledge silo — a dedicated wiki for one topic area. Each domain gets its own AI schema, wiki pages, chat conversations, and Obsidian graph cluster. The three built-in domains are **AI / Tech**, **Business / Finance**, and **Personal Growth**, but you can create as many as you like.

### Viewing your domains

Click the **Domains** tab to see all your domains as cards. Each card shows:

- The domain name and its folder path (`domains/ai-tech/`)
- How many wiki pages it contains
- How many chat conversations it has
- When the last source was ingested

### Creating a new domain

1. Click **New Domain**
2. Type a display name — for example, `Health & Fitness`
   - The folder name is generated automatically (e.g. `domains/health-and-fitness/`) and shown as a live preview below the input
3. Optionally add a scope description — 1–2 sentences about what belongs in this domain
4. Choose a **template** — this determines how the AI structures your wiki:

| Template | Best for | Entity types | Concept style |
|----------|----------|-------------|---------------|
| ⚙️ Tech / AI | Software, research, tools | person, tool, company, dataset | How It Works / Applications |
| 📈 Business / Finance | Startups, investing, strategy | person, company, fund, institution | Why It Matters / Examples |
| 🌱 Personal Growth | Books, habits, mental models | person, book, framework | Why It Matters / How to Apply It |
| 📁 Generic | Any other topic | person, item, organization | Overview / Examples |

5. Click **Create Domain**

The domain appears immediately in all dropdowns (Ingest, Chat, Wiki) and in Obsidian's file explorer — no restart required.

### Renaming a domain

1. Click the **pencil icon** on any domain card
2. Type the new display name — the new folder path updates in the live preview
3. Click **Rename**

The folder is renamed on disk. All wiki pages, conversations, and chat history are preserved. Obsidian reflects the change immediately.

> **If sync is configured:** renaming a domain appears to GitHub as a delete + add. Click **Sync Up** soon after renaming so your other computers stay consistent.

### Deleting a domain

1. Click the **trash icon** on any domain card
2. Read the confirmation panel — it shows exactly how many wiki pages and conversations will be deleted
3. Click **Yes, delete permanently** to confirm

The folder is removed from disk and disappears from all dropdowns. Obsidian reflects the change immediately.

> ⚠️ **Deletion is permanent.** There is no undo. If you use sync, the domain will also be removed from GitHub on the next Sync Up.

### Obsidian and domain management

Because The Curator writes directly to the `domains/` folder that Obsidian watches, all domain changes are reflected in Obsidian instantly — no refresh or export needed. A new domain becomes a new folder in Obsidian's file explorer. A renamed or deleted domain updates the graph accordingly.

---

## 11. Browse the wiki tab

The **Wiki** tab is a simple built-in reader for your wiki pages.

1. Click the **Wiki** tab
2. Select a **domain**
3. Click **Load**
4. Browse pages in the left sidebar (grouped by type: summaries, concepts, entities)
5. Click any page to read it

This is useful for a quick check. For a much richer experience — including the interactive knowledge graph — use Obsidian (see the next section).

---

## 12. See your knowledge graph in Obsidian

Obsidian is a free note-taking app that reads the exact same markdown files that The Curator writes. It gives you an interactive, visual knowledge graph — like the one shown in the concept video.

The Curator is purpose-built to act as the *engine* for Obsidian's visual interface. Obsidian is the IDE; the AI is the programmer; the wiki is the codebase. The Curator handles Atomic Decomposition — breaking sources into Entities, Concepts, and Summaries — so Obsidian can visualize the resulting neural network.

### First-time setup

1. Download and install **Obsidian** from [obsidian.md](https://obsidian.md) (it's free)
2. Open Obsidian
3. On the welcome screen, click **Open folder as vault**
4. Navigate to your `the-curator` folder on your computer, then go inside the `domains` folder
5. Select `domains` and click **Open**

Obsidian will scan all the markdown files and build an index instantly.

### Opening the knowledge graph

In Obsidian's left sidebar, click the **graph icon** (it looks like a network of dots). This opens the Graph View — an interactive, zoomable map of all your wiki pages and how they connect.

- **Each dot** is a wiki page (summary, concept, or entity)
- **Each line** is a `[[link]]` between pages
- **Bigger dots** are pages with more connections
- **Click any dot** to open that page
- **Scroll to zoom** in and out
- **Drag to pan** around the graph

The more documents you ingest, the richer the graph becomes.

### Activate graph colors (one-time setup)

Every wiki page now contains a **type tag** in its metadata (`type/entity`, `type/concept`, `type/summary`). You can tell Obsidian to use these tags to automatically color-code every node in the graph.

**You only need to do this once.** After that, every future ingest automatically colors new nodes — no manual work.

1. Open Obsidian and go to the Graph View (graph icon in the left sidebar)
2. Click the **gear icon** (⚙) at the top-right of the Graph View panel
3. Find the **Groups** section and click **New Group** three times

Set up each group exactly like this:

| Group | Query | Suggested color |
|-------|-------|----------------|
| Entities | `tag:#type/entity` | Blue |
| Concepts | `tag:#type/concept` | Green |
| Summaries | `tag:#type/summary` | Purple or Red |

4. Click the color circle next to each group and choose your color

**Result:** Entities (people, tools, companies) appear blue; concepts (ideas, techniques) appear green; summaries (source documents) appear purple/red. Your neural network is now visually segmented — you can instantly see at a glance whether a cluster contains mostly ideas or mostly sources.

**Pro tip — node size:** In the same Graph View gear panel, find **Node size** → set it to **Linked mentions**. Pages with more connections grow larger, making your most-connected concepts and entities visually prominent.

### Using the Properties panel

Each wiki page now has structured metadata (called "Properties") at the top — you can see it in Obsidian's right panel when a page is open. It shows the page type, all tags, and the date it was created. You can filter and query this data using the free **Dataview** plugin:

1. In Obsidian, open **Settings → Community plugins → Browse**
2. Search for **Dataview** and install it
3. Create a new note and paste this to see all entities in your AI/Tech domain:

```dataview
TABLE tags, created FROM "ai-tech/wiki/entities"
WHERE type = "entity"
SORT created DESC
```

### How Obsidian and the app work together

They share the same files — there is nothing to sync or export.

```
The Curator app          Obsidian
(localhost:3333)          (desktop app)
       │                       │
       │   Both read/write     │
       └──► domains/ folder ◄──┘
```

**The intended workflow:**

1. Use **The Curator app** to ingest documents and ask questions
2. Open **Obsidian** to visually explore the knowledge graph, browse pages, and manually add your own notes

You can have both open at the same time. When you ingest something in the app, switch to Obsidian and press `Ctrl/Cmd + R` to refresh — the new pages appear instantly.

### What about my existing wiki files?

If you already had wiki pages before this update, those older files do not yet have the structured metadata (YAML frontmatter) needed for graph coloring and Dataview queries. They will appear as uncolored nodes in the graph.

**To update existing pages, simply re-ingest the same source file:**

1. Go to the **Ingest** tab
2. Upload the same original document again (PDF, txt, etc.)
3. The app detects it has been ingested before and *updates* the existing wiki pages rather than duplicating them

Re-ingesting is safe — it merges new information with what already exists. Pages that get updated will gain the YAML metadata and immediately appear colored in Obsidian.

> **Tip:** If you have many existing files and don't want to re-ingest them manually, you can skip this step. The old pages still appear in the graph as uncolored nodes, and all new ingests going forward will be colored automatically.

### Useful Obsidian features

| Feature | How to access | What it does |
|---------|--------------|--------------|
| Graph view | Graph icon in left sidebar | Interactive knowledge map |
| Quick switcher | `Cmd/Ctrl + O` | Jump to any page by name |
| Search | `Cmd/Ctrl + Shift + F` | Search across all pages |
| Backlinks | Right panel when a page is open | See which pages link to the current page |
| Local graph | Three-dot menu on any open page | Graph of just that page's connections |
| Properties | Right panel → Properties | Structured metadata for the current page |

### The Local Graph test

A healthy knowledge network passes this test: open any **concept** page, set the local graph depth to 2. You should see the concept connected to multiple summaries *and* multiple entities. If a concept connects to only one or two things, you need to ingest more sources that reference it.

**The Orphan check:** In Obsidian's Graph View, zoom out and look for dots floating alone with no connections. Every page should have at least one `[[link]]`. Your goal is zero orphans — The Curator actively cross-references all pages during ingest.

---

## 13. Two ways to explore your knowledge

Once you have ingested several documents, you have two complementary tools for making sense of what you know.

### Option A — AI chat (built-in)

Use the **Chat** tab when you want to:

- Ask a specific question and get a synthesised, cited answer
- Have a back-and-forth conversation to dig into a topic
- Connect dots across multiple sources ("how does X relate to Y?")
- Pick up a thread you started in a previous session

The AI reads your entire wiki on every message and reasons across all of it. Past conversations are saved, so you can return to a thread days later and continue where you left off.

### Option B — Obsidian graph

Use **Obsidian** when you want to:

- See the big picture — all your knowledge on a visual map
- Spot unexpected clusters and connections spatially
- Browse and edit individual wiki pages by hand
- Explore "what is connected to this page?" using the local graph

### They are complementary, not competing

```
                 The Curator app
                 (Chat tab)
                       │
          Multi-turn AI reasoning
          across all wiki pages
                       │
              domains/ folder  ◄───────┐
                       │               │
          Markdown files on disk       │
                                       │
                 Obsidian              │
              (desktop app)   ─────────┘
              Visual graph,
              manual editing
```

Both tools read the same `domains/` folder. There is nothing to sync. Ingest in the app, explore in both. The intended daily flow is:

1. Feed the app new documents (**Ingest** tab)
2. Chat with the AI to pull out insights (**Chat** tab)
3. Open Obsidian to see how the new pages fit into the graph visually

---

## 14. Daily workflow

Here is the recommended way to use The Curator day-to-day:

### When you find something worth keeping

1. Save the article/chapter/notes as a `.txt` or `.pdf` file
2. Open `http://localhost:3333` (start the server first if needed: `node src/server.js`)
3. Choose the right domain, upload the file, click **Ingest**
4. In Obsidian, press `Cmd/Ctrl + R` to see the new pages appear in the graph

### When you want to recall something

1. Open `http://localhost:3333`
2. Go to the **Chat** tab, pick a domain, and ask your question (or continue an old conversation)
3. Get a cited answer pointing to specific wiki pages
4. Click through to Obsidian to read the source page in full

### When you want to explore connections

1. Open Obsidian
2. Open the Graph view
3. Click on a topic you're curious about
4. Explore what it connects to

---

## 15. Sync across computers

The **Sync** tab keeps your wiki and chat history in sync across all your computers using a free, private GitHub repository — no subscription, no third-party service. Your notes never touch any server you don't control.

### What gets synced

| Gets synced | Stays local only |
|-------------|-----------------|
| ✓ All wiki pages | ✗ Original source files (PDFs, etc.) |
| ✓ Chat conversations | ✗ Your Gemini/Claude API key |
| ✓ Domain schemas | ✗ App code |

### First-time setup (~3 minutes)

You only do this once. After that, syncing is two button clicks.

#### Step 1 — Create a private GitHub repository

1. Go to **[github.com/new](https://github.com/new)** (create a free account if you don't have one)
2. Name the repository anything — e.g. `my-brain`
3. Make sure **Private** is selected
4. Click **Create repository** — leave everything else as default
5. Copy the URL from your browser (e.g. `https://github.com/your-username/my-brain`)

#### Step 2 — Create a Personal Access Token

This is how The Curator gets permission to read and write your private repository.

1. Go to **[github.com/settings/tokens/new](https://github.com/settings/tokens/new?scopes=repo&description=the-curator)** (you may need to sign in)
2. Give the token any name — e.g. `the-curator`
3. Under **Select scopes**, check the **repo** box ☑
4. Set **Expiration** to "No expiration" (recommended — so you don't need to regenerate it)
5. Scroll down and click **Generate token**
6. **Copy the token immediately** — GitHub only shows it once. It starts with `ghp_`

#### Step 3 — Connect in the app

1. Click the **Sync** tab in The Curator
2. Click **Set Up Sync — takes 3 minutes**
3. **Step 1 of 3:** Paste your repository URL → click Continue
4. **Step 2 of 3:** Paste your token → click Continue
5. **Step 3 of 3:** Choose your role:
   - **First computer** — you have knowledge here already; push it to GitHub
   - **Other computers** — you've already synced on another machine; pull from GitHub

The wizard connects to GitHub, creates the initial snapshot, and confirms when done. The whole process takes about 30 seconds once your details are entered.

### Daily workflow

**Golden rule:** always Sync Up on the machine you just worked on, Sync Down before you start on a different machine.

```
Computer A (worked here)    →  click Sync Up  →  GitHub
                                                      ↓
Computer B (starting here)  ←  click Sync Down ←  GitHub
```

**What the buttons do:**

| Button | What happens |
|--------|-------------|
| **↑ Sync Up** | Saves all your local changes as a snapshot and sends them to GitHub |
| **↓ Sync Down** | Downloads the latest snapshot from GitHub to this computer |

After Sync Down, refresh the Chat or Wiki tab to see the newly arrived pages.

### Setting up a second (or third) computer

On any additional computer:

1. Install the app (`git clone` + `npm install` — same as the first setup)
2. Start the server and go to `http://localhost:3333`
3. Click the **Sync** tab
4. Click **Set Up Sync**
5. Enter the **same repository URL** and the **same token** as before
6. Choose **Other computers — Pull**

The wizard downloads all your wiki pages and conversations from GitHub. Done.

### What happens if you forget to sync

If you worked on Computer A without syncing, then worked on Computer B without syncing first, the app handles it gracefully:

- When you click **Sync Down** on either machine, it automatically saves your local changes first before pulling from GitHub
- In most cases this resolves itself cleanly
- In rare cases (same page edited on two machines), you may see a conflict message — the fix is always: go to the machine where you last synced, Sync Up from there, then Sync Down on the other

### Disconnecting

If you want to remove the sync connection from one computer (without affecting GitHub or other computers):

1. Go to the **Sync** tab
2. Scroll to the bottom and click **Disconnect sync**
3. Confirm the prompt

Your GitHub repository is not changed. You can reconnect at any time using the wizard.

---

## 16. Troubleshooting

**"command not found: node" when I type `node src/server.js`**

Node.js is not installed, or the terminal can't find it. Download it from [nodejs.org](https://nodejs.org) (LTS version), install it, then close and reopen your terminal.

**"No LLM API key found" error when starting the server**

Your `.env` file is missing or the key is not set correctly. Check:
- The file is named `.env` (not `.env.example` or `.env.txt`)
- It is inside the `the-curator` folder
- The line reads `GEMINI_API_KEY=` followed immediately by your key (no spaces around `=`)

**The server starts but `http://localhost:3333` shows "This site can't be reached"**

The server stopped or crashed. Go back to your terminal and run `node src/server.js` again.

**Ingest spins for a very long time then fails**

- Check your internet connection (the app needs to reach Google's API)
- Check that your Gemini API key is valid at [aistudio.google.com](https://aistudio.google.com)
- Try a smaller file first (under 50 pages) to confirm the setup works

**PDF text comes out garbled or empty**

The PDF is scanned (an image of a page, not real text). Copy the text manually and save it as a `.txt` file instead.

**Pages are not showing up in Obsidian after an ingest**

Press `Cmd/Ctrl + R` in Obsidian to force a refresh, or close and reopen the vault. Obsidian does not always detect new files automatically.

**"Port 3333 is already in use" error**

Another process is using port 3333. Either close that process or change the port in your `.env` file:
```
PORT=4000
```
Then restart the server and go to `http://localhost:4000` instead.

**I closed the terminal — the app stopped working**

That's expected. The server runs in your terminal. Always keep the terminal window open while using the app. To restart: open a new terminal, navigate to the project folder (`cd the-curator`), and run `node src/server.js`.
