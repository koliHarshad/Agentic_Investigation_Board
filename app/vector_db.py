import numpy as np
from google import genai
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class VectorDB:
    def __init__(self, api_key: str = None):
        self.nodes = []  # List of dicts (node objects)
        self.embeddings = []  # List of np.array
        self.client = genai.Client(api_key=api_key)

    def _get_embedding(self, text: str) -> List[float]:
        try:
            # Using gemini-embedding-2 as verified by Client.models.list()
            response = self.client.models.embed_content(
                model="gemini-embedding-001",
                contents=text
            )
            return response.embeddings[0].values
        except Exception as e:
            logger.error(f"Embedding API call failed: {e}")
            raise e

    def add_node(self, node: Dict[str, Any]):
        """Embeds the node text and stores the node and its embedding."""
        representation = f"Name: {node.get('name')}. Type: {node.get('type')}. Attributes: {node.get('attributes', {})}"
        try:
            emb = self._get_embedding(representation)
            self.nodes.append(node)
            self.embeddings.append(np.array(emb))
            logger.info(f"Added node '{node.get('name')}' to Vector DB.")
        except Exception as e:
            logger.error(f"Failed to embed node '{node.get('name')}': {e}")
            self.nodes.append(node)
            self.embeddings.append(np.zeros(768))

    def get_top_k(self, new_node: Dict[str, Any], k: int = 5) -> List[Dict[str, Any]]:
        """Queries Vector DB for the top k most similar existing nodes."""
        if not self.nodes:
            return []
        
        representation = f"Name: {new_node.get('name')}. Type: {new_node.get('type')}. Attributes: {new_node.get('attributes', {})}"
        try:
            new_emb = np.array(self._get_embedding(representation))
        except Exception as e:
            logger.error(f"Failed to embed query node '{new_node.get('name')}': {e}")
            return []

        similarities = []
        for emb in self.embeddings:
            dot_prod = np.dot(new_emb, emb)
            norm_new = np.linalg.norm(new_emb)
            norm_emb = np.linalg.norm(emb)
            if norm_new > 0 and norm_emb > 0:
                sim = dot_prod / (norm_new * norm_emb)
            else:
                sim = 0.0
            similarities.append(sim)
        
        top_indices = np.argsort(similarities)[::-1][:k]
        
        results = []
        for idx in top_indices:
            if self.nodes[idx].get("id") != new_node.get("id"):
                results.append(self.nodes[idx])
        
        return results

    def find_similar_node(self, new_node: Dict[str, Any], threshold: float = 0.92) -> Optional[Dict[str, Any]]:
        """Finds an existing node that has a cosine similarity above the threshold."""
        if not self.nodes:
            return None
        representation = f"Name: {new_node.get('name')}. Type: {new_node.get('type')}. Attributes: {new_node.get('attributes', {})}"
        try:
            new_emb = np.array(self._get_embedding(representation))
        except Exception as e:
            logger.error(f"Failed to embed node for similarity check: {e}")
            return None

        for idx, emb in enumerate(self.embeddings):
            dot_prod = np.dot(new_emb, emb)
            norm_new = np.linalg.norm(new_emb)
            norm_emb = np.linalg.norm(emb)
            sim = dot_prod / (norm_new * norm_emb) if (norm_new > 0 and norm_emb > 0) else 0.0
            if sim >= threshold:
                return self.nodes[idx]
        return None
