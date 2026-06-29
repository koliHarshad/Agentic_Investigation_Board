# Agentic Investigation Board: Session Summary & System Report

This report summarizes the troubleshooting, structural updates, quota protections, and test configurations implemented during this session to make the multi-agent investigation system stable, production-ready, and fully compatible with the Gemini Developer API (AI Studio) free-tier constraints.

---

## 1. Summary of Session Tests & Execution History

We ran several validation and end-to-end demo runs. Due to tight API quotas on free-tier keys, the tests experienced rate-limiting and demand-spike errors. The following is a chronological summary of what transpired:
1. **Initial Run (Bug Detection)**: The Extractor agent processed documents but returned warning messages indicating `Extractor returned invalid or empty data`. Because of this, the Merger phase was skipped entirely, and the frontend graph canvas remained blank.
2. **Structured Output Troubleshooting**: We ran an isolated test script (`test_extractor.py`) which revealed that the ADK (Agent Development Kit) Runner does not populate `event.output` directly during streaming event ticks; instead, it stores the parsed Pydantic object in the state delta (`event.actions.state_delta`).
3. **Embedding API Troubleshooting**: Inspecting the uvicorn logs revealed a `404 NOT_FOUND` error on the `"text-embedding-004"` model. Because embedding generation failed, the Vector DB could not calculate similarity scores, preventing the Merger from judging connections.
4. **Final Run (Optimized)**: We resolved the parsing issues, updated the embedding model, switched the core models to the stable 1.5 flash generation, and capped the document search and entity extraction counts to prevent rate limits.

---

## 2. Implemented Fixes & Architectural Updates

To resolve the errors above and ensure robust performance, we applied the following updates to the repository:

### A. ADK State-Delta & Dictionary Wrapper Extraction
* **File Modified**: `app/main.py`
* **Description**: Added helper classes (`ExtractorDictWrapper`, `MergerDictWrapper`, etc.) to wrap parsed dictionaries returned by the model. Updated the `run_llm_agent` runner to pull outputs directly from `event.actions.state_delta[output_key]`, allowing entities and relationships to stream correctly onto the UI.

### B. Embedding Model Correction
* **File Modified**: `app/vector_db.py`
* **Description**: Switched the embedding model from `"text-embedding-004"` (which threw a 404 error on the developer API key) to **`"gemini-embedding-2"`**, which is the active and supported embedding model.

### C. Stable Model Mapping Compatibility
* **File Modified**: `app/agent.py`
* **Description**: Configured all 5 agents (Orchestrator, Researcher, Extractor, Merger, and Narrator) to run on **`"gemini-flash-latest"`** (representing 1.5-flash). This model generation supports high daily caps (1,500 requests/day) on the free tier compared to the newer 2.5 models which are restricted to 20 requests/day.

### D. Rate-Limit & Quota Protection Limits
* **Files Modified**: `app/config.py`, `app/main.py`
* **Description**:
  * Set `MAX_TOTAL_DOCUMENTS = 6` (down from 15) and `MAX_DOCS_PER_ROUND = 3` (down from 10).
  * Capped Tavily searches to `max_results=3` per query.
  * Added a strict limit of **3 new nodes per round** in the Extractor loop. 
  * This keeps total LLM calls under 7 calls per round, shielding your API key from Requests Per Minute (RPM) limits.

---

## 3. Analysis of the Test Directory

The unit test files in `tests/unit/` are configured to validate key modules offline:

### A. `tests/unit/test_vector_db.py`
* **Purpose**: Tests node storage and cosine similarity retrieval in the Vector DB without making remote API requests.
* **Details**: Mocks the `_get_embedding` function to return pre-computed orthogonal vectors for dummy nodes ("Enron", "Arthur Andersen", "London Office") and verifies that `get_top_k` returns closest matching entities correctly sorted in descending order of similarity.

### B. `tests/unit/test_utils.py`
* **Purpose**: Tests auxiliary helper functions in the app.
* **Details**:
  * `test_clean_document_text_html`: Asserts that HTML tags, headers, and navigation boilerplate are removed, leaving clean, raw text.
  * `test_clean_document_text_whitespace`: Verifies whitespace and line-break normalization.
  * `test_with_retry_rate_limit`: Confirms that the `@with_retry` decorator handles mock rate-limit failures (raising a 429 status code) by executing exponential backoffs and recovering successfully on subsequent attempts.

---

## 4. Current System Status

* **Backend Server**: Stopped.
* **Frontend Dev Server**: Stopped.
* **Remote Repository**: All updates (wrappers, embedding model, quota caps, stable model mappings) are fully committed and pushed to GitHub.
* **Quota Status**: Optimized to consume minimum possible requests per round, fully protecting the API keys from quota fatigue.
