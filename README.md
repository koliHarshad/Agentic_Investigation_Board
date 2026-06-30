# Agentic Investigation Board

An autonomous, multi-agent intelligence mapping and correlation engine. Built with the **Google Agent Development Kit (ADK)** and React to perform passive OSINT reconnaissance, identify key entities, correlate hidden relationships on a visual canvas, and draft legal-grade case narratives.

---

## Key Features

1.  **Multi-Agent Pipeline**:
    *   **Orchestrator Agent**: Directs investigations by defining planning objectives and determining complete/research status.
    *   **Researcher Agent**: Generates focused, search-engine optimized queries to crawl data sources.
    *   **Extractor Agent**: Extracts structured entities (Persons, Organizations, Locations, Events, and Financial Instruments) along with descriptions, source snippets, and document citations.
    *   **Merger Agent**: Performs semantic deduplication and link prediction to connect new nodes to existing context.
    *   **Narrator Agent**: Compiles forensic case reports citing specific documents and evidence.
2.  **Unified Command & Log Chat**: Combine initial scenarios and follow-up prompts with live terminal logs in a clean, scrollable conversation panel.
3.  **D3 Force-Directed Canvas**: Interactively renders entities and red string links. Hovering over nodes shows deep descriptions and document source details.
4.  **Persistent Evidence Drawer**: Collects and holds all Tavily search results parsed during the session. Click to expand and view original titles, full-text snippets, and original URLs.
5.  **Zero-Trust Security Integration**: Concatenates security output-validator guidelines directly into the Extractor Agent to prevent XSS payloads, enforce schemas, and clean HTML.
6.  **Continuous Session Context**: The WebSocket remains open, allowing you to ask follow-up queries that build upon the existing evidence board.

---

## Tech Stack

*   **Frontend**: React (Vite), D3 ForceGraph2D, Lucide Icons, HSL Vanilla CSS.
*   **Backend**: FastAPI, WebSockets, Pydantic, Python.
*   **AI Models**: Version-pinned Developer API models:
    *   Reasoning/Orchestration: `gemini-3.1-flash-lite`
    *   Vector Embeddings: `gemini-embedding-001`
*   **External APIs**: Tavily Search API.

---

## Getting Started

### 1. Prerequisites
Ensure you have the following installed:
*   [Python 3.11+](https://www.python.org/)
*   [Node.js 18+](https://nodejs.org/)
*   [uv](https://github.com/astral-sh/uv) (Python package installer)

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
GEMINI_API_KEY="your-google-gemini-api-key"
TAVILY_API_KEY="your-tavily-api-key"
```

### 3. Backend Setup
1.  Install backend virtual environment and dependencies:
    ```bash
    uv sync
    ```
2.  Start the FastAPI backend server:
    ```bash
    uv run uvicorn app.main:app --port 8000
    ```

### 4. Frontend Setup
1.  Navigate to the `frontend` folder:
    ```bash
    cd frontend
    ```
2.  Install packages:
    ```bash
    npm install
    ```
3.  Start the Vite dev server:
    ```bash
    npm run dev
    ```
4.  Open your browser and navigate to `http://localhost:5173/`.

---

## Operational Guidelines (OSINT)

All OSINT agents run under the strict rules of engagement defined in `.agents/skills/context.md`:
*   **Passive Reconnaissance**: Treats all web pages as raw text data; never attempts exploit actions.
*   **No Active Interaction**: Zero forms submitted, zero emails sent, zero purchases made.
*   **Rate Limits**: Hardcoded safety caps on total documents (`6` docs) and rounds (`2` iterations) to protect daily free-tier usage limits.
