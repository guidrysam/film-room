# Academy Phase 2D — Canonical Catalog Pipeline

## Result

Phase 2D establishes a scalable boundary between private coaching research and
the published Film Room Academy.

The pipeline now supports:

- private source-item to knowledge-candidate extraction
- deterministic stable IDs and fingerprints
- potential duplicate matching
- provenance merging across supporting sources
- canonical lifecycle and version history
- fail-closed human review, deduplication, and safety gates
- provenance-free public catalog publication
- runtime loading of newly published canonical activities
- unlimited editorial record files and catalog objects

## Current run

- Private source items processed: 565
- Private knowledge candidates created: 565
- Candidates with potential duplicate matches: 46
- Automatically approved objects: 0
- Published source-derived objects: 0

The zero publication count is intentional. Candidate generation never turns
research material into product content without an original Film Room rewrite
and human approval.

## Canonical runtime boundary

Practice recommendation now reads:

1. canonical published activity objects; then
2. the original 15 Film Room seed activity bindings.

Published IDs override matching seed IDs. Practice and game-plan code does not
import PDF extraction, source index, knowledge candidate, or private editorial
data.

## Deduplication policy

Candidate similarity is deterministic and advisory. Human editors decide
whether a candidate is unique or should merge into an existing object.

Publication rejects:

- duplicate canonical IDs
- duplicate published identity fingerprints
- unresolved or unreviewed deduplication decisions
- missing merge targets
- missing review metadata
- unsafe activities
- invalid typed payloads
- missing version history

## Privacy

Private provenance remains in ignored editorial files. Publication recursively
removes source provenance, source IDs, source page references, source candidate
IDs, reviewer identities, warnings, and editorial notes.

The tracked runtime artifact is:

```text
data/academy/catalog-published/catalog.json
```

The private editorial inputs are:

```text
data/academy/knowledge-candidates/
data/academy/catalog-editorial/
```

## Commands

```text
npm run academy:catalog:candidates
npm run academy:catalog:validate
npm run academy:catalog:publish
```

Operational guidance is in `docs/academy-catalog.md`.

## Verification

- Full test suite: 57 passed
- Production build: passed
- Canonical catalog validation: passed
- Canonical publication dry run: passed with zero auto-published objects
- Goal graph validation: passed
- Phase 2D changed-file lint: passed

