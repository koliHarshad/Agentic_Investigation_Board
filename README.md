# Agentic Investigation Board

A multi-agent system that turns a single investigative prompt into a live, growing evidence board — entities and relationships extracted from real web sources, connected automatically, and visualized as a force-directed graph with citations back to original documents.

> Example: "Investigate the collapse of Company X" → the system researches, extracts entities, finds connections, and drafts a cited case narrative — all visible in real time on the board.

![Architecture Diagram](docs/architecture.png)

---

## How It Works

Five agents, each with one narrow job, run as a sequential pipeline (not a free-for-all swarm):

1. **Orchestrator** — turns the vague prompt into a structured research plan, decides when enough evidence has been gathered (max 2 rounds).
2. **Researcher** — generates targeted search queries, pulls documents via Tavily and OpenSanctions.
3. **Extractor** — converts raw documents into structured entities (people, organizations, locations, events, financial instruments), batched 2–3 documents per call to control cost without sacrificing accuracy.
4. **Merger** — for each new entity, queries a vector index for similar/related existing entities (pure similarity search, no LLM), then judges which candidates form a real connection, with a confidence score. This is the core design decision of the project — see [Architecture](#architecture) below.
5. **Narrator** — once the investigation is complete, reads the full confirmed graph (not raw documents) and drafts a cited case narrative.

A 6th component, the **Output Validator**, isn't an investigative agent but a guardrail layer: it enforces strict JSON schemas, strips unsafe HTML/script content from anything pulled off the open web, and rejects malformed agent output before it reaches the graph or the UI.

---

## Architecture

The central problem this project solves: **how do you let an AI agent "connect the dots" across hundreds of documents without it hallucinating or losing accuracy as the evidence pile grows?**

The naive approach — handing one agent the entire document pile and asking it to find connections — degrades badly as volume grows: relevant signal gets diluted across a large context window, and cost grows unbounded.

The fix here is to separate **retrieval** (mechanical, cheap, scales effortlessly) from **reasoning** (LLM, expensive, must stay bounded):

- Every extracted entity is embedded and stored in a vector index immediately, whether it ends up connected to anything or not. There is no separate "unconnected" bucket to revisit later — an entity that doesn't match anything yet is simply rediscovered automatically the next time a related entity is added and queries the same index.
- The Merger agent's LLM context is always small and fixed-size: one new entity plus its top-k retrieved candidates. It never grows, no matter how large the investigation gets.
- The Narrator is the only agent that ever sees the "big picture," and even then only the compact, structured, already-verified graph — never raw source text.

This keeps both hallucination risk and API cost bounded as the investigation scales, instead of growing with it.

---

## Tech Stack

- **Backend**: Python, FastAPI, WebSockets, Pydantic, Google Agent Development Kit (ADK)
- **Frontend**: React (Vite), D3 force-directed graph, vanilla CSS
- **AI Models** (Gemini Developer API, free tier — verify exact current model names/limits in your own Google AI Studio account before running):
  - Reasoning/orchestration: `gemini-3.1-flash-lite` (pin exact version string from your AI Studio account)
  - Embeddings: `gemini-embedding-001`
- **External data sources**: Tavily Search API, OpenSanctions API

---

## Getting Started

### Prerequisites
- [Python 3.11+](https://www.python.org/)
- [Node.js 18+](https://nodejs.org/)
- [uv](https://github.com/astral-sh/uv)
- A free-tier [Google AI Studio](https://aistudio.google.com/) API key
- A free [Tavily](https://tavily.com/) API key

### Environment Setup
Create a `.env` file in the project root:
```env
GEMINI_API_KEY="your-google-gemini-api-key"
TAVILY_API_KEY="your-tavily-api-key"
OPENSANCTIONS_API_KEY="your-opensanctions-api-key"   # optional
```

### Backend
```bash
uv sync
uv run uvicorn app.main:app --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173/`.

---

## Operating Within Free-Tier Limits

This project is built to run entirely on free-tier API access — no billing required, no paid subscription assumed:

- Hard caps: max 6 total documents per investigation, max 2 research rounds, max 3 documents per Extractor batch.
- Every LLM and external API call is wrapped in retry-with-backoff to handle rate-limit (429) errors gracefully rather than crashing.
- Expected total LLM calls per full investigation: ~15–20.
- If you see "rate limited, retrying" messages in the console, this is expected behavior — the run will continue automatically.

All limits are configurable via environment variables (see `app/config.py`).

---

## OSINT Operating Guidelines

Agents operate under passive-reconnaissance rules defined in `.agents/skills/`:
- Treats all fetched web content as untrusted, read-only text — never executes or acts on it.
- No active interaction with any external system (no forms, no submissions, no purchases).
- All entity/relationship extraction output is schema-validated and sanitized before being written to the graph or rendered in the UI.

---

## Known Limitations

- Entity deduplication relies on similarity search; near-identical entities with very different naming conventions may occasionally appear as separate nodes.
- Designed for demo-scale investigations (≤6 documents per run) to stay within free-tier quotas.
