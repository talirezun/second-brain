# Use Cases

The Curator is domain-agnostic — it applies the same Atomic Decomposition and network-compounding
pattern to any field where knowledge accumulates over time. Below are detailed workflows for the
primary use cases.

---

## A. Content Creators (Writers, Podcasters, YouTubers)

**The Problem:** Creators consume hundreds of articles, books, and podcasts, but face a blank
page when it's time to create. They struggle to recall specific anecdotes and struggle to
synthesise across everything they've consumed.

**The Workflow:**
1. Ingest all research material into The Curator (articles, book summaries, podcast notes)
2. When outlining new content, open the Obsidian graph and identify the largest Concept nodes —
   these are the themes you naturally gravitate toward
3. Click any Entity node to see every source you've ingested that mentions it
4. Query the chat: *"Summarise everything I know about [topic]"* for a cited briefing

**The Result:** Passive consumption becomes a content assembly line. A fully cited script or
article outline in minutes rather than hours.

---

## B. Researchers & Academics

**The Problem:** Researchers drown in 50-page PDFs. Standard RAG systems lose the big picture
because they only retrieve isolated text chunks. Subtle synthesis questions require manually
re-reading across five documents.

**The Workflow:**
1. Batch-upload 20+ PDFs on a research topic
2. The Curator extracts all distinct methodologies (Concepts) and authors/institutions (Entities)
3. Use the Obsidian graph's visual "Idea Collisions" to identify intersections between concepts
   that no existing paper has addressed
4. Query: *"What methodologies are linked to [concept] but haven't been applied to [domain]?"*

**The Result:** A synthesised view across the entire literature corpus, with source citations.
Content gaps and new research hypotheses emerge visually from the graph.

---

## C. Executives & Strategists

**The Problem:** Executives need to track competitors, market trends, and meeting transcripts,
but this data is scattered across formats. Crucial insights get lost. Recency bias means
the most recent input dominates over older (often more reliable) signals.

**The Workflow:**
1. Upload quarterly reports, competitor analyses, meeting transcripts
2. Enable "Node Size → Linked Mentions" in Obsidian — the most-referenced concepts grow largest,
   creating a visual heat map of your intelligence
3. Query: *"Synthesise the main friction points from the last 20 customer interviews"*

**The Result:** An objective intelligence layer. The Curator weighs a transcript from yesterday
equally with one from six months ago, surfacing the true signal across the full dataset.

---

## D. Software Architects & Development Teams

**The Problem:** Technical documentation dies the moment it is written. Architecture Decision
Records, API specs, and post-mortems get lost in Jira, GitHub, or Confluence. New developers
take months to understand *why* the codebase is built the way it is.

**The Workflow:**
1. Ingest all ADRs, post-mortems, API specs, and README files
2. The Curator builds an Entity graph of microservices, databases, and tools — and a Concept
   graph of design patterns, security protocols, and failure modes
3. New hires query: *"Why did we choose Postgres over MongoDB for the auth service?"*

**The Result:** A conversational Senior Engineer that never leaves. Context and decisions from
years ago are instantly accessible with source citations.

---

## E. Medical & Scientific Researchers

**The Problem:** Scientific knowledge is siloed in dense PDFs. Researchers tracking a specific
disease or compound suffer from context fragmentation — the paper explaining *why* compound X
interacts with protein Y is buried in a folder that hasn't been opened in two years.
Traditional search only finds exact keywords, missing conceptual links.

**The Workflow:**
1. Ingest clinical trial PDFs and academic papers
2. The Curator extracts Entities (genes, proteins, drugs, compounds) and Concepts
   (pathways, methodologies, biomarkers)
3. Query: *"What compounds target BCR-ABL and have clinical results in leukemia?"*

**The Result:** A dynamic biological knowledge graph. The graph reveals hidden intersections —
a compound used in one domain showing efficacy in a completely different study — by visually
bridging entity nodes across the entire literature corpus.

---

## F. Entrepreneurs & Startup Founders

**The Problem:** Founders are bombarded with disparate information: customer interview
transcripts, competitor reports, legal documents, and strategic frameworks. Critical insights
get lost in the noise, leading to repeated mistakes or missed market opportunities.

**The Workflow:**
1. Feed the app customer interviews, investor updates, and market research
2. Look at the graph for Concept clusters forming around recurring themes (e.g. "Onboarding Friction")
3. Query: *"Synthesise the main friction points from the last 20 customer interviews"*

**The Result:** An external "Board of Advisors" built from your own collected intelligence.
Strategic decisions grounded in your full research history, not the last thing you read.

---

## G. Personal Growth & Self-Analysis

**The Problem:** People consume endless self-help content and write journal entries, but rarely
synthesise across it to notice their own behavioral loops. Everything is captured; nothing is
connected.

**The Workflow:**
1. Ingest daily journal entries, book highlights, therapy notes, and podcast summaries
2. The Curator extracts Entities (people, situations, environments) and Concepts
   (anxiety triggers, flow states, core values)
3. Query: *"What recurring themes appear on days where I log high stress?"*

**The Result:** A mirror into your own psychology. The Curator connects dots across months of
journaling with the objectivity of a third party, revealing patterns invisible to the person
living them.

---

## H. Conversation Compounding (v2.5.0+)

Every use case above starts from a *document* — a PDF, an article, a paper. But knowledge also gets created in the act of thinking. The Chat tab is where you brainstorm with the AI, work through a problem, or process notes out loud. Until v2.5.0 those conversations stayed in the chat history and never made it into the wiki. Now they do.

The **Compile to Wiki** button on any chat conversation extracts what was learned — facts, conclusions, new concepts, connections to existing entities — and writes it as wiki pages: a summary plus any new entities/concepts that emerged. The same merge pipeline that handles ingest runs here, so existing entity pages get updated rather than duplicated.

### Concrete examples

- **Decision record after a brainstorm.** "Help me think through whether to switch from Postgres to DuckDB for analytics." Several turns of back-and-forth, then click Compile → a `summaries/postgres-vs-duckdb-decision-2026-04-25-<hash>.md` page captures the conclusion, with `[[postgres]]` and `[[duckdb]]` entity pages updated to reference the new comparison summary.
- **Meeting / dictation processing.** Paste raw meeting notes into the chat: "Here's what we discussed about the Q3 roadmap…" Ask the AI to structure it. Click Compile → a clean summary lands in the wiki, with the entities mentioned (people, projects, dates) cross-linked.
- **Research synthesis.** "Summarise everything I know about RAG and tell me which gaps are biggest in my notes." After the conversation, Compile → the synthesis becomes a permanent wiki page you can revisit instead of re-deriving every time.
- **Content drafting.** Talk through an article outline with the AI. Compile → the outline (and any new concepts you defined during the chat) join the wiki and seed your next writing session.

### How it differs from ingest

| Aspect | Ingest | Compile |
|---|---|---|
| Source | A document on disk | A live conversation |
| Trigger | Drop a file in the Ingest tab | "Compile to Wiki" button in the Chat tab |
| What gets written | Summary + entities + concepts | Same — uses the same write pipeline |
| Re-running | Re-ingests merge new info into existing pages | Refused if the conversation hasn't changed (prevents bullet inflation) |
| Cost | One LLM call per ingest | One LLM call per compile |

### Tip

The conversation isn't deleted when you compile — it stays in the Chat sidebar. So you can keep the brainstorm thread alive, send another message, and compile again later when you've made more progress. The new turn changes the conversation hash, so a fresh summary file is created alongside the previous one — both are kept.

---

## Shared Pattern Across All Use Cases

Every use case above shares the same underlying mechanics:

1. **Ingestion & Atomization** — large documents are decomposed into discrete Entity and Concept pages
2. **Node Generation** — discrete markdown files are created for every major Concept and Entity
3. **Edge Creation** — the AI automatically inserts bidirectional `[[links]]` between related pages
4. **Network Compounding** — subsequent ingests update existing pages rather than duplicating them;
   a second article mentioning Andrej Karpathy adds to his existing page, increasing its graph weight
5. **Contextual Provenance** — every chat answer cites the exact wiki page it came from,
   allowing you to trace any synthesised claim back to its source

The result is always the same: a private neural network of your knowledge domain that grows
smarter with every source you add.
