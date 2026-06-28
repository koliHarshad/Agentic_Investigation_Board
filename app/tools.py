import httpx
from app.config import TAVILY_API_KEY, OPENSANCTIONS_API_KEY
from app.utils import with_retry
import logging

logger = logging.getLogger(__name__)

@with_retry(max_retries=3, base_delay=5.0)
async def search_tavily(query: str, max_results: int = 10) -> list:
    """Searches Tavily API for news/articles."""
    if not TAVILY_API_KEY:
        logger.warning("TAVILY_API_KEY is not set. Returning empty list.")
        return []
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": TAVILY_API_KEY,
                "query": query,
                "max_results": max_results,
                "search_depth": "advanced"
            },
            timeout=30.0
        )
        response.raise_for_status()
        data = response.json()
        results = data.get("results", [])
        return [
            {
                "id": f"tavily_{idx}",
                "title": r.get("title", ""),
                "content": r.get("content", ""),
                "url": r.get("url", "")
            }
            for idx, r in enumerate(results)
        ]

@with_retry(max_retries=3, base_delay=5.0)
async def search_opensanctions(query: str, limit: int = 5) -> list:
    """Searches OpenSanctions API for structured OSINT/public record entities."""
    if not OPENSANCTIONS_API_KEY:
        logger.warning("OPENSANCTIONS_API_KEY is not set. Returning empty list.")
        return []
    
    async with httpx.AsyncClient() as client:
        # OpenSanctions public search API
        headers = {"Authorization": f"ApiKey {OPENSANCTIONS_API_KEY}"}
        response = await client.get(
            f"https://api.opensanctions.org/search?q={query}&limit={limit}",
            headers=headers,
            timeout=30.0
        )
        response.raise_for_status()
        data = response.json()
        results = data.get("results", [])
        return [
            {
                "id": r.get("id", ""),
                "title": r.get("caption", ""),
                "content": f"Type: {r.get('schema')}. Countries: {r.get('countries')}. Notes: {r.get('properties', {}).get('notes', '')}",
                "url": f"https://www.opensanctions.org/entities/{r.get('id')}/"
            }
            for r in results
        ]
