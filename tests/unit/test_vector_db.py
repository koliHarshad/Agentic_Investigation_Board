import pytest
import numpy as np
from unittest.mock import MagicMock
from app.vector_db import VectorDB

def test_vector_db_add_and_retrieve():
    # Instantiate VectorDB
    vdb = VectorDB(api_key="mock_key")
    
    # Mock embedding method to return fixed vectors
    # We assign distinct vectors to nodes to check cosine similarity sorting
    def mock_get_embedding(text):
        if "Enron" in text:
            return [1.0, 0.0, 0.0]
        elif "Arthur Andersen" in text:
            return [0.9, 0.1, 0.0] # High similarity to Enron
        else:
            return [0.0, 1.0, 0.0] # Unrelated vector
            
    vdb._get_embedding = mock_get_embedding
    
    node1 = {"id": "enron", "name": "Enron", "type": "organization", "attributes": {}}
    node2 = {"id": "arthur_andersen", "name": "Arthur Andersen", "type": "organization", "attributes": {}}
    node3 = {"id": "london", "name": "London Office", "type": "location", "attributes": {}}
    
    vdb.add_node(node1)
    vdb.add_node(node2)
    vdb.add_node(node3)
    
    assert len(vdb.nodes) == 3
    
    # Query for nodes similar to Enron
    # The new node is Enron Corp (similar text)
    query_node = {"id": "enron_corp", "name": "Enron Corp", "type": "organization", "attributes": {}}
    results = vdb.get_top_k(query_node, k=2)
    
    # Results should be sorted by similarity descending
    # Arthur Andersen is very close [0.9, 0.1, 0.0] to Enron [1.0, 0.0, 0.0]
    # London Office [0.0, 1.0, 0.0] is orthogonal
    assert len(results) == 2
    assert results[0]["id"] == "enron" # Exact name match
    assert results[1]["id"] == "arthur_andersen"
