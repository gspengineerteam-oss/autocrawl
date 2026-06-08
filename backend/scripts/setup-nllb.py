"""One-shot NLLB-200 model setup.

Downloads facebook/nllb-200-distilled-600M from Hugging Face and converts it
to int8 CTranslate2 format. Output lands in /models/{nllb_hf,nllb_ct2}/, which
is mounted from the host's ./nllb_models/ directory in docker-compose.

Run once via:
    docker compose --profile setup run --rm nllb-setup

After this completes, the model persists on host across image rebuilds, prunes,
and cache wipes — never re-downloads.

Pass HF_TOKEN env for authenticated download (faster, no anonymous rate limit).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

OUT_ROOT = Path("/models")
HF_DIR = OUT_ROOT / "nllb_hf"
SNAPSHOT_DIR = HF_DIR / "snapshot"
CT2_DIR = OUT_ROOT / "nllb_ct2"


def main() -> int:
    if (CT2_DIR / "model.bin").exists():
        print(f"[nllb-setup] {CT2_DIR}/model.bin already present — skipping. Delete the folder to force re-download.")
        return 0

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    HF_DIR.mkdir(parents=True, exist_ok=True)
    CT2_DIR.mkdir(parents=True, exist_ok=True)

    print("[nllb-setup] Downloading facebook/nllb-200-distilled-600M from Hugging Face...")
    from huggingface_hub import snapshot_download

    snapshot_download(
        "facebook/nllb-200-distilled-600M",
        cache_dir=str(HF_DIR),
        local_dir=str(SNAPSHOT_DIR),
        token=os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN"),
    )
    print(f"[nllb-setup] Snapshot landed at {SNAPSHOT_DIR}")

    print("[nllb-setup] Converting to CTranslate2 int8 (this takes ~1-2 minutes)...")
    rc = subprocess.call(
        [
            "ct2-transformers-converter",
            "--model", str(SNAPSHOT_DIR),
            "--output_dir", str(CT2_DIR),
            "--quantization", "int8",
            "--copy_files", "tokenizer.json", "tokenizer_config.json",
            "sentencepiece.bpe.model", "special_tokens_map.json",
            "--force",
        ]
    )
    if rc != 0:
        print(f"[nllb-setup] ct2 conversion failed with exit code {rc}", file=sys.stderr)
        return rc

    # Snapshot is no longer needed; ct2 directory has everything required at runtime.
    print(f"[nllb-setup] Removing intermediate snapshot at {SNAPSHOT_DIR} to save disk...")
    shutil.rmtree(SNAPSHOT_DIR, ignore_errors=True)

    print("[nllb-setup] Done. Models ready at:")
    print(f"  {CT2_DIR}/  (NLLB_MODEL_PATH)")
    print(f"  {HF_DIR}/   (NLLB_TOKENIZER_PATH parent — tokenizer files copied into ct2 dir)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
