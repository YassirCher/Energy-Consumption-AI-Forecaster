"""
LLM Service Layer — EcoForecaster v5.1
Integrates Groq API with model fallback, caching, and robust error handling.
"""

import os
import time
import json
import re
import hashlib
import threading
from groq import Groq

# ─── Configuration ──────────────────────────────────────────────────────────────

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_PROJECT_ROOT = os.path.dirname(_BASE_DIR)

PRIMARY_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
FALLBACK_MODEL = os.environ.get("GROQ_FALLBACK_MODEL", "qwen-2.5-32b")

def _load_api_key() -> str:
    # Check env first
    env_key = os.environ.get("GROQ_API_KEY")
    if env_key:
        return env_key
    key_path = os.path.join(_PROJECT_ROOT, "groq_api_key.txt")
    if not os.path.exists(key_path):
        raise FileNotFoundError(f"Groq API key file not found at {key_path}")
    with open(key_path, "r") as f:
        content = f.read().strip()
    # Handle format: groq_api_key = "gsk_..."
    if "=" in content:
        content = content.split("=", 1)[1].strip().strip('"').strip("'")
    return content

# Lazy-init client
_client = None

def _get_client() -> Groq:
    global _client
    if _client is None:
        api_key = _load_api_key()
        _client = Groq(api_key=api_key)
    return _client


# ─── LLM Response Cache ─────────────────────────────────────────────────────────

class LLMCache:
    """Thread-safe cache for LLM responses to avoid duplicate API calls."""
    def __init__(self, max_entries: int = 200):
        self._store: dict[str, tuple] = {}
        self._lock = threading.Lock()
        self.max_entries = max_entries
        self.hits = 0
        self.misses = 0

    def _hash_key(self, prompt: str, system_prompt: str, model: str) -> str:
        raw = f"{model}|{system_prompt}|{prompt}"
        return hashlib.md5(raw.encode()).hexdigest()

    def get(self, prompt: str, system_prompt: str, model: str, ttl: int = 120) -> str | None:
        key = self._hash_key(prompt, system_prompt, model)
        with self._lock:
            if key in self._store:
                val, ts = self._store[key]
                if time.time() - ts < ttl:
                    self.hits += 1
                    return val
                del self._store[key]
            self.misses += 1
        return None

    def set(self, prompt: str, system_prompt: str, model: str, value: str):
        key = self._hash_key(prompt, system_prompt, model)
        with self._lock:
            # Evict oldest if at capacity
            if len(self._store) >= self.max_entries:
                oldest_key = min(self._store, key=lambda k: self._store[k][1])
                del self._store[oldest_key]
            self._store[key] = (value, time.time())

    def stats(self) -> dict:
        with self._lock:
            total = self.hits + self.misses
            return {
                "entries": len(self._store),
                "hits": self.hits,
                "misses": self.misses,
                "hit_rate": round(self.hits / total * 100, 1) if total > 0 else 0
            }

_llm_cache = LLMCache()


# ─── Core LLM Query ────────────────────────────────────────────────────────────

def get_active_model() -> str:
    """Return the currently configured primary model."""
    return PRIMARY_MODEL

def get_fallback_model() -> str:
    """Return the fallback model."""
    return FALLBACK_MODEL

def get_cache_stats() -> dict:
    """Return LLM cache statistics."""
    return _llm_cache.stats()


def query_llm(
    prompt: str,
    system_prompt: str = "You are an expert AI/ML engineer analyzing an energy forecasting MLOps platform.",
    max_tokens: int = 1024,
    temperature: float = 0.7,
    retries: int = 2,
    cache_ttl: int = 120,
    use_cache: bool = True,
) -> str:
    """
    Send a prompt to Groq API and return the response text.
    Features:
    - Response caching to reduce redundant API calls
    - Automatic model fallback (primary → fallback)
    - Retry logic with exponential backoff
    - Comprehensive error handling (never crashes)
    """
    # Check cache first
    if use_cache:
        cached = _llm_cache.get(prompt, system_prompt, PRIMARY_MODEL, cache_ttl)
        if cached is not None:
            return cached

    client = _get_client()
    models_to_try = [PRIMARY_MODEL, FALLBACK_MODEL]
    last_error = None

    for model in models_to_try:
        for attempt in range(retries + 1):
            try:
                t0 = time.perf_counter()
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=max_tokens,
                    temperature=temperature,
                    top_p=0.9,
                )
                elapsed = (time.perf_counter() - t0) * 1000
                content = response.choices[0].message.content

                # Strip any <think>...</think> tags (some models use reasoning)
                if "<think>" in content:
                    content_parts = content.split("</think>")
                    if len(content_parts) > 1:
                        # Extract the thought and clean content
                        thought = content_parts[0].replace("<think>", "").strip()
                        content = content_parts[1].strip()
                        # We append it as a specially formatted string to be parsed by the agent
                        content = f"[[REASONING_START]]{thought}[[REASONING_END]]\n{content}"
                    else:
                        content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()


                print(f"[LLM] ✓ {model} responded in {elapsed:.0f}ms ({len(content)} chars)")

                # Cache the response
                if use_cache:
                    _llm_cache.set(prompt, system_prompt, model, content)

                return content

            except Exception as e:
                last_error = e
                error_str = str(e)
                print(f"[LLM] ✗ {model} attempt {attempt + 1}/{retries + 1}: {error_str[:120]}")

                # If model is decommissioned/invalid, skip retries and try fallback
                if "decommissioned" in error_str.lower() or "not found" in error_str.lower() or "does not exist" in error_str.lower():
                    print(f"[LLM] Model '{model}' unavailable, trying fallback...")
                    break

                if attempt < retries:
                    wait = 2 ** (attempt + 1)
                    time.sleep(wait)

    # All models and retries exhausted
    error_msg = f"[LLM unavailable] All models failed. Last error: {str(last_error)[:200]}"
    print(f"[LLM] {error_msg}")
    return error_msg


def query_llm_json(
    prompt: str,
    system_prompt: str = "You are an expert AI analyst. Respond ONLY with valid JSON, no markdown.",
    max_tokens: int = 1024,
    cache_ttl: int = 120,
) -> dict:
    """Query LLM and parse the response as JSON."""
    raw = query_llm(prompt, system_prompt, max_tokens, temperature=0.3, cache_ttl=cache_ttl)
    try:
        # Try to extract JSON from response
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0]
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0]
        return json.loads(raw.strip())
    except (json.JSONDecodeError, IndexError):
        return {"raw_response": raw, "parse_error": True}
