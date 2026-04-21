"""
JWT 验证 + 配额检查。

通过 Supabase Auth API (get_user) 验证 Bearer token，
然后调用 consume_quota RPC 扣减一次配额。
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_client, Client

_bearer = HTTPBearer(auto_error=True)


def _supabase_client() -> Client:
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    return create_client(url, key)


@dataclass
class CurrentUser:
    id: str
    email: str


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> CurrentUser:
    """FastAPI dependency: 验证 token，返回用户信息；失败则 401。"""
    token = creds.credentials
    try:
        client = _supabase_client()
        resp = client.auth.get_user(token)
        user = resp.user
        if user is None:
            raise ValueError("no user")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return CurrentUser(id=str(user.id), email=user.email or "")


async def check_and_consume_quota(user: CurrentUser) -> None:
    """调用 consume_quota RPC；配额耗尽则 402。"""
    try:
        client = _supabase_client()
        result = client.rpc("consume_quota", {"p_user_id": user.id}).execute()
        data = result.data
        if isinstance(data, dict) and not data.get("success"):
            err = data.get("error", "")
            if err == "quota_exhausted":
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail="quota_exhausted",
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"quota_error: {err}",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"quota_check_failed: {e}",
        )
