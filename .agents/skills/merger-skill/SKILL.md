---
name: merger-skill
description: Specific skill for similarity-based node merging and relation verification.
---

# Merger Skill Guidelines

This skill guides the judgment of connections (edges) between newly extracted entities and candidate entities on the board.

## Constraints & Rules
- **Vector Search First**: Before calling the Merger LLM, query the Vector DB for the top `MAX_MERGER_CANDIDATES_K` (default 5) most similar nodes. This is a mechanical similarity search, never an LLM call.
- **Bounded Context**: The Merger LLM call must receive ONLY: the new node, the k retrieved candidates, and the candidates' immediate existing edges. It must never receive the full Graph.
- **Confirmation Threshold**: Only confirm connections with a confidence score of `0.6` or higher. Flag lower confidence connections.
