"""
Multi-Agent System — EcoForecaster v5.1
Specialized agents compute structured metrics FIRST, then use LLM for final reasoning only.
Full observability: status tracking, execution timing, and result history.
"""

import json
import time
import datetime
import numpy as np
import threading
from typing import Optional

from .llm_service import query_llm


# ─── Agent Registry (Observability) ────────────────────────────────────────────

class AgentRegistry:
    """Thread-safe registry tracking agent state for observability."""
    def __init__(self):
        self._agents: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._request_traces: list[dict] = []

    def register(self, name: str, role: str):
        with self._lock:
            self._agents[name] = {
                "name": name,
                "role": role,
                "status": "idle",
                "last_execution": None,
                "last_duration_ms": 0,
                "last_result": None,
                "last_input_summary": "",
                "execution_count": 0,
                "error_count": 0,
            }

    def set_running(self, name: str, input_summary: str = ""):
        with self._lock:
            if name in self._agents:
                self._agents[name]["status"] = "running"
                self._agents[name]["last_input_summary"] = input_summary

    def set_idle(self, name: str, duration_ms: float, result: dict):
        with self._lock:
            if name in self._agents:
                self._agents[name]["status"] = "idle"
                self._agents[name]["last_execution"] = datetime.datetime.now().isoformat()
                self._agents[name]["last_duration_ms"] = round(duration_ms, 1)
                # Store truncated result to avoid memory bloat
                result_copy = dict(result)
                if "analysis" in result_copy and len(str(result_copy["analysis"])) > 1000:
                    result_copy["analysis"] = str(result_copy["analysis"])[:1000] + "..."
                self._agents[name]["last_result"] = result_copy
                self._agents[name]["execution_count"] += 1

    def set_error(self, name: str, error: str, duration_ms: float):
        with self._lock:
            if name in self._agents:
                self._agents[name]["status"] = "error"
                self._agents[name]["last_execution"] = datetime.datetime.now().isoformat()
                self._agents[name]["last_duration_ms"] = round(duration_ms, 1)
                self._agents[name]["last_result"] = {"error": error}
                self._agents[name]["error_count"] += 1

    def get_all_statuses(self) -> list[dict]:
        with self._lock:
            return [dict(v) for v in self._agents.values()]

    def get_agent_status(self, name: str) -> dict | None:
        with self._lock:
            return dict(self._agents[name]) if name in self._agents else None

    def add_trace(self, trace: dict):
        with self._lock:
            self._request_traces.append(trace)
            if len(self._request_traces) > 50:
                self._request_traces = self._request_traces[-50:]

    def get_traces(self, limit: int = 20) -> list[dict]:
        with self._lock:
            return list(self._request_traces[-limit:])

# Singleton registry
agent_registry = AgentRegistry()


# ─── Base Agent ─────────────────────────────────────────────────────────────────

class BaseAgent:
    """Base class for all analyst agents. Computes structured metrics first, LLM for reasoning."""
    name: str = "BaseAgent"
    role: str = "analyst"

    def __init__(self):
        agent_registry.register(self.name, self.role)

    def compute_metrics(self, data: dict) -> dict:
        """Compute structured metrics from raw data. Override in subclasses."""
        raise NotImplementedError

    def prepare_context(self, data: dict) -> str:
        """Prepare context string for LLM. Override in subclasses."""
        raise NotImplementedError

    def analyze(self, data: dict) -> dict:
        """Run analysis: compute metrics first, then LLM reasoning."""
        t0 = time.perf_counter()
        agent_registry.set_running(self.name)

        try:
            # Step 1: Compute structured metrics (no LLM)
            metrics = self.compute_metrics(data)
            if not metrics:
                result = {
                    "agent": self.name,
                    "status": "no_data",
                    "analysis": "Insufficient data for analysis.",
                    "structured_metrics": {},
                }
                elapsed = (time.perf_counter() - t0) * 1000
                agent_registry.set_idle(self.name, elapsed, result)
                return result

            # Step 2: Build context from structured metrics
            context = self.prepare_context(data)

            # Step 3: LLM reasoning on pre-computed metrics
            prompt = f"""You are the {self.name} for an energy consumption forecasting platform.
You have been given PRE-COMPUTED structured metrics. Use them to provide:
1. A concise summary (2-3 sentences)
2. Key findings (bullet points)
3. Risk level: LOW / MEDIUM / HIGH / CRITICAL
4. Recommended actions (if any)

PRE-COMPUTED METRICS:
{json.dumps(metrics, indent=2, default=str)}

RAW CONTEXT:
{context}

Be specific with numbers. Reference actual values from the metrics."""

            llm_response = query_llm(prompt, max_tokens=512, cache_ttl=180)
            elapsed = (time.perf_counter() - t0) * 1000

            result = {
                "agent": self.name,
                "status": "success",
                "analysis": llm_response,
                "structured_metrics": metrics,
                "duration_ms": round(elapsed, 1),
            }
            agent_registry.set_idle(self.name, elapsed, result)
            return result

        except Exception as e:
            elapsed = (time.perf_counter() - t0) * 1000
            error_msg = str(e)
            agent_registry.set_error(self.name, error_msg, elapsed)

            # Return structured metrics even if LLM fails
            try:
                metrics = self.compute_metrics(data)
            except Exception:
                metrics = {}

            return {
                "agent": self.name,
                "status": "partial",
                "analysis": f"LLM unavailable — showing computed metrics only. Error: {error_msg[:100]}",
                "structured_metrics": metrics,
                "duration_ms": round(elapsed, 1),
            }


# ─── Drift Analyst Agent ───────────────────────────────────────────────────────

class DriftAnalystAgent(BaseAgent):
    name = "Drift Analyst Agent"
    role = "drift_analyst"

    def compute_metrics(self, data: dict) -> dict:
        drift_alerts = data.get("drift_alerts", [])
        if not drift_alerts:
            return {}

        recent = drift_alerts[-15:]
        js_values = [a.get("js_divergence", 0) for a in recent]
        breaches = [a for a in recent if a.get("is_breach")]

        # Compute drift slope (trend)
        slope = 0.0
        if len(js_values) >= 4:
            mid = len(js_values) // 2
            first_half_avg = float(np.mean(js_values[:mid]))
            second_half_avg = float(np.mean(js_values[mid:]))
            slope = second_half_avg - first_half_avg
            trend = "INCREASING" if second_half_avg > first_half_avg * 1.1 else (
                "DECREASING" if second_half_avg < first_half_avg * 0.9 else "STABLE"
            )
        else:
            trend = "INSUFFICIENT_DATA"
            first_half_avg = second_half_avg = 0.0

        threshold = recent[0].get('threshold', 0.15) if recent else 0.15

        return {
            "total_observations": len(drift_alerts),
            "window_size": len(recent),
            "js_min": round(float(min(js_values)), 4),
            "js_max": round(float(max(js_values)), 4),
            "js_mean": round(float(np.mean(js_values)), 4),
            "js_std": round(float(np.std(js_values)), 4),
            "js_latest": round(float(js_values[-1]), 4),
            "latest_is_breach": bool(recent[-1].get("is_breach")),
            "threshold": threshold,
            "breaches_in_window": len(breaches),
            "breach_rate": round(len(breaches) / len(recent) * 100, 1),
            "trend": trend,
            "slope": round(slope, 6),
            "first_half_avg": round(first_half_avg, 4),
            "second_half_avg": round(second_half_avg, 4),
            "max_consecutive": max((a.get('consecutive', 0) for a in recent), default=0),
            "risk_level": "CRITICAL" if len(breaches) >= 5 else ("HIGH" if len(breaches) >= 3 else ("MEDIUM" if len(breaches) >= 1 else "LOW")),
        }

    def prepare_context(self, data: dict) -> str:
        m = self.compute_metrics(data)
        if not m:
            return ""
        return f"""DRIFT MONITORING DATA:
- Total observations: {m['total_observations']}
- Recent window: {m['window_size']} observations
- JS divergence range: [{m['js_min']} — {m['js_max']}]
- Mean JS: {m['js_mean']}, Std: {m['js_std']}
- Threshold: {m['threshold']}
- Breaches: {m['breaches_in_window']}/{m['window_size']} ({m['breach_rate']}%)
- Trend: {m['trend']} (slope: {m['slope']})
- Most recent JS: {m['js_latest']} ({'BREACH' if m['latest_is_breach'] else 'OK'})
- Risk: {m['risk_level']}"""


# ─── Performance Analyst Agent ──────────────────────────────────────────────────

class PerformanceAnalystAgent(BaseAgent):
    name = "Performance Analyst Agent"
    role = "performance_analyst"

    def compute_metrics(self, data: dict) -> dict:
        metrics = data.get("metrics", {})
        history = data.get("metrics_history", [])

        r2 = metrics.get("R2")
        rmse = metrics.get("RMSE")
        model = metrics.get("Active_Model", "unknown")

        if r2 is None:
            return {}

        result = {
            "active_model": model,
            "current_r2": round(float(r2), 6),
            "current_rmse": round(float(rmse), 6) if rmse else None,
            "performance_threshold": 0.98,
            "status": "OPTIMAL" if r2 > 0.995 else ("GOOD" if r2 > 0.98 else "DEGRADED"),
            "is_degraded": r2 < 0.98,
            "r2_gap_from_threshold": round(float(r2 - 0.98), 6),
        }

        if history:
            r2_values = [h.get("r2", 0) for h in history if h.get("r2")]
            if r2_values:
                result["training_runs"] = len(history)
                result["r2_min"] = round(min(r2_values), 4)
                result["r2_max"] = round(max(r2_values), 4)
                result["r2_trend"] = "IMPROVING" if len(r2_values) > 1 and r2_values[-1] > r2_values[-2] else "STABLE_OR_DECLINING"
                result["best_r2"] = round(max(r2_values), 4)
                result["r2_volatility"] = round(float(np.std(r2_values)), 6)

        result["risk_level"] = "CRITICAL" if r2 < 0.95 else ("HIGH" if r2 < 0.98 else ("LOW" if r2 > 0.995 else "MEDIUM"))
        return result

    def prepare_context(self, data: dict) -> str:
        m = self.compute_metrics(data)
        if not m:
            return ""
        ctx = f"""MODEL PERFORMANCE DATA:
- Active model: {m['active_model']}
- Current R²: {m['current_r2']}
- Current RMSE: {m.get('current_rmse', 'N/A')}
- Status: {m['status']}
- Risk: {m['risk_level']}"""
        if "training_runs" in m:
            ctx += f"""
- Training runs: {m['training_runs']}
- R² range: [{m['r2_min']} — {m['r2_max']}]
- R² trend: {m['r2_trend']}"""
        return ctx


# ─── Feature Importance Agent ───────────────────────────────────────────────────

class FeatureImportanceAgent(BaseAgent):
    name = "Feature Importance Agent"
    role = "feature_analyst"

    def compute_metrics(self, data: dict) -> dict:
        importances = data.get("feature_importances", [])
        if not importances:
            return {}

        top = importances[0]
        top3_pct = sum(f["importance"] for f in importances[:3]) * 100
        top5_pct = sum(f["importance"] for f in importances[:5]) * 100
        all_imps = [f["importance"] for f in importances]

        return {
            "total_features": len(importances),
            "top_feature": top["feature"],
            "top_feature_importance": round(top["importance"] * 100, 1),
            "top_3_concentration": round(top3_pct, 1),
            "top_5_concentration": round(top5_pct, 1),
            "single_feature_dominance": top["importance"] > 0.5,
            "feature_diversity": "LOW" if top3_pct > 80 else ("MODERATE" if top3_pct > 60 else "HIGH"),
            "importance_std": round(float(np.std(all_imps)) * 100, 2),
            "top_8": [{"feature": f["feature"], "pct": round(f["importance"] * 100, 1)} for f in importances[:8]],
            "risk_level": "HIGH" if top["importance"] > 0.6 else ("MEDIUM" if top["importance"] > 0.4 else "LOW"),
        }

    def prepare_context(self, data: dict) -> str:
        m = self.compute_metrics(data)
        if not m:
            return ""
        features_str = "\n".join([f"  {i+1}. {f['feature']}: {f['pct']}%" for i, f in enumerate(m['top_8'])])
        return f"""FEATURE IMPORTANCE DATA:
{features_str}

CONCENTRATION:
- Top feature: {m['top_feature']} at {m['top_feature_importance']}%
- Top 3: {m['top_3_concentration']}%
- Top 5: {m['top_5_concentration']}%
- Diversity: {m['feature_diversity']}
- Risk: {m['risk_level']}"""


# ─── System Health Agent ───────────────────────────────────────────────────────

class SystemHealthAgent(BaseAgent):
    name = "System Health Agent"
    role = "system_health"

    def compute_metrics(self, data: dict) -> dict:
        health = data.get("health", {})
        if not health:
            return {}

        score = health.get('health_score', 0)
        latency = health.get('latency_p99_ms', 0)
        models_loaded = health.get('models_loaded', {})

        return {
            "health_score": score,
            "status": health.get('status', 'unknown'),
            "p99_latency_ms": round(latency, 1),
            "latency_sla_200ms": latency < 200,
            "active_model": health.get('active_model', 'none'),
            "models_loaded": {
                "base": models_loaded.get('base', False),
                "1h": models_loaded.get('1h', False),
                "24h": models_loaded.get('24h', False),
            },
            "all_models_healthy": all(models_loaded.get(k, False) for k in ['base', '1h', '24h']),
            "risk_level": "CRITICAL" if score < 50 else ("HIGH" if score < 70 else ("MEDIUM" if score < 85 else "LOW")),
        }

    def prepare_context(self, data: dict) -> str:
        m = self.compute_metrics(data)
        if not m:
            return ""
        return f"""SYSTEM HEALTH DATA:
- Health score: {m['health_score']}/100
- Status: {m['status']}
- P99 latency: {m['p99_latency_ms']}ms (SLA: {'WITHIN' if m['latency_sla_200ms'] else 'EXCEEDS'})
- Active model: {m['active_model']}
- All models loaded: {m['all_models_healthy']}
- Risk: {m['risk_level']}"""


# ─── Orchestrator Agent ─────────────────────────────────────────────────────────

class OrchestratorAgent:
    """
    Aggregates all agent analyses and produces final synthesized insights
    via LLM reasoning on pre-computed structured metrics.
    """
    name = "Orchestrator"

    def __init__(self):
        self.agents = [
            DriftAnalystAgent(),
            PerformanceAnalystAgent(),
            FeatureImportanceAgent(),
            SystemHealthAgent(),
        ]
        agent_registry.register(self.name, "orchestrator")

    def run_all_agents(self, system_data: dict) -> list[dict]:
        """Run all agents and collect their results."""
        results = []
        for agent in self.agents:
            try:
                result = agent.analyze(system_data)
                results.append(result)
            except Exception as e:
                results.append({
                    "agent": agent.name,
                    "status": "error",
                    "analysis": f"Agent error: {str(e)}",
                    "structured_metrics": {},
                })
        return results

    def synthesize(self, system_data: dict, graph_context: str = "") -> dict:
        """
        Run all agents, then synthesize their outputs into final insights.
        Agents compute structured metrics first, orchestrator uses LLM for final synthesis only.
        """
        t0 = time.perf_counter()
        agent_registry.set_running(self.name, "Full system synthesis")

        trace = {
            "timestamp": datetime.datetime.now().isoformat(),
            "type": "synthesis",
            "modules_used": ["drift_detector", "performance", "features", "health", "graph_rag", "llm"],
            "agents_invoked": [],
            "steps": [],
        }

        try:
            # Step 1: Run individual agents (structured metrics computed inside)
            step_t0 = time.perf_counter()
            agent_results = self.run_all_agents(system_data)
            trace["steps"].append({
                "name": "agent_execution",
                "duration_ms": round((time.perf_counter() - step_t0) * 1000, 1),
                "agents_count": len(agent_results),
            })
            trace["agents_invoked"] = [r["agent"] for r in agent_results]

            # Step 2: Collect structured metrics from all agents
            all_metrics = {}
            agent_summaries = []
            for r in agent_results:
                all_metrics[r["agent"]] = r.get("structured_metrics", {})
                if r.get("status") in ("success", "partial"):
                    agent_summaries.append(f"--- {r['agent']} ---\n{r['analysis']}")

            if not agent_summaries:
                elapsed = (time.perf_counter() - t0) * 1000
                agent_registry.set_idle(self.name, elapsed, {"status": "no_data"})
                return {
                    "insights": [{
                        "type": "system", "severity": "info",
                        "title": "System Initializing",
                        "message": "Agents are collecting data. Insights will appear as more telemetry becomes available.",
                        "source": "orchestrator"
                    }],
                    "agent_results": agent_results,
                    "generated_by": "orchestrator",
                }

            # Step 3: Final LLM synthesis using structured metrics
            step_t0 = time.perf_counter()
            synthesis_prompt = f"""You are the Lead AI Analyst for an energy consumption forecasting MLOps platform called EcoForecaster.

Multiple specialist agents have computed structured metrics and analysed different system aspects.

STRUCTURED METRICS (pre-computed, factual):
{json.dumps(all_metrics, indent=2, default=str)}

AGENT ANALYSES:
{chr(10).join(agent_summaries)}

{f"KNOWLEDGE GRAPH CONTEXT:{chr(10)}{graph_context}" if graph_context else ""}

Based on ALL metrics and analyses, produce a JSON array of 3-5 actionable insights. Each insight must have:
- "type": one of "drift", "performance", "features", "latency", "system"
- "severity": one of "info", "warning", "critical"
- "title": short title (max 8 words)
- "message": detailed explanation (2-3 sentences) with specific numbers from the metrics.
- "actionable": true/false
- "action": if actionable, one of "retrain", "optimize", "investigate", "monitor"

IMPORTANT: Reference actual computed metric values (R², JS divergence, breach counts, etc.).
Respond ONLY with the JSON array, no other text."""

            raw_response = query_llm(synthesis_prompt,
                system_prompt="You are an expert MLOps analyst. Respond ONLY with a valid JSON array.",
                max_tokens=1024,
                temperature=0.4,
                cache_ttl=120,
            )

            trace["steps"].append({
                "name": "llm_synthesis",
                "duration_ms": round((time.perf_counter() - step_t0) * 1000, 1),
            })

            # Parse the response
            try:
                cleaned = raw_response
                if "```json" in cleaned:
                    cleaned = cleaned.split("```json")[1].split("```")[0]
                elif "```" in cleaned:
                    cleaned = cleaned.split("```")[1].split("```")[0]
                start = cleaned.find("[")
                end = cleaned.rfind("]") + 1
                if start >= 0 and end > start:
                    insights = json.loads(cleaned[start:end])
                else:
                    insights = json.loads(cleaned.strip())
            except (json.JSONDecodeError, ValueError):
                insights = [{
                    "type": "system", "severity": "info",
                    "title": "AI Analysis Complete",
                    "message": raw_response[:500],
                    "actionable": False, "source": "orchestrator"
                }]

            for ins in insights:
                ins["source"] = "llm_orchestrator"

            elapsed = (time.perf_counter() - t0) * 1000
            trace["total_duration_ms"] = round(elapsed, 1)
            agent_registry.add_trace(trace)
            agent_registry.set_idle(self.name, elapsed, {"insights_count": len(insights)})

            return {
                "insights": insights,
                "agent_results": agent_results,
                "generated_by": "llm_orchestrator",
                "structured_metrics": all_metrics,
            }

        except Exception as e:
            elapsed = (time.perf_counter() - t0) * 1000
            agent_registry.set_error(self.name, str(e), elapsed)
            trace["error"] = str(e)
            trace["total_duration_ms"] = round(elapsed, 1)
            agent_registry.add_trace(trace)
            raise


# ─── Chat Agent ────────────────────────────────────────────────────────────────

class ChatAgent:
    """
    Handles freeform user questions about the system.
    Routes through relevant agents and graph context for informed answers.
    """

    def answer(self, question: str, system_data: dict, graph_context: str = "") -> dict:
        t0 = time.perf_counter()

        # Build structured system summary (no LLM needed for this)
        r2 = system_data.get('metrics', {}).get('R2', 'N/A')
        rmse = system_data.get('metrics', {}).get('RMSE', 'N/A')
        model = system_data.get('metrics', {}).get('Active_Model', 'unknown')
        health = system_data.get('health', {})
        drift = system_data.get('drift_summary', {})
        features = system_data.get('feature_importances', [])[:5]

        prompt = f"""You are EcoForecaster AI Assistant — an expert energy forecasting platform analyst.

A user is asking about the system. Use the provided context to give a specific, data-driven answer.

USER QUESTION: {question}

SYSTEM STATE:
- Active model: {model}
- R²: {r2}
- RMSE: {rmse}
- Health score: {health.get('health_score', 'N/A')}
- P99 latency: {health.get('latency_p99_ms', 'N/A')}ms

{f"KNOWLEDGE GRAPH:{chr(10)}{graph_context}" if graph_context else ""}

DRIFT STATUS:
{json.dumps(drift, indent=2, default=str)}

FEATURE IMPORTANCES (top 5):
{json.dumps(features, indent=2, default=str)}

Respond clearly and concisely. Reference specific numbers from the data. If the question is about recommendations, provide actionable steps."""

        response = query_llm(prompt, max_tokens=768, temperature=0.6, cache_ttl=60)
        elapsed = (time.perf_counter() - t0) * 1000

        # Record trace
        agent_registry.add_trace({
            "timestamp": datetime.datetime.now().isoformat(),
            "type": "chat",
            "question": question[:200],
            "modules_used": ["metrics", "health", "drift", "features", "graph_rag", "llm"],
            "agents_invoked": ["ChatAgent"],
            "total_duration_ms": round(elapsed, 1),
            "steps": [
                {"name": "context_build", "duration_ms": 0},
                {"name": "llm_query", "duration_ms": round(elapsed, 1)},
            ]
        })

        reasoning = None
        if "[[REASONING_START]]" in response:
            try:
                parts = response.split("[[REASONING_END]]")
                reasoning = parts[0].replace("[[REASONING_START]]", "").strip()
                response = parts[1].strip()
            except Exception:
                pass

        return {
            "question": question,
            "answer": response,
            "reasoning": reasoning,
            "source": "ai_assistant",
            "agents_used": ["ChatAgent"],
            "modules_used": ["metrics", "health", "drift", "features", "graph_rag", "llm"],
            "duration_ms": round(elapsed, 1),
        }


class AnomalyExplainerAgent:
    """Explains specific anomalies using LLM reasoning."""

    def explain(self, anomaly_data: dict, system_data: dict, graph_context: str = "") -> dict:
        t0 = time.perf_counter()

        prompt = f"""You are an anomaly detection specialist for an energy consumption forecasting system.

An anomaly was detected in a prediction. Analyze it and provide:
1. What likely caused this anomaly
2. Whether it's a true anomaly or a false positive
3. Recommended action

ANOMALY DATA:
- Prediction value: {anomaly_data.get('value', 'N/A')}
- Anomaly score: {anomaly_data.get('anomaly_score', 'N/A')}
- Detection method: {anomaly_data.get('method', 'N/A')}
- Z-score: {anomaly_data.get('z_score', 'N/A')}
- Timestamp: {anomaly_data.get('timestamp', 'N/A')}

SYSTEM CONTEXT:
- Active model: {system_data.get('metrics', {}).get('Active_Model', 'unknown')}
- Current R²: {system_data.get('metrics', {}).get('R2', 'N/A')}
{f"KNOWLEDGE GRAPH:{chr(10)}{graph_context}" if graph_context else ""}

Provide a clear, concise explanation (3-5 sentences)."""

        response = query_llm(prompt, max_tokens=512, temperature=0.5, cache_ttl=60)
        elapsed = (time.perf_counter() - t0) * 1000

        agent_registry.add_trace({
            "timestamp": datetime.datetime.now().isoformat(),
            "type": "anomaly_explain",
            "modules_used": ["anomaly_detector", "llm", "graph_rag"],
            "agents_invoked": ["AnomalyExplainerAgent"],
            "total_duration_ms": round(elapsed, 1),
            "steps": [{"name": "llm_explain", "duration_ms": round(elapsed, 1)}],
        })

        return {
            "anomaly": anomaly_data,
            "explanation": response,
            "source": "anomaly_explainer",
            "duration_ms": round(elapsed, 1),
        }


# ─── Singleton Instances ────────────────────────────────────────────────────────

orchestrator = OrchestratorAgent()
chat_agent = ChatAgent()
anomaly_explainer = AnomalyExplainerAgent()
