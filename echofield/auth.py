"""Auth0 JWT verification for the EchoField API."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, urlencode

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
import httpx
from starlette.concurrency import run_in_threadpool

from echofield.config import Config


@dataclass(frozen=True)
class AuthenticatedUser:
    """Authenticated Auth0 access-token claims."""

    sub: str
    claims: dict[str, Any]
    roles_claim: str | None = None

    @property
    def scopes(self) -> set[str]:
        raw_scope = str(self.claims.get("scope") or "")
        return {item for item in raw_scope.split() if item}

    @property
    def permissions(self) -> set[str]:
        raw_permissions = self.claims.get("permissions") or []
        if not isinstance(raw_permissions, list):
            return set()
        return {str(item) for item in raw_permissions}

    @property
    def roles(self) -> set[str]:
        claim_names = [
            self.roles_claim,
            "roles",
            "https://echofield.dev/roles",
            "https://echofield.app/roles",
        ]
        for claim_name in (item for item in claim_names if item):
            raw_roles = self.claims.get(str(claim_name))
            if isinstance(raw_roles, list):
                return {str(item) for item in raw_roles}
            if isinstance(raw_roles, str):
                return {item for item in raw_roles.split() if item}
        return set()


class Auth0TokenVerifier:
    """Verify Auth0 RS256 access tokens against the tenant JWKS."""

    def __init__(self, settings: Config):
        self.settings = settings
        self.issuer = _auth0_issuer(settings)
        self.jwks_url = f"{self.issuer}.well-known/jwks.json"
        self._jwks_client: Any | None = None

    def verify(self, token: str) -> AuthenticatedUser:
        try:
            import jwt
            from jwt import PyJWKClient
        except ImportError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Auth0 verification requires PyJWT[crypto]. Install backend dependencies.",
            ) from exc

        try:
            if self._jwks_client is None:
                self._jwks_client = PyJWKClient(self.jwks_url)
            signing_key = self._jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=self.settings.AUTH0_ALGORITHMS,
                audience=self.settings.AUTH0_AUDIENCE,
                issuer=self.issuer,
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

        subject = payload.get("sub")
        if not subject:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Access token is missing subject claim",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return AuthenticatedUser(
            sub=str(subject),
            claims=dict(payload),
            roles_claim=self.settings.AUTH0_ROLES_CLAIM,
        )


class Auth0Client:
    """Backend wrapper for Auth0 Authentication and Management API calls."""

    def __init__(self, settings: Config):
        self.settings = settings
        self.domain = _auth0_domain(settings)
        self.base_url = f"https://{self.domain}" if self.domain else ""
        self._management_token: str | None = None
        self._management_token_expires_at = 0.0

    def authorize_url(
        self,
        *,
        redirect_uri: str | None = None,
        connection: str | None = None,
        organization: str | None = None,
        screen_hint: str | None = None,
        prompt: str | None = None,
        state: str | None = None,
        scope: str | None = None,
        code_challenge: str | None = None,
        code_challenge_method: str | None = None,
    ) -> str:
        self._require_domain()
        client_id = self._require_client_id()
        payload: dict[str, str] = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri or self._require_callback_url(),
            "scope": scope or self.settings.AUTH0_DEFAULT_SCOPE,
        }
        if self.settings.AUTH0_AUDIENCE:
            payload["audience"] = self.settings.AUTH0_AUDIENCE
        for key, value in {
            "connection": connection,
            "organization": organization,
            "screen_hint": screen_hint,
            "prompt": prompt,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": code_challenge_method,
        }.items():
            if value:
                payload[key] = value
        return f"{self.base_url}/authorize?{urlencode(payload)}"

    async def exchange_authorization_code(
        self,
        *,
        code: str,
        redirect_uri: str | None = None,
        code_verifier: str | None = None,
    ) -> dict[str, Any]:
        payload = {
            "grant_type": "authorization_code",
            "client_id": self._require_client_id(),
            "client_secret": self._require_client_secret(),
            "code": code,
            "redirect_uri": redirect_uri or self._require_callback_url(),
        }
        if code_verifier:
            payload["code_verifier"] = code_verifier
        return await self._request("POST", "/oauth/token", json=payload)

    async def passwordless_start(
        self,
        *,
        connection: str,
        email: str | None = None,
        phone_number: str | None = None,
        send: str = "code",
        redirect_uri: str | None = None,
        scope: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "client_id": self._require_client_id(),
            "client_secret": self._require_client_secret(),
            "connection": connection,
            "send": send,
            "authParams": {
                "scope": scope or self.settings.AUTH0_DEFAULT_SCOPE,
                "audience": self.settings.AUTH0_AUDIENCE,
            },
        }
        if redirect_uri:
            payload["authParams"]["redirect_uri"] = redirect_uri
        if email:
            payload["email"] = email
        if phone_number:
            payload["phone_number"] = phone_number
        if not email and not phone_number:
            raise HTTPException(status_code=400, detail="Passwordless login requires email or phone_number")
        return await self._request("POST", "/passwordless/start", json=payload)

    async def passwordless_verify(
        self,
        *,
        connection: str,
        username: str,
        otp: str,
        scope: str | None = None,
    ) -> dict[str, Any]:
        payload = {
            "grant_type": "http://auth0.com/oauth/grant-type/passwordless/otp",
            "client_id": self._require_client_id(),
            "client_secret": self._require_client_secret(),
            "audience": self.settings.AUTH0_AUDIENCE,
            "scope": scope or self.settings.AUTH0_DEFAULT_SCOPE,
            "realm": connection,
            "username": username,
            "otp": otp,
        }
        return await self._request("POST", "/oauth/token", json=payload)

    async def mfa_challenge(
        self,
        *,
        mfa_token: str,
        challenge_type: str = "otp",
        authenticator_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"challenge_type": challenge_type}
        if authenticator_id:
            payload["authenticator_id"] = authenticator_id
        return await self._request(
            "POST",
            "/mfa/challenge",
            json=payload,
            headers={"Authorization": f"Bearer {mfa_token}"},
        )

    async def mfa_verify_otp(self, *, mfa_token: str, otp: str) -> dict[str, Any]:
        payload = {
            "grant_type": "http://auth0.com/oauth/grant-type/mfa-otp",
            "client_id": self._require_client_id(),
            "client_secret": self._require_client_secret(),
            "mfa_token": mfa_token,
            "otp": otp,
        }
        return await self._request("POST", "/oauth/token", json=payload)

    async def get_user_profile(self, user_id: str) -> dict[str, Any]:
        return await self._management_request("GET", f"/api/v2/users/{_quote_path(user_id)}")

    async def patch_user_metadata(
        self,
        user_id: str,
        *,
        user_metadata: dict[str, Any],
        app_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"user_metadata": user_metadata}
        if app_metadata is not None:
            payload["app_metadata"] = app_metadata
        return await self._management_request("PATCH", f"/api/v2/users/{_quote_path(user_id)}", json=payload)

    async def list_user_roles(self, user_id: str) -> list[dict[str, Any]]:
        result = await self._management_request("GET", f"/api/v2/users/{_quote_path(user_id)}/roles")
        return result if isinstance(result, list) else []

    async def assign_user_roles(self, user_id: str, roles: list[str]) -> dict[str, Any]:
        await self._management_request(
            "POST",
            f"/api/v2/users/{_quote_path(user_id)}/roles",
            json={"roles": roles},
        )
        return {"status": "assigned", "roles": roles}

    async def remove_user_roles(self, user_id: str, roles: list[str]) -> dict[str, Any]:
        await self._management_request(
            "DELETE",
            f"/api/v2/users/{_quote_path(user_id)}/roles",
            json={"roles": roles},
        )
        return {"status": "removed", "roles": roles}

    async def _management_request(self, method: str, path: str, **kwargs: Any) -> Any:
        token = await self._management_access_token()
        headers = dict(kwargs.pop("headers", {}) or {})
        headers["Authorization"] = f"Bearer {token}"
        return await self._request(method, path, headers=headers, **kwargs)

    async def _management_access_token(self) -> str:
        now = time.time()
        if self._management_token and now < self._management_token_expires_at - 60:
            return self._management_token
        audience = self.settings.AUTH0_MANAGEMENT_AUDIENCE or f"{self.base_url}/api/v2/"
        response = await self._request(
            "POST",
            "/oauth/token",
            json={
                "grant_type": "client_credentials",
                "client_id": self._require_client_id(),
                "client_secret": self._require_client_secret(),
                "audience": audience,
            },
        )
        access_token = response.get("access_token") if isinstance(response, dict) else None
        if not access_token:
            raise HTTPException(status_code=502, detail="Auth0 Management API did not return an access token")
        self._management_token = str(access_token)
        self._management_token_expires_at = now + float(response.get("expires_in") or 3600)
        return self._management_token

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        self._require_domain()
        headers = {"Content-Type": "application/json", **(kwargs.pop("headers", {}) or {})}
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.request(method, f"{self.base_url}{path}", headers=headers, **kwargs)
        if response.status_code >= 400:
            try:
                detail: Any = response.json()
            except ValueError:
                detail = response.text
            raise HTTPException(status_code=response.status_code, detail=detail)
        if response.status_code == status.HTTP_204_NO_CONTENT or not response.content:
            return {}
        try:
            return response.json()
        except ValueError as exc:
            raise HTTPException(status_code=502, detail="Auth0 returned a non-JSON response") from exc

    def _require_domain(self) -> None:
        if not self.domain:
            raise HTTPException(status_code=500, detail="ECHOFIELD_AUTH0_DOMAIN is not configured")

    def _require_client_id(self) -> str:
        if not self.settings.AUTH0_CLIENT_ID:
            raise HTTPException(status_code=500, detail="ECHOFIELD_AUTH0_CLIENT_ID is not configured")
        return self.settings.AUTH0_CLIENT_ID

    def _require_client_secret(self) -> str:
        if not self.settings.AUTH0_CLIENT_SECRET:
            raise HTTPException(status_code=500, detail="ECHOFIELD_AUTH0_CLIENT_SECRET is not configured")
        return self.settings.AUTH0_CLIENT_SECRET

    def _require_callback_url(self) -> str:
        if not self.settings.AUTH0_CALLBACK_URL:
            raise HTTPException(status_code=500, detail="ECHOFIELD_AUTH0_CALLBACK_URL is not configured")
        return self.settings.AUTH0_CALLBACK_URL


def auth_config_payload(settings: Config) -> dict[str, Any]:
    """Return non-secret frontend Auth0 configuration."""
    return {
        "enabled": settings.AUTH_ENABLED,
        "domain": _auth0_domain(settings) if settings.AUTH0_DOMAIN else None,
        "audience": settings.AUTH0_AUDIENCE,
        "issuer": _auth0_issuer(settings) if settings.AUTH0_DOMAIN else None,
        "algorithms": settings.AUTH0_ALGORITHMS,
        "client_id": settings.AUTH0_CLIENT_ID,
        "default_scope": settings.AUTH0_DEFAULT_SCOPE,
        "social_connections": settings.AUTH0_SOCIAL_CONNECTIONS,
        "enterprise_connections": settings.AUTH0_ENTERPRISE_CONNECTIONS,
    }


def authenticated_user_from_request(request: Request, settings: Config) -> AuthenticatedUser:
    user = getattr(request.state, "user", None)
    if isinstance(user, AuthenticatedUser):
        return user
    if not settings.AUTH_ENABLED:
        return AuthenticatedUser(
            sub="local-dev",
            claims={
                "sub": "local-dev",
                "scope": "*",
                "permissions": ["*"],
                "roles": ["admin"],
            },
            roles_claim=settings.AUTH0_ROLES_CLAIM,
        )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_permissions(settings: Config, *permissions: str):
    async def dependency(request: Request) -> AuthenticatedUser:
        user = authenticated_user_from_request(request, settings)
        if not settings.AUTH_ENABLED or "*" in user.permissions or "*" in user.scopes:
            return user
        missing = [
            permission
            for permission in permissions
            if permission not in user.permissions and permission not in user.scopes
        ]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permission(s): {', '.join(missing)}",
            )
        return user

    return dependency


def require_roles(settings: Config, *roles: str):
    async def dependency(request: Request) -> AuthenticatedUser:
        user = authenticated_user_from_request(request, settings)
        if not settings.AUTH_ENABLED or "admin" in user.roles:
            return user
        missing = [role for role in roles if role not in user.roles]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required role(s): {', '.join(missing)}",
            )
        return user

    return dependency


def auth_required_for_request(request: Request, settings: Config) -> bool:
    """Return whether an HTTP request should require an access token."""
    if not settings.AUTH_ENABLED:
        return False
    if request.method.upper() == "OPTIONS":
        return False

    path = request.url.path
    for public_path in settings.AUTH_PUBLIC_PATHS:
        if path == public_path or path.startswith(f"{public_path}/"):
            return False
    return path.startswith("/api")


async def auth0_middleware(request: Request, call_next, settings: Config, verifier: Auth0TokenVerifier):
    """FastAPI middleware callback for Auth0 bearer-token enforcement."""
    if not auth_required_for_request(request, settings):
        return await call_next(request)

    token = _bearer_token(request)
    if token is None:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Missing bearer token"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        request.state.user = await run_in_threadpool(verifier.verify, token)
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=exc.headers,
        )

    return await call_next(request)


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization") or ""
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def _auth0_domain(settings: Config) -> str:
    domain = str(settings.AUTH0_DOMAIN or "").strip()
    domain = domain.removeprefix("https://").removeprefix("http://").rstrip("/")
    return domain


def _auth0_issuer(settings: Config) -> str:
    if settings.AUTH0_ISSUER:
        return settings.AUTH0_ISSUER.rstrip("/") + "/"
    domain = _auth0_domain(settings)
    return f"https://{domain}/"


def _quote_path(value: str) -> str:
    return quote(value, safe="")
