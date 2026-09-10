# EcoForecaster application reference

## Production application

| Item | Value |
| --- | --- |
| Application | EcoForecaster |
| Version | 5.1.0 |
| Live URL | <https://ca-ecoforecaster.prouddune-d60d19a6.spaincentral.azurecontainerapps.io> |
| Health endpoint | `/system/health` |
| API documentation | `/docs` |
| Hosting | Azure Container Apps |
| Region | Spain Central |
| Container port | `8000` |
| Scaling | Zero to one replica |

The endpoint is public over HTTPS, but application access is authenticated. Credentials and service API keys are maintained outside the repository.

## What the app does

EcoForecaster turns household electrical measurements and time-derived features into energy forecasts and operational intelligence. It presents the model outputs through a single-page dashboard backed by a FastAPI service.

### Forecasting

- Predicts `Global_active_power` for the current step, one hour ahead, and 24 hours ahead.
- Uses 24 electrical, lag, hour-cycle, and day-of-week features.
- Loads three bundled MLflow model artifacts for deterministic container startup.
- Falls back to a local MLflow registry during development when bundled artifacts are unavailable.

### Monitoring and explainability

- System health score and P99 inference latency
- Model performance history and comparison
- Jensen-Shannon drift alerts
- Isolation Forest and rolling Z-score anomaly signals
- Feature importance and SHAP global/local explanations
- Event timeline, reports, and CSV exports

### AI assistance

- Context-enriched chat and anomaly explanations
- Four specialist analysis agents plus an orchestrator
- Graph RAG context over models, features, metrics, and drift signals
- Request caching, rate limiting, and a configured model fallback

AI calls can send selected model metrics, feature importance, health, and drift context to the configured Groq service. Operators should review their data-governance requirements before enabling or invoking these features.

## Model portfolio

The committed production schema identifies LightGBM as the active architecture.

| Horizon | Registered model | Saved validation R² |
| --- | --- | ---: |
| Current step | `EnergyForecaster_LightGBM` | 0.998858 |
| +1 hour | `EnergyForecaster_LightGBM_1h` | 0.324042 |
| +24 hours | `EnergyForecaster_LightGBM_24h` | 0.230698 |

The saved current-step RMSE is `0.030261`. These values describe the committed training snapshot and are not a guarantee of future production accuracy. The data window recorded in the schema spans December 2006 through November 2010.

## Access model

| Role | Intended access |
| --- | --- |
| Viewer | Dashboard analytics, forecasts, explanations, and authenticated AI features |
| Admin | Viewer capabilities plus protected retraining and rollback operations |

JWT access tokens expire after 24 hours. Production startup fails if the JWT secret or either seeded account password is missing.

## Key API routes

| Area | Routes |
| --- | --- |
| Service | `GET /system/health`, `GET /metrics`, `GET /stream/events` |
| Authentication | `POST /auth/login`, `GET /auth/me` |
| Forecasting | `POST /predict`, `POST /simulate` |
| Explainability | `GET /explain`, `GET /explain/shap/summary`, `POST /explain/shap/local` |
| Monitoring | `GET /alerts`, `GET /system/events`, `GET /models/compare` |
| Operations | `POST /retrain`, `POST /models/rollback` |
| AI | `GET /insights`, `POST /ai/chat`, `POST /ai/explain-anomaly`, `/ai/agents/*`, `/ai/system/*` |

The OpenAPI interface at `/docs` is the source of truth for request and response schemas.

## Runtime behavior

- The React frontend and FastAPI API are served from one origin.
- SQLite files contain ephemeral runtime state inside the container and are excluded from the image build context and Git.
- A scale-from-zero request can experience a cold start.
- Retraining expects processed Parquet data and a writable local MLflow setup; the production image primarily serves the bundled model snapshot.
- The in-memory cache, prediction history, rate limiter, and generated runtime state reset when a new container revision starts.

## Limitations

- The dataset is historical household power-consumption data; results may not generalize to another building, climate, tariff, or sensor setup.
- The one-hour and 24-hour models are materially less accurate than the current-step model in the saved validation snapshot.
- This project is suitable for demonstration, learning, and decision support. It is not a utility billing, grid-control, or safety system.
- LLM responses may be incomplete or incorrect and should be verified against the underlying model metrics.
