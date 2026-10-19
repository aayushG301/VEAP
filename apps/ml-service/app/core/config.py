import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"


def _load_env_file() -> None:
    """Load KEY=VALUE pairs from the repo-root .env (never overrides variables already set)."""
    for f in (ROOT.parents[1] / ".env", ROOT / ".env", Path.cwd() / ".env"):
        if not f.is_file():
            continue
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip()
            if v[:1] in "\"'" and v[-1:] == v[:1]:
                v = v[1:-1]
            os.environ.setdefault(k.strip(), v)


_load_env_file()
SERVICE_KEY = os.getenv("ML_SERVICE_KEY", "dev-ml-key")
