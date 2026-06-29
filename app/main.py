import asyncio
import json
import logging
import uuid
import sys
import re
import google.genai._transformers as transformers

# Apply monkeypatch to strip additionalProperties from schemas for Developer API compatibility
original_process_schema = transformers.process_schema

def custom_process_schema(schema, client, defs=None, *args, **kwargs):
    def strip_additional_properties(d):
        if not isinstance(d, dict):
            return
        if "additionalProperties" in d:
            del d["additionalProperties"]
        for val in d.values():
            if isinstance(val, dict):
                strip_additional_properties(val)
            elif isinstance(val, list):
                for item in val:
                    if isinstance(item, dict):
                        strip_additional_properties(item)
    strip_additional_properties(schema)
    original_process_schema(schema, client, defs, *args, **kwargs)

transformers.process_schema = custom_process_schema

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import (
    GEMINI_API_KEY,
    MAX_TOTAL_DOCUMENTS,
    MAX_RESEARCH_ROUNDS,
    MAX_DOCS_PER_ROUND,
    MAX_DOCS_PER_EXTRACTOR_BATCH,
    MAX_MERGER_CANDIDATES_K,
    LLM_CALL_DELAY_SECONDS,
    RETRY_MAX_ATTEMPTS,
    RETRY_BASE_DELAY_SECONDS,
)
from app.utils import clean_document_text, with_retry
from app.vector_db import VectorDB
from app.graph_store import GraphStore
from app.agent import (
    orchestrator_agent,
    researcher_agent,
    extractor_agent,
    merger_agent,
    narrator_agent,
)
from app.tools import search_tavily, search_opensanctions

# Setup Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("main")


# ==================== ADK Dict Wrappers for Structured Outputs ====================

class ExtractorNodeWrapper:
    def __init__(self, node_dict):
        self.id = node_dict.get("id")
        self.type = node_dict.get("type")
        self.name = node_dict.get("name")
        self.attributes = node_dict.get("attributes", {})
        self.source_document_id = node_dict.get("source_document_id")
        self.source_snippet = node_dict.get("source_snippet")

class ExtractorDictWrapper:
    def __init__(self, data_dict):
        self.nodes = [ExtractorNodeWrapper(n) for n in data_dict.get("nodes", [])]

class MergerConnectionWrapper:
    def __init__(self, conn_dict):
        self.target_node_id = conn_dict.get("target_node_id")
        self.relationship_type = conn_dict.get("relationship_type")
        self.confidence = conn_dict.get("confidence")
        self.reasoning = conn_dict.get("reasoning")

class MergerDictWrapper:
    def __init__(self, data_dict):
        self.connections = [MergerConnectionWrapper(c) for c in data_dict.get("connections", [])]

app = FastAPI(title="Agentic Investigation Board API")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper to run ADK agents sequentially and retrieve output
from google.adk.runners import InMemoryRunner
from google.genai import types

# Wrap with with_retry decorator to absorb rate limit errors on the ADK runner
@with_retry(max_retries=RETRY_MAX_ATTEMPTS, base_delay=RETRY_BASE_DELAY_SECONDS)
async def run_llm_agent(agent, prompt: str, session_id: str) -> tuple[str, any]:
    """Runs an ADK agent with a prompt and returns (raw_text, structured_output)."""
    runner = InMemoryRunner(agent=agent)
    
    # Pre-create session using the runner's app name
    await runner.session_service.create_session(
        app_name=runner.app_name,
        user_id="user",
        session_id=session_id
    )
    
    new_message = types.Content(role="user", parts=[types.Part.from_text(text=prompt)])
    raw_text = ""
    structured_output = None
    
    async for event in runner.run_async(
        user_id="user",
        session_id=session_id,
        new_message=new_message
    ):
        if event.content and event.content.parts:
            for part in event.content.parts:
                if part.text:
                    raw_text += part.text
        # Retrieve parsed schema from ADK state delta actions
        if event.actions and event.actions.state_delta:
            for key, val in event.actions.state_delta.items():
                structured_output = val
                
    # Wrap raw dicts into helper wrappers for downstream attribute access (.nodes, .connections)
    if structured_output is not None and isinstance(structured_output, dict):
        if "nodes" in structured_output:
            structured_output = ExtractorDictWrapper(structured_output)
        elif "connections" in structured_output:
            structured_output = MergerDictWrapper(structured_output)
            
    return raw_text, structured_output

@app.websocket("/ws/investigate")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection established.")
    
    try:
        # 1. Receive initial user query
        data = await websocket.receive_text()
        request_data = json.loads(data)
        query = request_data.get("query", "")
        
        if not query:
            await websocket.send_json({"type": "error", "data": "Empty query provided."})
            await websocket.close()
            return
            
        logger.info(f"Starting investigation for query: {query}")
        await websocket.send_json({"type": "status", "data": "Initializing evidence board..."})
        
        # 2. Setup Graph Store, Vector DB, and tracking variables
        graph_store = GraphStore()
        vector_db = VectorDB(api_key=GEMINI_API_KEY)
        
        total_docs_fetched = 0
        all_searched_queries = []
        known_entities_names = []
        
        round_count = 0
        investigation_status = "RESEARCH"
        orchestrator_plan = ""
        
        # 3. Orchestration sequential loop
        while round_count < MAX_RESEARCH_ROUNDS and investigation_status == "RESEARCH":
            round_count += 1
            session_id = str(uuid.uuid4())
            
            await websocket.send_json({
                "type": "status",
                "data": f"Round {round_count}/{MAX_RESEARCH_ROUNDS}: Orchestrator formulating plan..."
            })
            
            # Orchestrator prompt
            current_graph_state = graph_store.to_dict()
            orchestrator_prompt = f"""
Original Query: {query}
Current Round: {round_count}
Max Rounds: {MAX_RESEARCH_ROUNDS}
Current Evidence Graph: {json.dumps(current_graph_state)}

Based on the original query and the current graph, summarize findings and output status:
- 'COMPLETE' if we have enough information or if this is the final round ({MAX_RESEARCH_ROUNDS}).
- 'RESEARCH' if we need further search.
Draft the focused planning objectives for this round.
"""
            # Call Orchestrator
            logger.info("Calling Orchestrator...")
            orchestrator_plan, _ = await run_llm_agent(orchestrator_agent, orchestrator_prompt, session_id)
            logger.info(f"Orchestrator Plan: {orchestrator_plan}")
            
            await websocket.send_json({"type": "orchestrator_plan", "data": orchestrator_plan})
            
            # Enforce sequential LLM call delay
            await asyncio.sleep(LLM_CALL_DELAY_SECONDS)
            
            # Robust parsing of status from free-text Orchestrator plan using regex
            status_match = re.search(r"Status:\s*(COMPLETE|RESEARCH)", orchestrator_plan, re.IGNORECASE)
            status = "COMPLETE"
            if status_match:
                status = status_match.group(1).upper()
            else:
                # Fallback to robust substring search
                if "COMPLETE" in orchestrator_plan.upper():
                    status = "COMPLETE"
                elif "RESEARCH" in orchestrator_plan.upper():
                    status = "RESEARCH"
            
            logger.info(f"Orchestrator status parsed: {status}")
            
            # Check if complete or if we've hit the round limit
            if status == "COMPLETE" or round_count >= MAX_RESEARCH_ROUNDS:
                investigation_status = "COMPLETE"
                break
                
            # --- Researcher Phase ---
            session_id = str(uuid.uuid4())
            await websocket.send_json({
                "type": "status",
                "data": f"Round {round_count}: Researcher generating queries..."
            })
            
            researcher_prompt = f"""
Orchestrator Plan: {orchestrator_plan}
Entities already on the board: {', '.join(known_entities_names) if known_entities_names else 'None'}
Previously searched queries: {', '.join(all_searched_queries) if all_searched_queries else 'None'}

Generate a list of 1 to 2 search queries. Focus queries on finding connections between existing entities.
Write only the queries, one per line. No extra explanation.
"""
            # Call Researcher
            logger.info("Calling Researcher...")
            queries_raw, _ = await run_llm_agent(researcher_agent, researcher_prompt, session_id)
            queries = [q.strip() for q in queries_raw.splitlines() if q.strip()]
            queries = [q.replace('"', '').replace("'", "") for q in queries][:2]  # Cap at 2 queries per round
            
            logger.info(f"Generated queries: {queries}")
            await websocket.send_json({"type": "research_queries", "data": queries})
            all_searched_queries.extend(queries)
            
            await asyncio.sleep(LLM_CALL_DELAY_SECONDS)
            
            # --- Fetch Documents (MCP Tool Calls equivalent) ---
            doc_queue = []
            for search_q in queries:
                if total_docs_fetched >= MAX_TOTAL_DOCUMENTS:
                    logger.info("MAX_TOTAL_DOCUMENTS cap reached. Stopping fetching.")
                    break
                    
                await websocket.send_json({
                    "type": "status",
                    "data": f"Round {round_count}: Executing search: '{search_q}'..."
                })
                
                # Fetch docs via Tavily
                results = await search_tavily(search_q, max_results=3)
                
                for r in results:
                    if total_docs_fetched >= MAX_TOTAL_DOCUMENTS:
                        break
                    
                    cleaned_text = clean_document_text(r.get("content", ""))
                    doc_id = f"doc_{total_docs_fetched + 1}"
                    total_docs_fetched += 1
                    
                    doc_queue.append({
                        "id": doc_id,
                        "title": r.get("title", "Search Result"),
                        "url": r.get("url", ""),
                        "content": cleaned_text
                    })
            
            if not doc_queue:
                await websocket.send_json({
                    "type": "status",
                    "data": f"Round {round_count}: No documents found in search. Proceeding to next step..."
                })
                continue
                
            # --- Extractor Phase (Batching) ---
            await websocket.send_json({
                "type": "status",
                "data": f"Round {round_count}: Extractor processing {len(doc_queue)} documents in batches..."
            })
            
            # Group into batches of MAX_DOCS_PER_EXTRACTOR_BATCH (3)
            for i in range(0, len(doc_queue), MAX_DOCS_PER_EXTRACTOR_BATCH):
                batch = doc_queue[i : i + MAX_DOCS_PER_EXTRACTOR_BATCH]
                
                # Format prompt with labeled documents
                batch_text = ""
                for idx, doc in enumerate(batch):
                    batch_text += f"--- Document {doc['id']} ---\nTitle: {doc['title']}\nURL: {doc['url']}\nContent: {doc['content'][:3000]}\n\n"
                
                extractor_prompt = f"""
Here is a batch of clean source documents:
{batch_text}

Extract all key entities (persons, organizations, events, locations, financial instruments, etc.) from the documents.
Follow the Pydantic schema strictly. Tag each extracted entity with the source_document_id and a short source_snippet.
"""
                session_id = str(uuid.uuid4())
                logger.info(f"Calling Extractor for batch starting at index {i}...")
                _, extracted_data = await run_llm_agent(extractor_agent, extractor_prompt, session_id)
                
                await asyncio.sleep(LLM_CALL_DELAY_SECONDS)
                
                if not extracted_data or not hasattr(extracted_data, "nodes"):
                    logger.warning("Extractor returned invalid or empty data.")
                    continue
                
                # Process each extracted node
                new_nodes_added_this_round = 0
                for node_obj in extracted_data.nodes:
                    if new_nodes_added_this_round >= 3:
                        logger.info("Cap of 3 new nodes per round reached. Skipping remaining extractions to conserve API quota.")
                        break
                    node = {
                        "id": node_obj.id,
                        "type": node_obj.type,
                        "name": node_obj.name,
                        "attributes": node_obj.attributes,
                        "source_document_id": node_obj.source_document_id,
                        "source_snippet": node_obj.source_snippet
                    }
                    
                    # 1. Base deduplication by case-insensitive name match
                    normalized_name = node["name"].lower().strip()
                    existing_id = None
                    for existing_node in graph_store.nodes.values():
                        if existing_node["name"].lower().strip() == normalized_name:
                            existing_id = existing_node["id"]
                            break
                            
                    # 2. Advanced deduplication using vector similarity threshold (> 0.92)
                    if not existing_id:
                        similar_node = vector_db.find_similar_node(node, threshold=0.92)
                        if similar_node:
                            existing_id = similar_node["id"]
                            logger.info(f"Advanced deduplication: merged '{node['name']}' with existing '{similar_node['name']}' (ID: {existing_id}) using similarity.")
                    
                    if existing_id:
                        logger.info(f"Node '{node['name']}' already exists on board (merged ID: {existing_id}).")
                        continue
                        
                    # Add to graph and vector db
                    graph_store.add_node(node)
                    vector_db.add_node(node)
                    known_entities_names.append(node["name"])
                    new_nodes_added_this_round += 1
                    
                    # Stream node to UI
                    await websocket.send_json({"type": "node_added", "data": node})
                    
                    # --- Merger Phase (Per Node) ---
                    # Query Vector DB for similarity
                    candidates = vector_db.get_top_k(node, k=MAX_MERGER_CANDIDATES_K)
                    
                    if not candidates:
                        logger.info(f"No similarity candidates found for node: {node['name']}.")
                        continue
                        
                    # Get immediate edges for candidates
                    candidate_edges = []
                    for cand in candidates:
                        edges = graph_store.get_edges_for_node(cand["id"])
                        candidate_edges.extend(edges)
                        
                    merger_prompt = f"""
New Node: {json.dumps(node)}
Candidate Nodes: {json.dumps(candidates)}
Immediate Edges of Candidates: {json.dumps(candidate_edges)}

Decide if the New Node forms a real connection to any of the Candidate Nodes.
For each valid connection, output target_node_id, relationship_type, confidence score, and brief reasoning.
Format as JSON matching MergerOutput schema.
"""
                    session_id = str(uuid.uuid4())
                    logger.info(f"Calling Merger for node '{node['name']}'...")
                    _, merger_data = await run_llm_agent(merger_agent, merger_prompt, session_id)
                    
                    await asyncio.sleep(LLM_CALL_DELAY_SECONDS)
                    
                    if not merger_data or not hasattr(merger_data, "connections"):
                        continue
                        
                    for conn in merger_data.connections:
                        if conn.confidence >= 0.6:  # Confirmed connection threshold
                            graph_store.add_edge(
                                source=node["id"],
                                target=conn.target_node_id,
                                rel_type=conn.relationship_type,
                                confidence=conn.confidence,
                                source_document_id=node.get("source_document_id", ""),
                                source_snippet=node.get("source_snippet", "")
                            )
                            
                            edge_data = {
                                "source": node["id"],
                                "target": conn.target_node_id,
                                "type": conn.relationship_type,
                                "confidence": conn.confidence,
                                "source_document_id": node.get("source_document_id", ""),
                                "source_snippet": node.get("source_snippet", "")
                            }
                            # Stream edge to UI
                            await websocket.send_json({"type": "edge_added", "data": edge_data})
                            logger.info(f"Confirmed connection added: {node['id']} -> {conn.target_node_id}")
                        else:
                            logger.info(f"Flagged low-confidence connection: {node['id']} - {conn.target_node_id} ({conn.confidence})")
                            
        # --- Narrator Phase ---
        session_id = str(uuid.uuid4())
        await websocket.send_json({
            "type": "status",
            "data": "Orchestrator marked investigation complete. Narrator drafting final case narrative..."
        })
        
        final_graph = graph_store.to_dict()
        narrator_prompt = f"""
Here is the final evidence graph containing confirmed nodes and edges, along with their sources and snippets:
{json.dumps(final_graph)}

Original Investigation Query: {query}

Draft a detailed, cohesive case story summarizing the findings of the investigation.
You MUST include inline citations to the source snippets and document IDs present in the graph edges to prove provenance.
"""
        # Call Narrator
        logger.info("Calling Narrator...")
        narrative_text, _ = await run_llm_agent(narrator_agent, narrator_prompt, session_id)
        
        await websocket.send_json({"type": "narrative", "data": narrative_text})
        await websocket.send_json({"type": "complete"})
        logger.info("Investigation sequence complete.")
        
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected.")
    except Exception as e:
        logger.exception("Error in websocket handler:")
        try:
            await websocket.send_json({"type": "error", "data": f"Internal server error: {str(e)}"})
        except Exception:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
