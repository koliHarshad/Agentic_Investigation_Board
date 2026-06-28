# Agentic Investigation Board Workspace Rules

- **Execution Model**: All agent calls run sequentially. Concurrent execution is prohibited to prevent rate limit bursts on the free tier.
- **Call Budgets**: Monitor and limit the number of active search calls per round (max 2 search queries per round, max 10 results per query).
- **Delay**: Always enforce `LLM_CALL_DELAY_SECONDS = 2` between consecutive LLM API calls.
