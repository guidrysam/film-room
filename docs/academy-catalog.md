# Canonical Academy Catalog

The Film Room Academy is a product catalog, not a PDF browser. Private sources
inform editorial work but are never imported by runtime planning code.

## Pipeline

```text
private PDFs
  → private page extraction
  → private source items
  → private knowledge candidates
  → original Film Room canonical drafts
  → deduplication and human review
  → approved records
  → public catalog projection
  → practice and game-plan generation
```

The first four stages are research data. Only the public catalog projection is
runtime product data.

## Storage boundaries

- `docs/academy-sources/` — private source PDFs.
- `data/academy/source-index/` — ignored private extraction data.
- `data/academy/knowledge-candidates/` — ignored private candidate clusters.
- `data/academy/catalog-editorial/` — ignored editorial records containing
  source provenance and internal notes.
- `data/academy/catalog-published/catalog.json` — public, provenance-free
  canonical catalog used by the product.

Private source IDs, page references, candidate IDs, reviewer identities, and
editorial notes are removed during publication.

## Commands

```bash
npm run academy:catalog:candidates
npm run academy:catalog:validate
npm run academy:catalog:publish
```

Candidate generation extracts metadata and potential duplicate relationships.
It does not draft or approve product content. Publication fails closed when
editorial, deduplication, safety, version, or typed payload validation fails.

## Canonical records

Every editorial record has:

- stable descriptive ID
- object type
- monotonic version
- lifecycle status
- original Film Room payload
- private supporting sources
- private candidate and editorial notes
- deduplication decision
- human reviewer metadata
- version history

Supported object types include goals, lessons, activities, drills, warmups,
small-sided and conditioned games, practices, seasonal programs, coaching
cues, common errors, progressions, regressions, assignments, and quizzes.

IDs are allocated once with `createStableCanonicalId` and remain unchanged
across versions. Revisions increment `version` and return the object to review.

## Editorial lifecycle

Coach/editor-facing workflow statuses:

```text
draft
  → needs_coach_review
  → approved
  → published
```

Also supported:

```text
needs_coach_review → rejected
rejected → draft | needs_coach_review
published → approved   # unpublish without deleting
```

Blocked examples: `draft → published`, `needs_coach_review → published`,
`rejected → published`.

Record lifecycle uses `needs_review` internally for `needs_coach_review`.

Approval and publication require:

- human content review
- a human `unique` deduplication decision
- original Film Room wording and diagrams when the payload has editorial
  metadata
- safe safety review for activities
- valid typed payload metadata
- current version represented in version history

AI may help an editor create a draft. It cannot advance lifecycle state.

## Phase 3C package workflow (CLI-only writes)

Admin UI (`/admin/academy`) is read-only. Write actions require:

```bash
export ACADEMY_EDITOR_ACTOR=you@example.com
export ACADEMY_EDITOR_ALLOWLIST=you@example.com
```

Commands:

```bash
npm run academy:editorial:seed
npm run academy:editorial:transition -- --id <id> --to approved
npm run academy:editorial:approve-package
npm run academy:editorial:publish-package
npm run academy:editorial:unpublish-package
```

Package policy:

1. Approve each object independently (or approve the whole package).
2. Publish through one explicit package action.
3. Before publish, every required dependency must be valid and approved.
4. Publication rewrites `catalog-published/catalog.json` atomically and appends
   immutable audit entries to `catalog-editorial/audit.jsonl`.
5. Unpublish returns members to `approved` and removes them from Team Academy
   without deleting editorial records.

Team Academy reads only the published catalog. Draft, review, rejected, source,
and provenance data never appear there.

## Deduplication

Knowledge candidates receive deterministic identity fingerprints. Similarity
uses normalized titles, coaching themes, equipment, player ranges, and
durations to produce editorial suggestions. These are suggestions—not
automatic merge decisions.

Published objects cannot share an identity fingerprint. Equivalent source
ideas should merge their private provenance into one canonical record using
`mergeCanonicalProvenance`.

## Runtime generation

`lib/academy/published-catalog.ts` projects published activities into the
runtime recommendation metadata. The original 15 Film Room activities remain
the canonical seed crosswalk; newly published activities override matching seed
IDs and expand the catalog without changing practice-generation logic.

Runtime recommendation and planning modules import canonical activity metadata.
They never load source registries, extracted text, editorial candidates, or
PDFs.

