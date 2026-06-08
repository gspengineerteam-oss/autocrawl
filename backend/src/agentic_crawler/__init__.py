"""AI-driven browser crawler — sibling service to `crawler/`.

Runs a vision-capable LLM (qwen3.6:27b on the LAN Ollama server) that drives
a real Chromium browser via Browser-Use, scrolling and clicking like a human
to extract exhibitor data from sites that the deterministic 6-tier scraper
struggles with (heavy-JS aggregators, infinite-scroll lists, anti-bot walls).

Output schema is identical to the existing crawler — both producers write
into the same JSON reports + Postgres + Chroma vector store. Existing dedup
(cosine ≥ 0.92 on vendor name+domain+tagline embedding) auto-merges overlap.

Service runs on its own schedule, with its own Redis lock, and CAN be disabled
entirely via `AGENTIC_ENABLED=false` (default). The base crawler stack is
unaffected when this is off.
"""

__version__ = "0.1.0"
