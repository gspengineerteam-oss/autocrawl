from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND.parent
SRC = BACKEND / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

os.environ.setdefault("CONFIG_DIR", str(REPO_ROOT / "config"))
os.environ.setdefault("DATA_DIR", str(REPO_ROOT / "data"))
os.environ.setdefault("LOG_DIR", str(REPO_ROOT / "logs"))

os.environ.setdefault("OPENAI_API_KEY", "test-key-not-used")
os.environ.setdefault("FIRECRAWL_API_KEY", "test-key-not-used")
os.environ.setdefault("LANGFUSE_ENABLED", "false")
