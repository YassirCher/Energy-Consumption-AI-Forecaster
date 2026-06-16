"""
Graph RAG — Lightweight Knowledge Graph for EcoForecaster v5.1
Provides graph-based context enrichment for LLM reasoning.
Optimized with caching to avoid recomputation.
"""

import os
import json
import time
import datetime
import threading
from collections import defaultdict

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ─── Graph Data Structures ──────────────────────────────────────────────────────

class KnowledgeNode:
    """A node in the knowledge graph."""
    __slots__ = ('id', 'type', 'properties')

    def __init__(self, node_id: str, node_type: str, properties: dict = None):
        self.id = node_id
        self.type = node_type
        self.properties = properties or {}

    def to_dict(self):
        return {"id": self.id, "type": self.type, **self.properties}


class KnowledgeEdge:
    """An edge (relationship) in the knowledge graph."""
    __slots__ = ('source', 'target', 'relation', 'properties')

    def __init__(self, source: str, target: str, relation: str, properties: dict = None):
        self.source = source
        self.target = target
        self.relation = relation
        self.properties = properties or {}

    def to_dict(self):
        return {"source": self.source, "target": self.target, "relation": self.relation, **self.properties}


class KnowledgeGraph:
    """
    Lightweight in-memory knowledge graph for energy forecasting domain.
    
    Node types: model, dataset, feature, drift_event, training_run
    Edge types: trained_on, affected_by, triggered, promoted_from, uses_feature
    """

    def __init__(self):
        self.nodes: dict[str, KnowledgeNode] = {}
        self.edges: list[KnowledgeEdge] = []
        self._adjacency: dict[str, list[KnowledgeEdge]] = defaultdict(list)
        self._built = False
        self._build_timestamp: float = 0
        self._context_cache: dict[str, tuple[str, float]] = {}
        self._cache_ttl: int = 120  # seconds
        self._lock = threading.Lock()

    def add_node(self, node_id: str, node_type: str, properties: dict = None):
        node = KnowledgeNode(node_id, node_type, properties)
        self.nodes[node_id] = node
        return node

    def add_edge(self, source: str, target: str, relation: str, properties: dict = None):
        edge = KnowledgeEdge(source, target, relation, properties)
        self.edges.append(edge)
        self._adjacency[source].append(edge)
        return edge

    def get_neighbors(self, node_id: str) -> list[dict]:
        """Get all nodes connected to a given node."""
        results = []
        for edge in self._adjacency.get(node_id, []):
            target_node = self.nodes.get(edge.target)
            if target_node:
                results.append({
                    "node": target_node.to_dict(),
                    "relation": edge.relation,
                    **edge.properties
                })
        # Also check reverse edges
        for edge in self.edges:
            if edge.target == node_id and edge.source in self.nodes:
                results.append({
                    "node": self.nodes[edge.source].to_dict(),
                    "relation": f"reverse_{edge.relation}",
                    **edge.properties
                })
        return results

    def get_nodes_by_type(self, node_type: str) -> list[dict]:
        return [n.to_dict() for n in self.nodes.values() if n.type == node_type]

    def get_subgraph(self, node_id: str, depth: int = 2) -> dict:
        """Get a local subgraph around a node up to given depth."""
        visited = set()
        nodes_out = []
        edges_out = []
        queue = [(node_id, 0)]

        while queue:
            current, d = queue.pop(0)
            if current in visited or d > depth:
                continue
            visited.add(current)
            if current in self.nodes:
                nodes_out.append(self.nodes[current].to_dict())

            for edge in self._adjacency.get(current, []):
                edges_out.append(edge.to_dict())
                if edge.target not in visited:
                    queue.append((edge.target, d + 1))

        return {"nodes": nodes_out, "edges": edges_out}

    def build_from_system_state(self, production_schema: dict, drift_alerts: list,
                                 mlflow_runs: list = None, feature_importances: list = None):
        """
        Build the knowledge graph from current system state.
        """
        self.nodes.clear()
        self.edges.clear()
        self._adjacency.clear()

        # ── Model nodes ──
        model_name = production_schema.get("best_model", "unknown")
        self.add_node(model_name, "model", {
            "r2": production_schema.get("latest_r2"),
            "rmse": production_schema.get("latest_rmse"),
            "status": "production"
        })

        model_1h = production_schema.get("model_1h", "")
        if model_1h:
            self.add_node(model_1h, "model", {"horizon": "1h", "status": "production"})
            self.add_edge(model_1h, model_name, "derived_from")

        model_24h = production_schema.get("model_24h", "")
        if model_24h:
            self.add_node(model_24h, "model", {"horizon": "24h", "status": "production"})
            self.add_edge(model_24h, model_name, "derived_from")

        # ── Dataset node ──
        data_version = production_schema.get("data_version", "unknown")
        self.add_node(f"dataset_{data_version[:30]}", "dataset", {
            "version": data_version
        })
        self.add_edge(model_name, f"dataset_{data_version[:30]}", "trained_on")

        # ── Feature nodes ──
        features = production_schema.get("required_features", [])
        for feat in features[:12]:  # Top 12
            self.add_node(f"feature_{feat}", "feature", {"name": feat})
            self.add_edge(model_name, f"feature_{feat}", "uses_feature")

        # ── Feature importance edges ──
        if feature_importances:
            for fi in feature_importances[:5]:
                feat_id = f"feature_{fi['feature']}"
                if feat_id in self.nodes:
                    self.nodes[feat_id].properties["importance"] = fi["importance"]
                    self.nodes[feat_id].properties["rank"] = feature_importances.index(fi) + 1

        # ── Drift event nodes ──
        breach_events = [a for a in drift_alerts if a.get("is_breach")]
        for i, alert in enumerate(breach_events[-10:]):  # Last 10 breaches
            event_id = f"drift_event_{i}"
            self.add_node(event_id, "drift_event", {
                "timestamp": alert.get("timestamp"),
                "js_divergence": alert.get("js_divergence"),
                "consecutive": alert.get("consecutive", 0)
            })
            self.add_edge(event_id, model_name, "affected_by")

            # If consecutive breaches triggered retraining
            if alert.get("drift_detected"):
                self.add_edge(event_id, model_name, "triggered_retrain")

        self._built = True
        self._build_timestamp = time.time()
        # Invalidate context cache on rebuild
        with self._lock:
            self._context_cache.clear()

    def enrich_context(self, query_type: str = "general") -> str:
        """
        Generate enriched context string for LLM based on query type.
        Cached to avoid recomputation on every request.
        """
        if not self._built:
            return "Knowledge graph not yet built."

        # Check cache
        with self._lock:
            if query_type in self._context_cache:
                cached_val, cached_ts = self._context_cache[query_type]
                if time.time() - cached_ts < self._cache_ttl:
                    return cached_val

        models = self.get_nodes_by_type("model")
        drift_events = self.get_nodes_by_type("drift_event")
        features = self.get_nodes_by_type("feature")

        context_parts = []

        if query_type in ("general", "drift", "performance"):
            context_parts.append("=== Model Knowledge ===")
            for m in models:
                neighbors = self.get_neighbors(m["id"])
                context_parts.append(f"Model '{m['id']}': R²={m.get('r2', '?')}, RMSE={m.get('rmse', '?')}, status={m.get('status', '?')}")
                dataset_links = [n for n in neighbors if n.get("relation") == "trained_on"]
                if dataset_links:
                    context_parts.append(f"  → Trained on: {dataset_links[0]['node']['id']}")

        if query_type in ("general", "drift"):
            if drift_events:
                context_parts.append(f"\n=== Drift Events ({len(drift_events)} recent breaches) ===")
                for de in drift_events[-3:]:
                    context_parts.append(f"  Drift at {de.get('timestamp', '?')}: JS={de.get('js_divergence', '?')}, consecutive={de.get('consecutive', '?')}")
                    neighbors = self.get_neighbors(de["id"])
                    affected = [n for n in neighbors if "affected" in n.get("relation", "")]
                    if affected:
                        context_parts.append(f"    → Affected model: {affected[0]['node']['id']}")

        if query_type in ("general", "features"):
            top_features = sorted(features, key=lambda x: x.get("importance", 0), reverse=True)[:5]
            if top_features:
                context_parts.append("\n=== Top Features ===")
                for f in top_features:
                    imp = f.get("importance")
                    context_parts.append(f"  {f.get('name', f['id'])}: importance={f'{imp:.3f}' if imp else '?'}")

        result = "\n".join(context_parts)
        # Store in cache
        with self._lock:
            self._context_cache[query_type] = (result, time.time())
        return result

    def get_reasoning_chain(self, entity_id: str) -> str:
        """
        Build a reasoning chain for a specific entity showing its relationships.
        Example: 'This drift affected model X which was trained on dataset Y'
        """
        if entity_id not in self.nodes:
            return f"Entity '{entity_id}' not found in knowledge graph."

        node = self.nodes[entity_id]
        neighbors = self.get_neighbors(entity_id)

        chain = [f"Entity: {node.type} '{node.id}'"]
        chain.append(f"Properties: {json.dumps(node.properties, default=str)}")

        if neighbors:
            chain.append("Relationships:")
            for n in neighbors:
                chain.append(f"  → {n['relation']} → {n['node']['type']} '{n['node']['id']}'")

        return "\n".join(chain)

    def to_dict(self) -> dict:
        """Serialize graph for API response."""
        return {
            "nodes": [n.to_dict() for n in self.nodes.values()],
            "edges": [e.to_dict() for e in self.edges],
            "stats": {
                "total_nodes": len(self.nodes),
                "total_edges": len(self.edges),
                "node_types": dict(defaultdict(int, {n.type: sum(1 for x in self.nodes.values() if x.type == n.type) for n in self.nodes.values()})),
                "built": self._built,
                "build_timestamp": self._build_timestamp,
            }
        }


# ─── Singleton Instance ─────────────────────────────────────────────────────────

_graph = KnowledgeGraph()

def get_graph() -> KnowledgeGraph:
    return _graph

def rebuild_graph(production_schema: dict, drift_alerts: list,
                  feature_importances: list = None,
                  min_rebuild_interval: int = 60):
    """Rebuild the knowledge graph with fresh data. Skips if rebuilt recently."""
    if _graph._built and (time.time() - _graph._build_timestamp) < min_rebuild_interval:
        return _graph  # Skip — rebuilt recently
    _graph.build_from_system_state(production_schema, drift_alerts,
                                    feature_importances=feature_importances)
    return _graph
