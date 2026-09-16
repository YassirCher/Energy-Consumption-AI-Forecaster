# EcoForecaster: The Convergence of Data Science & AI Engineering

EcoForecaster is an enterprise-grade energy forecasting and MLOps observability platform. It represents a paradigm shift from traditional, isolated machine learning notebooks to a **self-monitoring, agent-augmented production system**.

By bridging **empirical Data Science rigor** (leakage-free causal time-series forecasting, gradient boosted trees, game-theoretic SHAP explainability, and statistical drift tracking) with **modern AI Engineering** (multi-agent autonomous orchestration, Graph RAG contextual enrichment, high-throughput Groq LLM inference, and real-time streaming telemetry), EcoForecaster provides automated operational intelligence for mission-critical power grids.

---

## Executive Summary: Bridging Two Disciplines

```mermaid
flowchart TB
    subgraph DS["Data Science Core"]
        A["Household Power Ingestion (2M+ rows)"] --> B["Causal Feature Engineering (24 features)"]
        B --> C["Gradient Boosted Trees (XGBoost / LightGBM)"]
        C --> D["Multi-Horizon Forecasts (+1m, +1h, +24h)"]
        C --> E["Game-Theoretic SHAP (TreeExplainer)"]
        A --> F["Distribution Drift (Jensen-Shannon)"]
    end

    subgraph AE["AI Engineering Architecture"]
        G["Graph RAG Knowledge Graph"]
        H["Multi-Agent Autonomous Mesh (5 Specialists)"]
        I["Groq LPU Inference Engine (Qwen 27B / GPT-OSS 20B)"]
        J["FastAPI Streaming Engine (SSE & JWT Auth)"]
        K["React 19 Executive Dashboard"]
    end

    DS -.->|"Telemetry & Metrics"| H
    DS -.->|"Model Metadata & Graph Nodes"| G
    G -->|"Context Injection"| H
    H -->|"Grounded Prompting"| I
    I -->|"Structured Interpretations"| J
    D -->|"Live Stream"| J
    J -->|"Real-Time Visuals"| K
```

| Dimension | Data Science Foundation | AI Engineering Enhancement |
| :--- | :--- | :--- |
| **Forecasting & Modeling** | Strict `causal_v2` multi-horizon pipeline (+1m, +1h, +24h), LightGBM/XGBoost with validation RMSE optimization ($R^2 = 0.944$). | Real-time SSE streaming, deterministic model bundling, schema validation via Pydantic, zero-downtime rollback endpoints. |
| **Model Explainability** | Game-theoretic SHAP (Shapley Additive exPlanations) via `TreeExplainer`, global contribution rankings, local waterfall breakdowns. | Automated LLM narrative synthesis converting numerical SHAP vectors into actionable human-readable grid advisory reports. |
| **Monitoring & Telemetry** | Jensen-Shannon divergence tracking across probability distributions; Isolation Forest & rolling Z-score anomaly detection. | Autonomous **Drift & Performance Agents** that evaluate statistical metrics in Python first, then synthesize root-cause diagnostic assessments. |
| **Operational Intelligence** | Static threshold alerts, CSV exportable logs, empirical model comparisons (XGBoost vs. LightGBM vs. Ridge). | **Graph RAG** combining models, metrics, and features into an interconnected knowledge graph, queried by an interactive AI Copilot. |

---

## 1. Production Operations & Command Center

The EcoForecaster Command Center provides a single pane of glass for real-time grid monitoring, model health telemetry, and live operational alerts.

![EcoForecaster Command Center](screenshots/01_overview.png)

### Key Capabilities & Architecture:
- **System Health Score (100%)**: Continuously synthesized from inference latency, model loading status, API error rates, and drift stability.
- **Production Model Accuracy**: Displays real-time test set evaluation metrics ($R^2 = 0.9443$, $\text{RMSE} = 0.2059\text{ kW}$) for the active model bundle (`EnergyForecaster_XGBoost_1_step`).
- **P99 Latency SLA (< 14 ms)**: High-speed async prediction pipeline executing well under the strict 200 ms production threshold.
- **Live Event Stream**: Server-Sent Events (SSE) pushing immediate notifications for data drift, parameter fluctuations, and anomaly detections.

---

## 2. Data Science: Real-Time Multi-Horizon Forecasting

Predicting energy demand requires balancing immediate micro-fluctuations with long-term macroeconomic load planning. EcoForecaster implements three distinct, specialized models trained on historical household electrical data.

![Real-Time Multi-Horizon Forecasting](screenshots/02_predictions.png)

### The `causal_v2` Leakage-Free Protocol:
- **T+1 Minute (Dispatch Horizon)**: High-frequency operational balancing. Achieves $R^2 = 0.9443$ and $\text{RMSE} = 0.2059\text{ kW}$ using real-time lag features and moving averages.
- **T+1 Hour (Tactical Horizon)**: Sub-station load planning. Achieves $R^2 = 0.3524$ and $\text{RMSE} = 0.7021\text{ kW}$.
- **T+24 Hours (Strategic Horizon)**: Day-ahead market bidding and battery storage scheduling. Achieves $R^2 = 0.2361$ and $\text{RMSE} = 0.7661\text{ kW}$.
- **Dynamic 95% Confidence Intervals**: Every inference point computes upper and lower uncertainty bounds based on empirical residual distributions.
- **Causal Feature Pipeline**: Uses 24 engineered features including cyclical Fourier-encoded hour/day harmonics, rolling volatility, and sub-metering ratios. Partitions are separated by horizon-sized purges to eliminate future data leakage.

---

## 3. AI Engineering: Multi-Agent Observability & Orchestration

EcoForecaster eliminates manual MLOps monitoring by deploying a **multi-agent autonomous mesh**. Rather than blindly passing raw prompts to an LLM, our architecture enforces a **metrics-first** discipline: each specialist agent calculates statistical truths deterministically in Python before engaging the LLM for synthesis.

![AI Multi-Agent Observability Mesh](screenshots/03_ai_agents.png)

### The Specialist Agent Team:
1. **Drift Analyst Agent**: Computes Jensen-Shannon divergence scores, breach frequency, and statistical drift acceleration across active features.
2. **Performance Analyst Agent**: Monitors active model $R^2$, RMSE degradation against historical baselines, and variance spikes.
3. **Feature Importance Agent**: Analyzes global tree split gains and SHAP values to detect feature reliance risks or sudden importance shifts.
4. **System Health Agent**: Verifies memory footprints, P99 inference latency against the 200 ms SLA, and multi-horizon bundle availability.
5. **Master Orchestrator Agent**: Executes all specialists concurrently, retrieves cross-cutting context via Graph RAG, and generates prioritized executive action items.

---

## 4. AI Engineering: Graph RAG & High-Throughput LLM Engine

To guarantee zero hallucination in industrial environments, EcoForecaster integrates a **Graph Retrieval-Augmented Generation (Graph RAG)** engine coupled with Groq's high-speed LPU inference service.

![AI System Architecture & Observability](screenshots/04_ai_system.png)

### Enterprise AI Engineering Features:
- **Contextual Knowledge Graph**: Maps relationships between `[Models] -> [Features] -> [Horizons] -> [Metrics] -> [Drift Alerts]`. Queries retrieve topological subgraphs ensuring complete factual grounding.
- **Groq LPU Acceleration**: Utilizes ultra-fast inference with `qwen/qwen3.8-27b` as the primary engine and `openai/gpt-oss-20b` as the automatic fallback.
- **Semantic Prompt Caching**: Reduces external API latency and token costs by over 80% for repeated operational states.
- **Deterministic Rule Fallback**: If LLM connectivity is interrupted, the system seamlessly degrades to deterministic rule-based heuristic summaries without failing downstream callers.
- **End-to-End Tracing**: Full latency breakdown, prompt token accounting, and module execution logs exposed directly in the dashboard.

---

## 5. Data Science: Jensen-Shannon Drift Intelligence

Time-series models in electrical systems degrade rapidly when consumer behaviors or appliance signatures shift. EcoForecaster implements continuous statistical distribution monitoring.

![Jensen-Shannon Drift Intelligence](screenshots/05_drift_intelligence.png)

### Drift Telemetry & Anomaly Detection:
- **Jensen-Shannon Divergence (JSD)**: Measures distribution shifts between baseline training data and rolling production inference windows. Symmetric, bounded $[0, 1]$, and numerically stable.
- **Feature-Level Granularity**: Individually isolates divergence on `Global_intensity`, `Voltage`, `Sub_metering_1` (Kitchen), `Sub_metering_2` (Laundry), and `Sub_metering_3` (HVAC).
- **Hybrid Anomaly Detection**: Combines rolling Z-score statistical bounds with an **Isolation Forest** ensemble to detect rapid voltage drops or anomalous power surges in real time.

---

## 6. Data Science: Model Explainability & SHAP Analysis

Black-box models are unacceptable in regulated infrastructure. EcoForecaster delivers both global feature importance and game-theoretic local explanations.

| Global Feature Importance | SHAP TreeExplainer Analysis |
| :---: | :---: |
| ![Global Feature Importance](screenshots/06_feature_importance.png) | ![SHAP TreeExplainer](screenshots/06_shap_explainability.png) |

### Transparent Decision Support:
- **Dominant Feature Attribution**: Identifies that `Global_intensity` accounts for ~97% of immediate active power variance due to physical Ohm's Law coupling ($P \approx V \cdot I$).
- **Game-Theoretic SHAP Values**: Uses `shap.TreeExplainer` to compute exact additive feature attributions for any given forecast timestamp.
- **AI Synthesis**: Automatically translates technical SHAP matrices into natural language summaries explaining *why* energy consumption peaked at a specific interval.

---

## 7. Interactive What-If Scenario Simulation

Grid operators need to evaluate how hypothetical demand responses affect overall load. The interactive What-If Scenario Simulator provides instant, real-time counterfactual analysis.

![Interactive Scenario Simulator](screenshots/07_scenario_simulator.png)

### Simulation Mechanics:
- **Dynamic Parameter Sliders**: Adjust electrical current (`Global_intensity`), reactive power (`Global_reactive_power`), mains voltage, and sub-metered appliance consumption.
- **Instantaneous Re-Inference**: Client inputs are dispatched to the backend model bundle via `POST /simulate`, calculating the predicted delta against baseline power consumption in milliseconds.
- **Demand Response Validation**: Allows operators to test load-shedding strategies (e.g., cutting HVAC sub-metering during peak tariff hours) and measure simulated savings.

---

## 8. Data Science: Multi-Model Benchmark & Comparison

Model selection in EcoForecaster is grounded in empirical comparison across diverse model families rather than theoretical assumptions.

![Model Benchmark & Comparison](screenshots/08_model_comparison.png)

### Benchmark Matrix:
- **XGBoost (Selected Champion)**: Superior handling of non-linear interactions and lag features; lowest validation RMSE ($0.2059\text{ kW}$).
- **LightGBM (Challenger)**: Fast histogram-based gradient boosting offering near-identical accuracy with 30% faster inference throughput.
- **Ridge Regression (Linear Baseline)**: Causal regularized linear baseline serving as the benchmark floor to guarantee that gradient boosting earns its deployment complexity.
- **Multi-Metric Radar Comparison**: Balances $R^2$, RMSE, MAE, inference speed, and memory usage in an interactive radar chart.

---

## 9. AI Engineering: Context-Aware AI Copilot

Operators can converse directly with the platform using an integrated AI Assistant that has immediate access to real-time system state, active alerts, and model telemetry.

![Context-Aware AI Assistant](screenshots/09_ai_assistant.png)

### Conversational MLOps Capabilities:
- **Telemetry-Grounded Dialogues**: Answers questions like: *"Why did the 1-hour forecast drop?"*, *"Explain the current drift alert on Voltage"*, or *"Is it safe to retrain the XGBoost model now?"*.
- **Role-Based Security**: Only authenticated viewers and administrators can access the assistant drawer, with all queries tracked in system audit logs.

---

## 10. Data Science: Interactive Data Explorer & Feature Distributions

Data science in production requires deep, continuous visibility into the underlying feature distributions powering the ML pipeline.

![Interactive Data Explorer](screenshots/10_data_explorer.png)

### Exploratory Data Analysis & Quality Gates:
- **Big Data Scale (2,075,259 Rows)**: Inspects the processed Parquet dataset spanning four years of high-frequency household electrical measurements.
- **25 Engineered Features**: Interactive filtering and selection across active power, reactive power, voltage, intensity, sub-metering circuits, cyclical time harmonics (`hour_sin`, `dow_cos`), and multi-horizon lag features.
- **Distribution Histograms**: Visualizes empirical distributions, bounds, and probability density functions for individual features, allowing operators to detect sensor outliers or skew.
- **Correlation Matrix**: Integrated Pearson and Spearman correlation heatmaps identifying collinearity patterns across energy sub-meters.

---

## 11. MLOps: Incident Management & Unified Alerts Center

Operating machine learning systems in production requires a single, unified operations hub for triage and alert management.

![Alerts Center Incident Management](screenshots/11_alerts_center.png)

### Operational Incident Tracking:
- **Categorized Event Aggregation**: Centralizes drift alerts, model retraining events, authentication notices, and system health status.
- **Severity Filtering**: Triage events by `CRITICAL`, `WARNING`, and `INFO` severity tiers.
- **Audit Logging**: Maintains a chronological trail of operational interventions, user logins, and automated pipeline executions.

---

## 12. Data Science: Performance Evolution & Degradation Tracking

Model performance is not static; tracking degradation over consecutive retraining cycles ensures that deployed models never regress.

![Model Performance Monitoring](screenshots/12_performance_monitoring.png)

### Longitudinal Metric Monitoring:
- **Historical Metric Tracking**: Records $R^2$, RMSE, and MAE across all historical training and retraining runs.
- **Automated Degradation Detection**: Flags models that fail to meet strict quality gates (e.g. $R^2 < 0.93$ floor or baseline degradation > 5%).
- **Healthy Operational Zones**: Highlights stable vs degraded operating intervals with target reference thresholds.

---

## 13. MLOps: A/B Model Canary Testing

Before fully promoting a challenger model to production, operators can conduct head-to-head canary comparisons.

![A/B Model Canary Testing](screenshots/13_ab_testing.png)

### Canary Evaluation Suite:
- **Head-to-Head Architecture**: Compares Model A (XGBoost) vs Model B (LightGBM) under identical test data splits.
- **Delta Analysis**: Real-time computation of $R^2$ differences (+0.000578), RMSE differences (-0.001072), and overall statistical advantage (+0.061%).
- **Multi-Dimensional Radar Analysis**: Balances Accuracy, Precision, and Inference Efficiency to determine the overall winner.

---

## 14. Operational Excellence: Executive System & Performance Reports

Automated documentation and executive reporting bridge the communication gap between technical data scientists and executive decision-makers.

![Executive System Report](screenshots/14_reports.png)

### Automated Audit & Reporting:
- **One-Click Generation**: Synthesizes a comprehensive performance audit covering model health, latency P99 (53.27 ms), and active schema details.
- **Feature Contribution Summary**: Highlights primary predictive drivers (`Global_intensity` at 97.0%) alongside sub-metering fractions.
- **AI Narrative Integration**: Incorporates multi-agent LLM insights directly into the executive summary for presentation-ready exports.
- **Export & Print**: Native support for print and PDF archiving for regulatory and operational compliance.

---

## Production Application Specifications

| Attribute | Specification |
| :--- | :--- |
| **Application Name** | EcoForecaster |
| **Release Version** | `5.1.0` |
| **Live Production URL** | [Azure Container Apps Instance](https://ca-ecoforecaster.prouddune-d60d19a6.spaincentral.azurecontainerapps.io) |
| **Hosting Infrastructure** | Azure Container Apps (ACA), Serverless Linux Containers |
| **Container Port** | `8000` (Internal), `443` (External TLS Termination) |
| **Model Registry** | MLflow Bundled Artifacts (Schema-Versioned `causal_v2`) |
| **Primary LLM Provider** | Groq Cloud LPU (`qwen/qwen3.8-27b` with `openai/gpt-oss-20b` fallback) |
| **Interactive API Specs** | Swagger UI (`/docs`) & ReDoc (`/redoc`) |

---

## Production Model Portfolio (`causal_v2`)

| Horizon | Selected Model Artifact | Test $R^2$ | Test RMSE | Test MAE | Baseline Lift |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **+1 Minute (T+1)** | `EnergyForecaster_XGBoost_1_step` | **0.944280** | **0.205886 kW** | 0.0887 kW | +34.2% vs Causal Baseline |
| **+1 Hour (T+60)** | `EnergyForecaster_XGBoost_1h` | **0.352402** | **0.702124 kW** | 0.4412 kW | +12.8% vs Causal Baseline |
| **+24 Hours (T+1440)**| `EnergyForecaster_XGBoost_24h` | **0.236101** | **0.766140 kW** | 0.5109 kW | +8.4% vs Causal Baseline |

---

## Key API Endpoints Reference

```text
Authentication
  POST   /auth/login              Authenticate credentials and receive JWT access token
  GET    /auth/me                 Validate current session and role permissions

Real-Time Forecasting & Simulation
  POST   /predict                 Execute multi-horizon inference (+1m, +1h, +24h)
  POST   /simulate                Run counterfactual what-if scenario parameter variations
  GET    /stream/events           SSE endpoint streaming live telemetry & predictions

Explainability & Model Diagnostics
  GET    /explain                 Fetch global feature importance and contribution ranking
  GET    /explain/shap/summary    Retrieve global TreeExplainer summary values
  POST   /explain/shap/local      Compute local Shapley values for an arbitrary sample point
  GET    /models/compare          Retrieve benchmark comparisons between models

Monitoring & System Telemetry
  GET    /system/health           Health probe, uptime, memory, and model bundle status
  GET    /metrics                 Prometheus-compatible performance telemetry
  GET    /alerts                  Active drift, anomaly, and latency alerts
  GET    /system/events           Historical event audit log

Autonomous AI & Graph RAG
  GET    /ai/agents/status        Live status, run counts, and durations for all 5 agents
  POST   /ai/agents/run           Trigger autonomous agent analysis execution
  GET    /ai/system/overview      Graph RAG metrics, Groq cache stats, and trace telemetry
  POST   /ai/chat                 Conversational AI copilot grounded in live MLOps data
  POST   /ai/explain-anomaly      Detailed root-cause analysis for specific detected anomalies

Model Governance & Operations
  POST   /retrain                 Trigger background retraining pipeline (Admin role required)
  POST   /models/rollback         Roll back active model bundle to previous stable version
```

---

## Security, Governance & Responsible AI

1. **Defense-in-Depth Authentication**: Protected routes require signed Bearer JWT tokens with 24-hour expiration. High-risk administrative endpoints (retraining, rollback) enforce explicit `admin` role authorization.
2. **Metrics Grounding**: LLMs are never allowed to hallucinate numerical performance data. All prompts are programmatically constructed by specialized Python agents using verified statistical computations.
3. **Data Privacy**: No private customer or grid payload data is transmitted outside the execution boundary. Only high-level statistical summaries (JSD divergence scores, aggregated Shapley values, and health metrics) are sent to the Groq inference service.
4. **Resilience & Rate Limiting**: All AI endpoints feature in-memory semantic caching, adaptive rate limiting, and an automated rule-based fallback mode to preserve platform stability during third-party provider outages.
