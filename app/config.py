import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
OPENSANCTIONS_API_KEY = os.getenv("OPENSANCTIONS_API_KEY")

# Hard caps and safety limits (with defaults matching specs)
MAX_TOTAL_DOCUMENTS = int(os.getenv("MAX_TOTAL_DOCUMENTS", 15))
MAX_RESEARCH_ROUNDS = int(os.getenv("MAX_RESEARCH_ROUNDS", 2))
MAX_DOCS_PER_ROUND = int(os.getenv("MAX_DOCS_PER_ROUND", 10))
MAX_DOCS_PER_EXTRACTOR_BATCH = int(os.getenv("MAX_DOCS_PER_EXTRACTOR_BATCH", 3))
MAX_MERGER_CANDIDATES_K = int(os.getenv("MAX_MERGER_CANDIDATES_K", 5))
LLM_CALL_DELAY_SECONDS = float(os.getenv("LLM_CALL_DELAY_SECONDS", 2.0))
RETRY_MAX_ATTEMPTS = int(os.getenv("RETRY_MAX_ATTEMPTS", 3))
RETRY_BASE_DELAY_SECONDS = float(os.getenv("RETRY_BASE_DELAY_SECONDS", 5.0))
