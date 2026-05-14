# The Curator — Shared Brain Design

**Target version:** 3.0.0
**Status:** Phase 1 complete (Open Questions resolved, ready for Phase 2 implementation)
**Original spec:** `FEATURE-shared-brain.md` (Google Drive, author Dr. Tali Režun, 2026-05-13 v2)
**Resolutions agreed:** 2026-05-14, this conversation
**Roadmap stage:** Phase 0 ✅ (v2.6.0 Sync UX) → **Phase 1 ✅** (this doc) → Phase 2 ⏳ → Phase 3 ⏳ → Phase 4 ⏳ → Phase 5 ⏳ → Phase 6 ⏳

This document is the engineering source-of-truth for the Shared Brain feature. The original concept spec (`FEATURE-shared-brain.md`) is the input; this document is the binding output of Phase 1 — the architectural decisions Phase 2 implementation must follow.

---

## 1. What This Is

The Curator is a sovereign, local personal second brain. The Shared Brain feature adds a **collective layer**: individual Curator instances can opt in to contributing selected domains to a Shared Brain — a collective wiki stored in organisation-controlled storage (GitHub repo or Cloudflare R2 bucket), enriched by each contributor's local LLM, and accessible to all participants as a first-class local Curator domain.

**Primary use cases** (cohort-agnostic naming — no proper noun chosen at runtime, the UI presents whatever label the user gives a connection):
1. Educational cohort — twenty students each running their own Curator, each contributing a `work` domain to the collective.
2. Enterprise knowledge management — employees with personal Curator domains, one `work` domain opted into the company brain.
3. Research team — small group of researchers, shared `research` domain compounding everyone's reading.

**Why an LLM is required, and where it runs.** Mechanical file merge produces a bigger wiki. LLM synthesis produces a *better* wiki — resolving conflicting formulations, eliminating broken cross-fellow wikilinks, enriching sparse pages, attributing provenance. The LLM runs **locally on each contributor's machine** (using the Gemini Flash Lite key they already have configured for ingest), pre-processing their changed pages into compact `DeltaSummary` objects before pushing. The collective brain receives structured knowledge summaries — not raw wiki files.

---

## 2. Architecture Summary

```
Layer 1 — Individual Curator instances (local, sovereign)
  Fellow A          Fellow B          Fellow N
  ├ personal/       ├ personal/       ...
  ├ work/ ──────┐   ├ work/ ──────┐
  └ shared-X/ ◄─┼───┼──────────────┼──┐
       (pulled, │   └ shared-X/ ◄──┤  │
        local)  │        (pulled,  │  │
                │         local)   │  │
                ▼                  ▼  │
                push DeltaSummaries   │
                                      │ pull full
Layer 2 — Shared Brain Storage        │ snapshot
  SharedBrainStorageAdapter (interface)
       │
       ├─► GitHubStorageAdapter (private repo via REST API, SHA-based concurrency)
       └─► CloudflareR2Adapter (HTTP client → Worker → R2 bucket)
       
  Storage layout:
    collective/<domain>/wiki/entities/*.md
    collective/<domain>/wiki/concepts/*.md
    collective/<domain>/wiki/summaries/*.md
    collective/<domain>/wiki/index.md, log.md
    contributions/<fellow_id>/<submission_id>.json
    digests/<fellow_id>/latest.json
    state/last-synthesis.json
```

**Data flow — push:** User clicks "Push contributions" → diff against last_push_at → local LLM pre-processes each changed page into a DeltaSummary → array of summaries written as one contribution payload to storage.

**Data flow — pull:** User clicks "Pull updates" → lists all pages in `collective/<domain>/wiki/` → for each: `resolveInsideBase()` security check, then `writePage(shared-<X>, path, content)` → re-uses the existing ingest write pipeline (merge, dedup, frontmatter, backlinks, all automatic).

**Data flow — synthesis:** Triggered weekly or on admin demand → loads unprocessed contributions → groups deltas by page → applies merge rules (union of new_facts, link union/intersection, LLM only for detected contradictions, append Provenance) → writes enriched pages back to `collective/`.

---

## 3. Phase 1 Decision Record

Each entry: **the decision** + **why it was chosen** + **what Phase 2 must implement**.

### Decision 1 — PAT security model (was OQ 0.1)

**Decision: Per-fellow fine-grained PAT with repo-level write access. No path-level scoping in v1.**

**Why:** Fine-grained PATs as of early 2026 scope to a repository and a permission category — they do NOT scope to a path within a repo. The spec's Option C (per-fellow path scoping via PAT) is therefore not implementable with PAT mechanics alone; it requires branch protection (paid plan) plus a synthesis bot, or a GitHub App with installation tokens. Both add infrastructure that's wrong for v1.

Per-fellow fine-grained PATs give the one critical security property — *per-fellow revocation* — without any new infrastructure. Compromise of one PAT lets that attacker corrupt the collective repo, but: (a) the org can revoke that single PAT independently, (b) git history is fully preserved for rollback, (c) this matches the realistic non-adversarial threat model (carelessness, not targeted attack).

**Branch protection mode + GitHub App mode are explicitly deferred** to v3.1 (high-security mode) and v3.2 (enterprise) respectively. Documented as a future roadmap item.

**Phase 2 implementation:**
- `GitHubStorageAdapter._apiPut()` writes all targets to the configured `branch` (default `main`). No `writeToBranch` flag in v1.
- Wizard Step 2a (GitHub flow) instructs the user to create a **fine-grained PAT** (not classic) with **Contents: Read and Write** + **Metadata: Read** for the single shared-brain repo only. Show a deep-link to the correct GitHub token creation page with these scopes pre-selected.
- Wizard security note adds: *"If you lose this token or leave the organisation, ask your admin to revoke it from GitHub Settings → Developer Settings → Fine-grained Personal Access Tokens."*
- Spec Part 10 invariant 7 ("Minimum-scope PAT advisory") wording updated to match.

### Decision 2 — Cross-domain link contamination (was OQ 0.2)

**Decision: Option D — strict domain-link filtering at delta-generation time.**

**Why:** Deterministic, requires no coordination, no central state. Cross-domain references survive in prose (as `new_facts` / `stable_facts` bullet text); only the *graph edge* is dropped. Synthesis can later re-link if the same entity becomes a collective page.

**Phase 2 implementation:**
- `filterToDomainLinks(links, domainPageSlugs)` in `src/brain/sharedbrain-delta.js` becomes a hard filter (not the "conservative pass-all" placeholder in the spec).
- Builds a Set from `getAllPagePaths(wikiDir)`, intersects `new_links` and `removed_links` against it.
- Slug normalisation matches `writePage` Pass B (hyphen-normalised lookup) so `[[Tali Rezun]]` resolving to `entities/tali-rezun.md` works correctly.
- The LLM prompt in `buildDeltaPrompt()` adds the explicit instruction: *"new_links must only contain slugs that exist on disk in the same domain as this page."* Belt-and-braces — the filter still runs as a safety net.

### Decision 3 — LLM pre-processing failure handling (was OQ 0.3)

**Decision: Option D — partial push, with explicit `pending_retry` state.**

**Why:** A student hitting a Gemini quota mid-week should not block their whole cohort contribution. Partial push delivers what worked; failed pages retry next cycle. The retry must be tracked explicitly (not just left to mtime) so a permanently-failing page doesn't get silently lost.

**Phase 2 implementation:**
- `.sharedbrain-config.json` connection schema gains:
  - `last_push_at: ISO timestamp` (set BEFORE push starts, on every successful or partial push)
  - `pending_retry: { [pagePath: string]: number }` (path → attempt count)
- `findChangedPages(wikiDir, sinceDate, pendingRetry)` returns the union of (mtime > sinceDate) ∪ (paths in pendingRetry).
- After push: `pending_retry` rewritten with this round's failures (with incremented counts).
- A page that fails 3 consecutive times is moved to `permanent_skip: [pagePath]` and surfaced in the UI's connection card as: *"⚠️ 2 pages skipped after repeated failures. Review and re-edit, then they'll retry."*
- User-visible push result: `"Pushed 7 of 10 pages. 3 will retry next time."` (rendered by SSE `done` event).
- The Curator already has the LLM fallback chain (v2.4.0) — this layer sits *above* it. LLM-not-found errors are caught by the chain; this retry layer handles parse failures and quota errors.

### Decision 4 — Conflict resolution (was OQ 0.4)

**Decision: Option B — union merge by default; targeted LLM call only for heuristic-flagged contradictions. Unresolved contradictions marked with a Health-scannable marker.**

**Why:** Most contributions don't conflict — same fact stated differently is the main "conflict" case, and that's resolved by exact-string dedup or near-duplicate dedup. Genuine value-conflicts ("coined in 2024" vs "coined in 2023") are rare. Invoking the LLM only when needed keeps synthesis cost proportional to disagreement, not corpus size.

**Heuristic for contradiction candidates (no LLM call):**

```
For each pair (a, b) of incoming new_facts on the same page:
  - Normalise: lowercase, strip punctuation, drop stop-words (configurable list)
  - Tokenise into word sets
  - similarity = |A ∩ B| / |A ∪ B|   (Jaccard)
  - similarity == 1.0          → exact duplicate, drop one
  - 0.5 ≤ similarity < 1.0     → flag as candidate contradiction (goes to LLM)
  - similarity < 0.5           → independent facts, keep both
```

**Markup for unresolved contradictions** (when LLM picks `both`):

```markdown
- ⚠️ CONFLICTING SOURCES — review needed:
  - Context Engineering coined in 2024 *(per fellow-a3f9)*
  - Context Engineering coined in 2023 *(per fellow-b7c1)*
```

**Phase 2 implementation:**
- Pure-JS `jaccardSimilarity(textA, textB)` helper (~20 LOC) in shared synthesis utilities. No NLP libraries — built-in `Intl.Segmenter` for tokenisation, hard-coded English stop-word list (configurable later).
- `mergeFactsForPage(pageFacts: DeltaSummary[])` returns `{ unified: string[], contradictions: [[string, string]] }`.
- The targeted LLM prompt is the spec's Rule 3 prompt verbatim — inputs are just the two conflicting strings + page title. ~100 tokens in, ~100 tokens out per pair.
- Health scanner gains a new issue type `conflictingSources`: regex `/^- ⚠️ CONFLICTING SOURCES — review needed:/m`. Detected via the existing `scanWiki()` chain. New fix handler `fixConflictingSources(wikiDir, issue)` lets the user pick a resolution interactively.
- The markup uses `*(per fellow-X)*` italic — chosen because it survives obsidian rendering, doesn't trigger wikilink parsing, and is scannable by regex.

### Decision 5 — Domain isolation (was OQ 0.6)

**Decision: Option A — strict siloing. No symlinks. Pulled collective brain appears as its own sibling domain `domains/shared-<slug>/`.**

**Why:** Symlinks introduce two unknowns we don't want in a v1 write surface: (1) Obsidian's symlink graph traversal behaviour varies across plugin updates and macOS versions, (2) `resolveInsideBase()` in `mcp/storage/local.js` currently uses `path.resolve()` which follows symlinks — would need a careful audit to confirm we don't enable a path-traversal escape via a maliciously-crafted symlink in a shared brain. Strict siloing has none of these unknowns.

The user-visible cost is real but bounded: Obsidian shows two disconnected sub-graphs (personal vs. collective). The MCP `search_cross_domain` tool already provides the cross-graph reasoning surface from Claude — this *is* the right answer for cross-domain questions. Documented in the user guide as an intentional architectural choice.

**Phase 2 implementation:**
- `pullCollective()` writes to `domains/shared-<conn.shared_brain_slug>/wiki/`. The slug name is derived from the connection's `shared_brain_slug` field (set in the wizard, defaults to a slugified version of the connection label).
- `ensureSharedDomainExists()` creates `domains/shared-<slug>/CLAUDE.md` with a schema header that says: *"This domain is the local mirror of a shared brain. Do not manually ingest files here; use the Sync tab → Pull updates."*
- The CLAUDE.md frontmatter adds `readonly: true` — see Decision 7 below.
- v3.1 follow-up (optional, not committed): explore `[[shared:X:slug]]` syntax for explicit cross-domain links if user demand emerges.

### Decision 6 — GDPR / Data handling (was OQ 0.8)

**Decision: Privacy-first defaults with explicit two-flag opt-in for name attribution; mandatory admin-only revoke endpoint; configurable IP modes; EU residency documented as a deployment caveat.**

#### 6a. Provenance attribution — UUIDs default

The `## Provenance` section uses `fellow_id` (UUID) by default. Real names appear ONLY when both flags are set:
- Org admin sets `allow_name_attribution: true` in the shared brain's admin config (stored in shared storage, not local)
- The individual contributor sets `attribute_by_name: true` in their local `.sharedbrain-config.json`

Either flag missing → UUID. This is a defensive double-gate — neither side can unilaterally surface someone's name.

Rendered Provenance:

```markdown
## Provenance
<!-- DO NOT EDIT — auto-generated by Shared Brain synthesis -->
- Last synthesized: 2026-05-14T02:00:00Z
- Contributors: a3f9, b7c1, c2e5
```

vs. with both flags on:

```markdown
- Contributors: Dr. Tali Režun (a3f9), Bridget Carlton (b7c1), c2e5
```

(Contributor c2e5 had `attribute_by_name: false`; even though the org allows names, this contributor still shows as UUID.)

#### 6b. Right to erasure (Article 17)

Mandatory v1 mechanism:
- New endpoint **`POST /api/sharedbrain/:id/revoke`** — requires the connection's `admin_token` (which only the org admin holds).
- Body: `{ fellow_id: "<uuid>", confirmation: "REVOKE-<fellow_id>" }` (the confirmation string is a typed-in safety gate, like GitHub's repo-delete confirmation).
- Operations:
  1. Delete all `contributions/<fellow_id>/**.json` from storage
  2. Delete `digests/<fellow_id>/latest.json`
  3. Trigger re-synthesis with a `revoke` flag — walks every collective page, finds `<!-- @fellow-id -->` provenance markers, regenerates pages from remaining contributions only. Pages with no remaining contributions are deleted.
  4. Append an audit entry to `state/revocations.jsonl` (admin-readable, no PII in the audit beyond the UUID and timestamp).
- **Operation is irreversible.** Documented prominently in the admin docs. Once `revoke` runs, the contributor's content cannot be reconstructed from the collective storage — only restored from the contributor's own local wiki (which never left their machine in the first place).

#### 6c. Enterprise IP modes

New field `data_handling_terms` in the shared brain's admin config:
- `"contributor_retains"` (default) — contributors retain copyright of their original wiki pages; the organisation owns the synthesised collective output. Suitable for educational cohorts.
- `"organisational"` — explicit copyright transfer at contribution time. The wizard's consent checkbox text is rewritten accordingly to make the transfer explicit. Used by enterprise deployments where employee contracts cover IP transfer.

The consent checkbox in wizard Step 4 reads (for `contributor_retains`):
> *"I consent to contributing my opted-in domain pages to this Shared Brain. I retain copyright in my original content. I understand the synthesised collective output is owned by the organisation."*

vs. (for `organisational`):
> *"I consent to contributing my opted-in domain pages to this Shared Brain. By contributing, I assign copyright in the contributed content to the organisation per my employment agreement."*

#### 6d. EU data residency

Two adapter paths, two different stories:
- **Cloudflare R2** — supports per-bucket jurisdiction tagging. The Worker setup docs specify the Wrangler `[[r2_buckets]]` config with `jurisdiction = "eu"` for EU compliance. This is the recommended path for EU-based deployments.
- **GitHub** — repository data location is determined by the org's plan. GitHub Free / Pro / Team store data in the US. **GitHub Enterprise Cloud with the EU data residency option** is required for EU compliance. Stated explicitly in the deployment guide, not obscured.

#### 6e. Deliverable

A new doc **`docs/shared-brain-compliance.md`** (~1 page) is mandatory for v3.0 GA. Covers:
- What PII is stored, where (table format)
- The Article 17 mechanism (technical + admin procedure)
- The two `data_handling_terms` modes and their consent language
- The EU residency caveats for each adapter
- A "Self-assessment" checklist for orgs evaluating deployment

Phase 2 implementation owns this doc.

### Decision 7 — MCP write-tool guard on shared-* domains (new — small but critical)

**Decision: MCP write tools (`compile_to_wiki`, `fix_wiki_issue`, etc.) refuse to write to domains where the `CLAUDE.md` frontmatter declares `readonly: true`. Contributions to a Shared Brain flow through the user's personal opted-in domain, not direct writes to the mirror.**

**Why:** Without this guard, Claude (via MCP) could compile findings directly into `domains/shared-X/`. Those writes would (a) not propagate to other contributors (no push path from a mirror domain) and (b) be silently overwritten on next pull. The contribution model only works if writes originate from the personal opted-in domain.

This is the *one* MCP code change required for Shared Brain MVP. No multi-vault work, no new tools.

**Phase 2 implementation:**
- `ensureSharedDomainExists()` writes `domains/shared-<slug>/CLAUDE.md` with frontmatter including `readonly: true`.
- New tiny helper `isDomainReadonly(domain)` in `mcp/storage/local.js` — reads frontmatter, returns boolean. Cached.
- Each MCP write tool (`compile_to_wiki`, `fix_wiki_issue`, `scan_semantic_duplicates` merge path, `dismiss_wiki_issue`) calls `isDomainReadonly()` at the top and returns a structured error if true: *"Domain '{name}' is a read-only Shared Brain mirror. To contribute, use compile_to_wiki on your personal opted-in domain (e.g. 'work-ai'); then run 'Push contributions' from the Sync tab."*
- The Claude skill (`claude-skills/my-curator/SKILL.md`) gains a new section "Working with Shared Brain mirrors" that explains the read/write contract from Claude's perspective.

### Deferred (no decision needed for v1)

| OQ | Topic | Resolution |
|---|---|---|
| 0.5 | Deletion propagation | **Defer to v3.1.** Zombie pages will accumulate; Health's orphan-detection surfaces them. Documented as a known limitation in `docs/shared-brain.md`. |
| 0.7 | Corpus scale ceiling | **Defer.** For cohort-scale (≤500 pages), no special handling. The scale tier table from the spec's Appendix C is documented for future reference. |
| 0.9 | Worker vs Node code sharing | **Defer to v3.1.** Phase 2 ships the GitHub adapter only; the Cloudflare Worker / R2 adapter is v3.1. When we build it, we'll write the synthesis pipeline in dependency-free JS that bundles cleanly for both targets. |

---

## 4. Phase 2 Implementation Plan

**Branching strategy (refined 2026-05-14):** Phase 2 work is committed on the active worktree branch and **held locally between milestones** (2A → 2E). One combined push lands at the end of Phase 2 — when push/pull/synthesis works end-to-end — paired with a single version bump. This avoids triggering an "update available" prompt for every internal milestone (the auto-updater checks commit SHA, not just version, so even invisible-to-user commits would fire the prompt). The feature flag (`sharedBrainEnabled`, default `false`) is the in-code isolation: even after merge, existing users see zero behaviour change until they opt in.

The rhythm in practice:
1. **Within a phase** — commits accumulate on the worktree branch, each tested locally on this machine. Battle-test scripts run after each milestone.
2. **End of a phase** — fast-forward local `main` to the worktree, bump `package.json` (e.g. `v2.6.0` → `v2.7.0` at end of Phase 2), commit the version bump, push to `origin/main` as one update event.
3. **Existing users** — see a clean version bump in the Settings tab with a meaningful changelog, not commit-SHA-only nag prompts.

**Feature flag:** `.curator-config.json` gains `sharedBrain.enabled: boolean` (default `false`). Routes register but return 404 when flag is off; UI section renders a CTA "Try Shared Brain (beta)" instead of the full wizard. Circuit breaker if a critical bug ships — a v3.x.x hotfix can globally force the flag off. Existing users updating to a Shared Brain milestone with the flag off see ZERO behaviour change.

**Release channel (deferred to Phase 6):** `.curator-config.json` gains `releaseChannel: "stable" | "beta"` (default `"stable"`) — but only when there's an actual divergence between channels to honour. Until v3.0.0 GA, the feature flag does the same job. Implement when needed, not before.

**Files to create (in dependency order, all new — no existing-file modifications except where flagged):**

```
src/brain/sharedbrain-storage.js              Storage adapter interface contract
src/brain/sharedbrain-local-adapter.js        LocalFolderStorageAdapter (NEW vs. spec — for battle-testing)
src/brain/sharedbrain-github-adapter.js       GitHub REST API adapter
src/brain/sharedbrain-storage-factory.js      Factory; dispatches by storage_type
src/brain/sharedbrain-delta.js                Local LLM pre-processing; Jaccard helper
src/brain/sharedbrain-synthesis.js            Synthesis pipeline (local execution; GitHub mode only in v3.0)
src/brain/sharedbrain-config.js               .sharedbrain-config.json read/write
src/brain/sharedbrain.js                      push/pull/runLocalSynthesis orchestration

src/routes/sharedbrain.js                     /api/sharedbrain/* endpoints (SSE for push/pull)
                                              + /revoke endpoint (admin-only)

src/public/index.html                         Sync tab gains "Shared Brains" block below Personal Sync
src/public/app.js                             Wizard + connection-card UI handlers
src/public/styles.css                         New .sharedbrain-* classes

mcp/storage/local.js                          MODIFIED: add isDomainReadonly() helper
mcp/tools/*.js                                MODIFIED: write tools check readonly, refuse with clear error

claude-skills/my-curator/SKILL.md             MODIFIED: new "Working with Shared Brain mirrors" section

docs/shared-brain.md                          User-facing guide
docs/shared-brain-compliance.md               GDPR / IP / residency reference (Decision 6e)
docs/shared-brain-admin.md                    Admin operations: setup, revoke, synthesis
```

**Phase 2 milestones:**

| Milestone | Deliverable | Battle-test |
|---|---|---|
| 2A | Storage interface + LocalFolderStorageAdapter + sharedbrain-config | Node script: 3-instance simulation on this machine via `DOMAINS_PATH=` env, all using a shared `/tmp/sharedbrain-test/` storage folder |
| 2B | Delta module (incl. Jaccard) + push orchestration | Same 3-instance setup: each ingests sources, pushes contributions; verify DeltaSummaries appear in storage with correct schema |
| 2C | Synthesis pipeline + pull orchestration | Run synthesis on the 3-instance contributions; verify each instance pulls and sees the synthesized collective brain as `shared-test/` domain; MCP `list_domains` includes it |
| 2D | Path-traversal + readonly guard | Craft a malicious contribution with `path: "../../etc/passwd"` and `path: "../../../sensitive.md"`. Confirm `resolveInsideBase()` blocks it. Confirm MCP write tools refuse on `shared-test/`. |
| 2E | Conflict scenarios | Two instances contribute contradictory facts; verify Jaccard heuristic detects it, LLM call resolves, marker appears on unresolved pairs, Health scanner surfaces the marker. |

Each milestone gets a tagged commit on `feature/shared-brain`. No GitHub push until Phase 6.

---

## 5. Source-of-Truth Map

| Document | Purpose | Mutability |
|---|---|---|
| `FEATURE-shared-brain.md` (Google Drive) | Original concept spec, author Dr. Tali Režun | Frozen — input to this design doc |
| `docs/shared-brain-design.md` (this doc) | Engineering source-of-truth — decisions binding on Phase 2 implementation | Append-only between phases. Edited only with explicit user agreement on a decision change. |
| `docs/shared-brain.md` (Phase 2 deliverable) | User-facing guide — written when v3.0 ships | Lives forever, updated each release |
| `docs/shared-brain-compliance.md` (Phase 2 deliverable) | GDPR / IP / residency reference for orgs | Lives forever |
| `docs/shared-brain-admin.md` (Phase 2 deliverable) | Admin operations — setup, revoke, synthesis ops | Lives forever |
| `CLAUDE.md` | Per-version history entries | Append-only on each version bump |

**Handoff convention:** Future agents picking up Shared Brain work read this design doc + the spec, in that order. Any decision documented here is binding unless explicitly overturned with user agreement in a follow-up section "Decision Revisions" (TBD).
