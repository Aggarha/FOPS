"""
FOPS Tenant Middleware — Phase 1

Reads the X-Tenant-ID request header and exposes it on request.state.
If the header is absent or empty, defaults to "default".

Registration in main.py:
    from middleware.tenant import TenantMiddleware
    app.add_middleware(TenantMiddleware)
"""

import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("middleware.tenant")

_HEADER = "x-tenant-id"
_DEFAULT = "default"
_MAX_LEN = 64


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        raw = request.headers.get(_HEADER, "").strip()
        # Sanitise: allow only alphanumeric + hyphen + underscore
        tenant_id = _sanitise(raw) if raw else _DEFAULT
        request.state.tenant_id = tenant_id
        return await call_next(request)


def _sanitise(value: str) -> str:
    """Return value if safe, else 'default'. Prevents header injection."""
    clean = "".join(c for c in value if c.isalnum() or c in "-_")
    if not clean or len(clean) > _MAX_LEN:
        return _DEFAULT
    return clean
