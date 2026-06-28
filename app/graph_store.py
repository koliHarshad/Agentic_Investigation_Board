from typing import List, Dict, Any

class GraphStore:
    def __init__(self):
        self.nodes = {}  # id -> node dict
        self.edges = []  # list of edge dicts

    def add_node(self, node: Dict[str, Any]):
        node_id = node.get("id")
        if node_id:
            self.nodes[node_id] = node

    def add_edge(self, source: str, target: str, rel_type: str, confidence: float, source_document_id: str = "", source_snippet: str = ""):
        edge = {
            "source": source,
            "target": target,
            "type": rel_type,
            "confidence": confidence,
            "source_document_id": source_document_id,
            "source_snippet": source_snippet
        }
        self.edges.append(edge)

    def get_edges_for_node(self, node_id: str) -> List[Dict[str, Any]]:
        return [e for e in self.edges if e["source"] == node_id or e["target"] == node_id]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "nodes": list(self.nodes.values()),
            "edges": self.edges
        }
