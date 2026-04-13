# Domain: Personal

This is a dedicated second brain for personal topics.

## Scope
So my personal affairs, shopping lists, notes, card registrations, insurances, whatever I need to remember, I can add here.

## Wiki Conventions

### Page Types
- **entities/** — One page per notable person, item, tool, or organization related to this domain.
- **concepts/** — One page per idea, technique, or framework concept.
- **summaries/** — One page per ingested source (e.g., `summaries/article-title.md`).

### Page Format

**Entity page:**
```
# [Entity Name]
Type: person | item | organization
Tags: [comma-separated]

## Summary
One-paragraph description.

## Key Points
- Bullet facts

## Related
- [[concept-name]] — why related
- [[other-entity]] — why related
```

**Concept page:**
```
# [Concept Name]
Tags: [comma-separated]

## Definition
Clear, concise definition.

## Overview
Detailed explanation with context.

## Examples
- Example 1
- Example 2

## Related
- [[entity-or-concept]] — why related
```

**Summary page:**
```
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
```

## Cross-Referencing Rules
- Always use `[[page-name]]` syntax for internal links (without the folder prefix).
- When you create or update a summary, update the corresponding entity and concept pages to reference it.
- Every entity or concept mentioned in a source gets either a new page or an update to an existing page.

## index.md Format
```
# Wiki Index — Personal
Last updated: [YYYY-MM-DD]

| Page | Type | Summary |
|------|------|---------|
| [[page-name]] | concept/entity/summary | One-line description |
```

## log.md Format
Append one entry per ingest:
```
## [YYYY-MM-DD] ingest | [Source Title]
Pages created or updated: list them
```

## Instructions for the AI
When ingesting a source:
1. Write a summary page under `summaries/`.
2. Create or update entity pages for every person, item, or organization mentioned.
3. Create or update concept pages for every key idea, framework, or technique.
4. Add cross-references between all related pages.
5. Return the full list of pages to create/update as JSON.

When answering a query:
- Cite specific pages using `[source: path/to/page.md]`.
- Synthesize across multiple pages rather than quoting verbatim.
