import asyncio
import time
import logging
from functools import wraps
import re
from bs4 import BeautifulSoup
from google.genai.errors import APIError

logger = logging.getLogger(__name__)

def with_retry(max_retries=3, base_delay=5.0):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if asyncio.iscoroutinefunction(fn):
                async def async_wrapper(*args, **kwargs):
                    for attempt in range(max_retries):
                        try:
                            return await fn(*args, **kwargs)
                        except APIError as e:
                            if e.code == 429 or "429" in str(e) or "ResourceExhausted" in str(e):
                                wait = base_delay * (attempt + 1)
                                logger.warning(f"Rate limited, retrying in {wait}s (attempt {attempt+1}/{max_retries}). APIError: {e}")
                                await asyncio.sleep(wait)
                            else:
                                raise e
                        except Exception as e:
                            err_msg = str(e)
                            if "429" in err_msg or "rate limit" in err_msg.lower() or "ResourceExhausted" in err_msg:
                                wait = base_delay * (attempt + 1)
                                logger.warning(f"Rate limited, retrying in {wait}s (attempt {attempt+1}/{max_retries}). Error: {e}")
                                await asyncio.sleep(wait)
                            else:
                                raise e
                    raise RuntimeError(f"Failed after {max_retries} retries due to rate limiting")
                return async_wrapper(*args, **kwargs)
            else:
                for attempt in range(max_retries):
                    try:
                        return fn(*args, **kwargs)
                    except APIError as e:
                        if e.code == 429 or "429" in str(e) or "ResourceExhausted" in str(e):
                            wait = base_delay * (attempt + 1)
                            logger.warning(f"Rate limited, retrying in {wait}s (attempt {attempt+1}/{max_retries}). APIError: {e}")
                            time.sleep(wait)
                        else:
                            raise e
                    except Exception as e:
                        err_msg = str(e)
                        if "429" in err_msg or "rate limit" in err_msg.lower() or "ResourceExhausted" in err_msg:
                            wait = base_delay * (attempt + 1)
                            logger.warning(f"Rate limited, retrying in {wait}s (attempt {attempt+1}/{max_retries}). Error: {e}")
                            time.sleep(wait)
                        else:
                            raise e
                raise RuntimeError(f"Failed after {max_retries} retries due to rate limiting")
        return wrapper
    return decorator

def clean_document_text(text: str) -> str:
    """Strips HTML, boilerplate, navigation text, keeping only core body."""
    if not text:
        return ""
    if "<html" in text.lower() or "<div" in text.lower() or "<p" in text.lower():
        try:
            soup = BeautifulSoup(text, "html.parser")
            for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
                element.decompose()
            text = soup.get_text(separator="\n")
        except Exception as e:
            logger.warning(f"Failed to parse HTML, falling back to regex cleanup: {e}")
    
    lines = [line.strip() for line in text.splitlines()]
    cleaned_lines = [line for line in lines if line]
    return "\n".join(cleaned_lines)
