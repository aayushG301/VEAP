import hmac
from fastapi import Header, HTTPException

from .config import SERVICE_KEY


def require_service_key(x_service_key: str = Header(default="")) -> None:
    """Service-to-service auth: only the VEAP backend (which knows the key) may call the ML endpoints."""
    if not hmac.compare_digest(x_service_key.encode(), SERVICE_KEY.encode()):
        raise HTTPException(status_code=401, detail="invalid service key")
