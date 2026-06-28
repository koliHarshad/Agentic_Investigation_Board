import pytest
import asyncio
from app.utils import clean_document_text, with_retry

def test_clean_document_text_html():
    raw_html = "<html><body><header>Nav</header><article><h1>Enron Collapse</h1><p>Enron collapsed in 2001.</p></article></body></html>"
    cleaned = clean_document_text(raw_html)
    assert "Enron Collapse" in cleaned
    assert "Nav" not in cleaned  # Headers should be decomposed
    assert "<p>" not in cleaned  # HTML tags should be stripped

def test_clean_document_text_whitespace():
    raw_text = "   Line 1   \n\n\n   Line 2   "
    cleaned = clean_document_text(raw_text)
    assert cleaned == "Line 1\nLine 2"

@pytest.mark.asyncio
async def test_with_retry_rate_limit():
    attempts = 0
    
    @with_retry(max_retries=3, base_delay=0.1)
    async def flaky_async_func():
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            # Raise a mock rate limit error containing 429
            raise ValueError("Rate limit exceeded: Status Code 429")
        return "success"
        
    res = await flaky_async_func()
    assert res == "success"
    assert attempts == 3
