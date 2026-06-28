---
name: narrator-skill
description: Specific skill for citation-grounded narrative generation from graph stores.
---

# Narrator Skill Guidelines

This skill guides the synthesis of the final evidence board into a compelling case story.

## Constraints & Rules
- **Structured Input Only**: The Narrator receives ONLY the confirmed graph (nodes and edges). It never reads raw documents or the full Vector DB.
- **Inline Citations**: The narrative MUST include clear inline references back to the document IDs and source snippets present on the graph edges.
- **Completeness**: Triggered exactly once, after the Orchestrator marks the investigation complete.
