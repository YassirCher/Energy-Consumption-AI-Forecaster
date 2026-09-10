import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:8000');
export const STREAM_URL = `${API_BASE_URL}/stream/events`;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

// Longer timeout instance for AI endpoints
const aiApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 45000,
});

// Apply auth interceptor to both instances
[api, aiApi].forEach(instance => {
  instance.interceptors.request.use((config) => {
    const token = localStorage.getItem('ecoforecaster-token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        const path = error.config?.url;
        if (path && !path.includes('/auth/')) {
          localStorage.removeItem('ecoforecaster-token');
          localStorage.removeItem('ecoforecaster-user');
        }
      }
      return Promise.reject(error);
    }
  );
});



// ─── Auth Endpoints ────────────────────────────────────────────────────────────

export const login = async (username, password) => {
  const res = await api.post('/auth/login', { username, password });
  const { access_token, user } = res.data;
  localStorage.setItem('ecoforecaster-token', access_token);
  localStorage.setItem('ecoforecaster-user', JSON.stringify(user));
  return res.data;
};

export const getMe = async () => (await api.get('/auth/me')).data;

export const logout = () => {
  localStorage.removeItem('ecoforecaster-token');
  localStorage.removeItem('ecoforecaster-user');
};

// ─── Core Endpoints ────────────────────────────────────────────────────────────

export const fetchHealth = async () => (await api.get('/system/health')).data;
export const fetchMetrics = async () => (await api.get('/metrics')).data;
export const fetchMetricsHistory = async () => (await api.get('/metrics/history')).data;
export const fetchExplainability = async () => (await api.get('/explain')).data;
export const fetchDataStats = async () => (await api.get('/data/stats')).data;
export const fetchAlerts = async () => (await api.get('/alerts')).data;
export const fetchEvents = async () => (await api.get('/system/events')).data;

// ─── Analytics Endpoints ───────────────────────────────────────────────────────

export const fetchModelsCompare = async () => (await api.get('/models/compare')).data;
export const fetchInsights = async () => (await api.get('/insights')).data;
export const fetchPerformanceTimeline = async () => (await api.get('/metrics/performance-timeline')).data;
export const fetchExplainHistory = async () => (await api.get('/explain/history')).data;

// ─── Actions ───────────────────────────────────────────────────────────────────

export const triggerRetrain = async () => (await api.post('/retrain')).data;
export const triggerRollback = async () => (await api.post('/models/rollback')).data;
export const submitPrediction = async (features) => (await api.post('/predict', { features })).data;

// ─── AI / LLM Endpoints ───────────────────────────────────────────────────────

export const askAI = async (question) => (await aiApi.post('/ai/chat', { question })).data;
export const explainAnomaly = async (anomalyData) => (await aiApi.post('/ai/explain-anomaly', anomalyData)).data;

// ─── SHAP Endpoints ───────────────────────────────────────────────────────────

export const fetchShapSummary = async () => (await api.get('/explain/shap/summary')).data;
export const fetchShapLocal = async (features) => (await api.post('/explain/shap/local', features)).data;

// ─── A/B Testing ──────────────────────────────────────────────────────────────

export const fetchABTest = async () => (await api.get('/models/ab-test')).data;

// ─── Graph RAG ────────────────────────────────────────────────────────────────

export const fetchGraph = async () => (await api.get('/graph')).data;

// ─── Agents Observability ─────────────────────────────────────────────────────

export const fetchAgentsStatus = async () => (await api.get('/ai/agents/status')).data;
export const triggerAgentRun = async (agentName) => (await aiApi.post('/ai/agents/run/' + encodeURIComponent(agentName))).data;

// ─── AI System / MCP ──────────────────────────────────────────────────────────

export const fetchAISystemInfo = async () => (await api.get('/ai/system/info')).data;
export const fetchSystemTraces = async (limit = 20) => (await api.get(`/ai/system/traces?limit=${limit}`)).data;

// ─── Scenario Simulation ──────────────────────────────────────────────────────

export const simulatePrediction = async (baseline, modified) =>
  (await api.post('/simulate', { baseline, modified })).data;
export const fetchSimulationDefaults = async () => (await api.get('/simulate/defaults')).data;

// ─── Report Generation ────────────────────────────────────────────────────────

export const generateReport = async () => (await api.get('/report/generate')).data;

// ─── Export Functions ─────────────────────────────────────────────────────────

const downloadCSV = async (url, filename) => {
  const response = await api.get(url, { responseType: 'blob' });
  const blob = new Blob([response.data], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

export const exportPredictions = () => downloadCSV('/export/predictions', `predictions_${Date.now()}.csv`);
export const exportAlerts = () => downloadCSV('/export/alerts', `alerts_${Date.now()}.csv`);
export const exportMetrics = () => downloadCSV('/export/metrics', `metrics_${Date.now()}.csv`);

export default api;
