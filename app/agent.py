from pydantic import BaseModel, Field
from typing import List, Dict, Any, Literal
from google.adk.agents import Agent
from google.genai import types as genai_types
import os

# ==================== Pydantic Schemas for Structured I/O ====================

class ExtractedNode(BaseModel):
    id: str = Field(description="Unique generated slug/ID for the entity, lowercase, alphanumeric, underscore (e.g. 'john_doe')")
    type: Literal["person", "organization", "event", "location", "financial_instrument", "other"]
    name: str = Field(description="Display name of the entity")
    attributes: Dict[str, Any] = Field(default_factory=dict, description="Additional properties, e.g. title, date, owner, role, value, connection details")
    source_document_id: str = Field(description="The identifier of the source document this node came from")
    source_snippet: str = Field(description="A short quote/reference from the source document confirming this entity")

class ExtractorOutput(BaseModel):
    nodes: List[ExtractedNode] = Field(default_factory=list, description="List of extracted entities")


class Connection(BaseModel):
    target_node_id: str = Field(description="The ID of the existing candidate node we are connecting to")
    relationship_type: str = Field(description="Type of connection, e.g. 'employed_by', 'transferred_funds_to', 'attended', 'located_in'")
    confidence: float = Field(description="Confidence score from 0.0 to 1.0")
    reasoning: str = Field(description="Brief explanation of why this connection exists based on the candidate's existing context")

class MergerOutput(BaseModel):
    connections: List[Connection] = Field(default_factory=list, description="List of judged connections. Empty list if no connections exist.")


# ==================== Utility to Load Skills ====================

def load_skill_instruction(skill_path: str) -> str:
    """Reads the massive SKILL.md file to inject into the Agent's brain."""
    try:
        resolved_path = os.path.abspath(skill_path)
        with open(resolved_path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return "You are a professional AI agent. Proceed with default instructions."


# ==================== Agent Definitions ====================
# We use gemini-1.5-flash for all agents to ensure high daily quotas (1500 requests/day) and avoid pro-tier limits.

# 1. Orchestrator
orchestrator_agent = Agent(
    name="orchestrator",
    model="gemini-1.5-flash",
    instruction=load_skill_instruction('.agents/skills/orchestrator-skill/SKILL.md')
)

# 2. Researcher
researcher_agent = Agent(
    name="researcher",
    model="gemini-1.5-flash",
    instruction=load_skill_instruction('.agents/skills/researcher-skill/SKILL.md')
)

# 3. Extractor
extractor_agent = Agent(
    name="extractor",
    model="gemini-1.5-flash",
    instruction=load_skill_instruction('.agents/skills/extractor-skill/SKILL.md'),
    output_schema=ExtractorOutput,
    output_key="extracted_nodes"
)

# 4. Merger
merger_agent = Agent(
    name="merger",
    model="gemini-1.5-flash",
    instruction=load_skill_instruction('.agents/skills/merger-skill/SKILL.md'),
    output_schema=MergerOutput,
    output_key="judged_connections"
)

# 5. Narrator
narrator_agent = Agent(
    name="narrator",
    model="gemini-1.5-flash",
    instruction=load_skill_instruction('.agents/skills/narrator-skill/SKILL.md')
)
