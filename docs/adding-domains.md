# Adding Domains

A domain is a focused wiki for one topic area. The easiest way to create, rename, or delete domains is from within the app — no Finder or terminal required.

---

## Using the Domains tab (recommended)

Open the app at `http://localhost:3333` and click the **Domains** tab.

### Create a domain

1. Click **New Domain**
2. Enter a display name (e.g. `Health & Fitness`) — the folder name is generated automatically and shown as a live preview
3. Optionally describe the scope in 1–2 sentences
4. Choose a template that matches your topic:

   | Template | Best for |
   |----------|----------|
   | ⚙️ Tech / AI | Software, AI, research papers, developer tools |
   | 📈 Business / Finance | Startups, investing, markets, strategy |
   | 🌱 Personal Growth | Books, habits, mental models, productivity |
   | 📁 Generic | Any other topic |

5. Click **Create Domain**

The domain appears immediately in all dropdowns and in Obsidian.

### Rename a domain

Click the **pencil icon** on a domain card, enter the new name, and click **Rename**. All wiki pages and conversations are preserved. Obsidian reflects the change instantly.

> If sync is configured, click **Sync Up** after renaming — the rename appears as a delete + add on GitHub.

### Delete a domain

Click the **trash icon** on a domain card, review the confirmation (it shows exact page and conversation counts), then click **Yes, delete permanently**.

> ⚠️ Deletion is permanent. There is no undo.

---

## Manual setup (advanced)

If you prefer to create a domain by hand — for example to customise the CLAUDE.md schema beyond what the templates offer — follow these steps.

### Step 1: Create the directory structure

Replace `my-domain` with a lowercase, hyphenated slug (e.g. `history`, `health-fitness`, `legal`):

```bash
mkdir -p domains/my-domain/raw
mkdir -p domains/my-domain/wiki/entities
mkdir -p domains/my-domain/wiki/concepts
mkdir -p domains/my-domain/wiki/summaries
mkdir -p domains/my-domain/conversations
```

### Step 2: Create the wiki index and log

```bash
cat > domains/my-domain/wiki/index.md << 'EOF'
# Wiki Index — My Domain
Last updated: 2026-04-09

| Page | Type | Summary |
|------|------|---------|
EOF

cat > domains/my-domain/wiki/log.md << 'EOF'
# Ingest Log — My Domain

EOF
```

### Step 3: Write the CLAUDE.md schema

This is the most important file — it tells the AI how to structure knowledge for this domain. Create `domains/my-domain/CLAUDE.md`:

```markdown
# Domain: My Domain

This is a dedicated second brain for [describe the topic].

## Scope
[What topics belong here.]

## Wiki Conventions

### Page Types
- **entities/** — [What counts as an entity in this domain]
- **concepts/** — [What counts as a concept in this domain]
- **summaries/** — One page per ingested source

### Page Format

**Entity page:**
\```
# [Entity Name]
Type: [type options relevant to this domain]
Tags: [comma-separated]

## Summary
One-paragraph description.

## Key Facts
- Bullet facts

## Related
- [[concept-name]] — why related
\```

**Concept page:**
\```
# [Concept Name]
Tags: [comma-separated]

## Definition
Clear, concise definition.

## [Domain-specific section]
[Add a section that makes sense for your domain]

## Related
- [[entity-or-concept]] — why related
\```

**Summary page:**
\```
# [Source Title]
Source: [filename or description]
Date Ingested: [YYYY-MM-DD]
Tags: [comma-separated]

## Key Takeaways
- Bullet list of main points

## Concepts Introduced or Referenced
- [[concept-name]]

## Entities Mentioned
- [[entity-name]]

## Notes
Any additional commentary.
\```

## Cross-Referencing Rules
- Always use [[page-name]] syntax for internal links (without folder prefix).
- When you create or update a summary, update the corresponding entity and
  concept pages to reference it.
- Every entity or concept mentioned in a source gets a new or updated page.

## index.md Format
\```
# Wiki Index — My Domain
Last updated: [YYYY-MM-DD]

| Page | Type | Summary |
|------|------|---------|
| [[page-name]] | concept/entity/summary | One-line description |
\```

## log.md Format
Append one entry per ingest:
\```
## [YYYY-MM-DD] ingest | [Source Title]
Pages created or updated: list them
\```

## Instructions for the AI
When ingesting a source:
1. Write a summary page under summaries/.
2. Create or update entity pages for every [relevant entity type] mentioned.
3. Create or update concept pages for every key idea or technique.
4. Add cross-references between all related pages.
5. Return the full list of pages to create/update as JSON.

When answering a query:
- Cite specific pages using [source: path/to/page.md] format.
- Synthesise across multiple pages rather than quoting verbatim.
```

### Step 4: Verify

The app discovers domains on every request — no restart needed. Open the app and check that your new domain appears in all dropdowns. Ingest a source to confirm the schema works.

---

## Removing and renaming manually

**Remove a domain:**
```bash
rm -rf domains/my-domain
```

**Rename a domain:**
```bash
mv domains/old-name domains/new-name
```

All wiki pages and the domain structure are preserved. Update the `# Domain:` header in `CLAUDE.md` and the `# Wiki Index —` header in `wiki/index.md` to reflect the new name.

---

## Checklist (manual setup only)

- [ ] `domains/<slug>/CLAUDE.md` — schema written with all sections
- [ ] `domains/<slug>/raw/` — directory exists (can be empty)
- [ ] `domains/<slug>/wiki/index.md` — initialised with header and empty table
- [ ] `domains/<slug>/wiki/log.md` — initialised with header
- [ ] `domains/<slug>/wiki/entities/` — directory exists
- [ ] `domains/<slug>/wiki/concepts/` — directory exists
- [ ] `domains/<slug>/wiki/summaries/` — directory exists
- [ ] `domains/<slug>/conversations/` — directory exists
