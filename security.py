"""
FOPS — Lightweight API key authentication.

Usage:
    from security import verify_api_key
    @app.post("/api/protected", dependencies=[Depends(verify_api_key)])
    def protected_endpoint(): ...

Set the key via environment variable FOPS_API_KEY or change the default below.
"""

import os

from fastapi import Header, HTTPException

API_KEY = os.getenv("FOPS_API_KEY", "CHANGE_ME_SECRET")


def verify_api_key(x_api_key: str = Header(None)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")
