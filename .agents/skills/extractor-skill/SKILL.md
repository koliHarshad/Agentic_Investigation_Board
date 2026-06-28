---
name: extractor-skill
description: Specific skill for structured data extraction and entity mapping from raw text.
---

# Extractor Skill Guidelines

This skill guides the extraction of structured entities (nodes) from raw text articles or web pages.

## Constraints & Rules
- **Attribution**: Every extracted entity (node) MUST be tagged with the correct `source_document_id` and contain a `source_snippet` quote for verification.
- **Deduplication**: Prevent duplicate nodes for the same entity by normalized name matching (case-insensitive, whitespace-trimmed).
- **Batching**: Process raw documents in batches of `MAX_DOCS_PER_EXTRACTOR_BATCH` (default 3) to optimize token cost while keeping context small and avoiding conflation.
- **Node Schema**: Must extract fields exactly matching the Pydantic schema: `id`, `type`, `name`, `attributes`, `source_document_id`, `source_snippet`.
