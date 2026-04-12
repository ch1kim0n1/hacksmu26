from __future__ import annotations

import importlib
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import jwt
from fastapi.testclient import TestClient
from cryptography.hazmat.primitives.asymmetric import rsa

from echofield.auth import AuthenticatedUser
from echofield.config import reset_settings


def _load_server(monkeypatch, tmp_path: Path, *, auth_enabled: bool):
    config_path = Path(__file__).resolve().parents[1] / "config" / "echofield.config.yml"
    monkeypatch.setenv("ECHOFIELD_AUDIO_DIR", str(tmp_path / "recordings"))
    monkeypatch.setenv("ECHOFIELD_PROCESSED_DIR", str(tmp_path / "processed"))
    monkeypatch.setenv("ECHOFIELD_SPECTROGRAM_DIR", str(tmp_path / "spectrograms"))
    monkeypatch.setenv("ECHOFIELD_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setenv("ECHOFIELD_CATALOG_FILE", str(tmp_path / "cache" / "recording_catalog.json"))
    monkeypatch.setenv("ECHOFIELD_DB_PATH", str(tmp_path / "cache" / "echofield.sqlite"))
    monkeypatch.setenv("ECHOFIELD_METADATA_FILE", str(tmp_path / "metadata.csv"))
    monkeypatch.setenv("ECHOFIELD_CONFIG_FILE", str(config_path))
    monkeypatch.setenv("ECHOFIELD_DEMO_MODE", "false")
    monkeypatch.setenv("ECHOFIELD_AUTH_ENABLED", "true" if auth_enabled else "false")
    if auth_enabled:
        monkeypatch.setenv("ECHOFIELD_AUTH0_DOMAIN", "echo-test.us.auth0.com")
        monkeypatch.setenv("ECHOFIELD_AUTH0_AUDIENCE", "https://api.echofield.test")
        monkeypatch.setenv("ECHOFIELD_AUTH0_CLIENT_ID", "echo-client")
        monkeypatch.setenv("ECHOFIELD_AUTH0_CLIENT_SECRET", "echo-secret")
        monkeypatch.setenv("ECHOFIELD_AUTH0_CALLBACK_URL", "http://localhost:3000/auth/callback")
        monkeypatch.setenv("ECHOFIELD_AUTH0_SOCIAL_CONNECTIONS", "google-oauth2,github")
        monkeypatch.setenv("ECHOFIELD_AUTH0_ENTERPRISE_CONNECTIONS", "waad,samlp")
        monkeypatch.setenv("ECHOFIELD_AUTH0_ROLES_CLAIM", "https://echofield.test/roles")

    reset_settings()
    import echofield.server as server_module

    return importlib.reload(server_module)


def test_auth_disabled_allows_api_without_bearer(monkeypatch, tmp_path: Path) -> None:
    server_module = _load_server(monkeypatch, tmp_path, auth_enabled=False)

    with TestClient(server_module.app) as client:
        response = client.get("/api/recordings")

    assert response.status_code == 200


def test_auth_enabled_requires_bearer_for_api(monkeypatch, tmp_path: Path) -> None:
    server_module = _load_server(monkeypatch, tmp_path, auth_enabled=True)

    with TestClient(server_module.app) as client:
        response = client.get("/api/recordings")

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token"
    assert response.headers["www-authenticate"] == "Bearer"


def test_auth_enabled_leaves_health_and_config_public(monkeypatch, tmp_path: Path) -> None:
    server_module = _load_server(monkeypatch, tmp_path, auth_enabled=True)

    with TestClient(server_module.app) as client:
        health = client.get("/health")
        config = client.get("/api/auth/config")

    assert health.status_code == 200
    assert config.status_code == 200
    assert config.json() == {
        "enabled": True,
        "domain": "echo-test.us.auth0.com",
        "audience": "https://api.echofield.test",
        "issuer": "https://echo-test.us.auth0.com/",
        "algorithms": ["RS256"],
        "client_id": "echo-client",
        "default_scope": "openid profile email",
        "social_connections": ["google-oauth2", "github"],
        "enterprise_connections": ["waad", "samlp"],
    }


def test_auth_enabled_accepts_valid_bearer(monkeypatch, tmp_path: Path) -> None:
    server_module = _load_server(monkeypatch, tmp_path, auth_enabled=True)

    def verify(_self, token: str) -> AuthenticatedUser:
        assert token == "valid-token"
        return AuthenticatedUser(sub="auth0|researcher", claims={"sub": "auth0|researcher", "scope": "read:recordings"})

    monkeypatch.setattr(server_module.Auth0TokenVerifier, "verify", verify)

    with TestClient(server_module.app) as client:
        response = client.get("/api/recordings", headers={"Authorization": "Bearer valid-token"})

    assert response.status_code == 200


def test_auth0_verifier_decodes_rs256_token(monkeypatch, tmp_path: Path) -> None:
    server_module = _load_server(monkeypatch, tmp_path, auth_enabled=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = jwt.encode(
        {
            "sub": "auth0|researcher",
            "iss": "https://echo-test.us.auth0.com/",
            "aud": "https://api.echofield.test",
            "scope": "read:recordings",
        },
        key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )

    class FakeJwksClient:
        def get_signing_key_from_jwt(self, received_token: str):
            assert received_token == token
            signing_key = type("FakeSigningKey", (), {})()
            signing_key.key = key.public_key()
            return signing_key

    verifier = server_module.Auth0TokenVerifier(server_module.settings)
    verifier._jwks_client = FakeJwksClient()

    user = verifier.verify(token)

    assert user.sub == "auth0|researcher"
    assert user.scopes == {"read:recordings"}


def test_login_url_supports_social_and_enterprise_connections(monkeypatch, tmp_path: Path) -> None:
    server_module = _load_server(monkeypatch, tmp_path, auth_enabled=True)

    with TestClient(server_module.app) as client:
        response = client.post(
            "/api/auth/login-url",
            json={
                "connection": "google-oauth2",
                "organization": "org_123",
                "state": "abc",
                "code_challenge": "pkce",
                "code_challenge_method": "S256",
            },
        )

    assert response.status_code == 200
    parsed = urlparse(response.json()["url"])
    query = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert parsed.netloc == "echo-test.us.auth0.com"
    assert parsed.path == "/authorize"
    assert query["client_id"] == ["echo-client"]
    assert query["audience"] == ["https://api.echofield.test"]
    assert query["redirect_uri"] == ["http://localhost:3000/auth/callback"]
    assert query["connection"] == ["google-oauth2"]
    assert query["organization"] == ["org_123"]
    assert query["code_challenge"] == ["pkce"]


def test_passwordless_start_calls_auth0_backend(monkeypatch, tmp_path: Path) -> None:
    server_module = _load_server(monkeypatch, tmp_path, auth_enabled=True)

    async def fake_passwordless_start(**kwargs):
        assert kwargs["connection"] == "email"
        assert kwargs["email"] == "researcher@example.com"
        assert kwargs["send"] == "code"
        return {"status": "started", "email": kwargs["email"]}

    monkeypatch.setattr(server_module.auth0_client, "passwordless_start", fake_passwordless_start)

    with TestClient(server_module.app) as client:
        response = client.post(
            "/api/auth/passwordless/start",
            json={"connection": "email", "email": "researcher@example.com", "send": "code"},
        )

    assert response.status_code == 200
    assert response.json() == {"status": "started", "email": "researcher@example.com"}


def test_mfa_challenge_calls_auth0_backend(monkeypatch, tmp_path: Path) -> None:
    server_module = _load_server(monkeypatch, tmp_path, auth_enabled=True)

    async def fake_mfa_challenge(**kwargs):
        assert kwargs["mfa_token"] == "mfa-token"
        assert kwargs["challenge_type"] == "otp"
        return {"challenge_type": "otp", "oob_code": "challenge-id"}

    monkeypatch.setattr(server_module.auth0_client, "mfa_challenge", fake_mfa_challenge)

    with TestClient(server_module.app) as client:
        response = client.post(
            "/api/auth/mfa/challenge",
            json={"mfa_token": "mfa-token", "challenge_type": "otp"},
        )

    assert response.status_code == 200
    assert response.json() == {"challenge_type": "otp", "oob_code": "challenge-id"}


def test_me_returns_claim_permissions_and_roles(monkeypatch, tmp_path: Path) -> None:
    server_module = _load_server(monkeypatch, tmp_path, auth_enabled=True)

    def verify(_self, _token: str) -> AuthenticatedUser:
        return AuthenticatedUser(
            sub="auth0|researcher",
            claims={
                "sub": "auth0|researcher",
                "scope": "read:recordings",
                "permissions": ["read:users"],
                "https://echofield.test/roles": ["researcher"],
            },
            roles_claim="https://echofield.test/roles",
        )

    monkeypatch.setattr(server_module.Auth0TokenVerifier, "verify", verify)

    with TestClient(server_module.app) as client:
        response = client.get("/api/auth/me", headers={"Authorization": "Bearer valid-token"})

    assert response.status_code == 200
    assert response.json()["sub"] == "auth0|researcher"
    assert response.json()["scopes"] == ["read:recordings"]
    assert response.json()["permissions"] == ["read:users"]
    assert response.json()["roles"] == ["researcher"]


def test_metadata_update_requires_manage_users_permission(monkeypatch, tmp_path: Path) -> None:
    server_module = _load_server(monkeypatch, tmp_path, auth_enabled=True)

    def verify_without_permission(_self, _token: str) -> AuthenticatedUser:
        return AuthenticatedUser(
            sub="auth0|researcher",
            claims={"sub": "auth0|researcher", "permissions": ["read:users"]},
        )

    monkeypatch.setattr(server_module.Auth0TokenVerifier, "verify", verify_without_permission)

    with TestClient(server_module.app) as client:
        response = client.patch(
            "/api/auth/users/auth0|researcher/metadata",
            headers={"Authorization": "Bearer missing-permission"},
            json={"user_metadata": {"lab": "SMU"}},
        )

    assert response.status_code == 403

    def verify_with_permission(_self, _token: str) -> AuthenticatedUser:
        return AuthenticatedUser(
            sub="auth0|admin",
            claims={"sub": "auth0|admin", "permissions": ["manage:users"]},
        )

    async def fake_patch_user_metadata(user_id: str, *, user_metadata, app_metadata=None):
        assert user_id == "auth0|researcher"
        assert user_metadata == {"lab": "SMU"}
        assert app_metadata is None
        return {
            "user_id": user_id,
            "email": "researcher@example.com",
            "user_metadata": user_metadata,
            "app_metadata": {},
        }

    monkeypatch.setattr(server_module.Auth0TokenVerifier, "verify", verify_with_permission)
    monkeypatch.setattr(server_module.auth0_client, "patch_user_metadata", fake_patch_user_metadata)

    with TestClient(server_module.app) as client:
        response = client.patch(
            "/api/auth/users/auth0|researcher/metadata",
            headers={"Authorization": "Bearer manage-users"},
            json={"user_metadata": {"lab": "SMU"}},
        )

    assert response.status_code == 200
    assert response.json()["user_id"] == "auth0|researcher"
    assert response.json()["user_metadata"] == {"lab": "SMU"}
