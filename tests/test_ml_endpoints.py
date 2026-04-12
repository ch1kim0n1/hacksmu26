from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from echofield.server import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture
async def client(tmp_path, monkeypatch):
    import importlib
    from pathlib import Path
    from echofield.config import reset_settings

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
    reset_settings()
    import echofield.server as server_module
    server_module = importlib.reload(server_module)
    transport = ASGITransport(app=server_module.app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with server_module.app.router.lifespan_context(server_module.app):
            yield ac


@pytest.mark.asyncio
async def test_labeling_queue_returns_list(client: AsyncClient):
    resp = await client.get("/api/ml/labeling-queue")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_label_call_with_valid_labels(client: AsyncClient):
    resp = await client.post(
        "/api/ml/label/test-call-1",
        json={"call_type_refined": "contact-rumble", "social_function": "initiating"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "labeled"


@pytest.mark.asyncio
async def test_label_call_with_invalid_call_type(client: AsyncClient):
    resp = await client.post(
        "/api/ml/label/test-call-1",
        json={"call_type_refined": "invalid-type", "social_function": "initiating"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_benchmarks_endpoint(client: AsyncClient):
    resp = await client.get("/api/ml/benchmarks")
    assert resp.status_code == 200
    data = resp.json()
    assert "training_runs" in data
    assert "active_learning" in data


@pytest.mark.asyncio
async def test_predict_nonexistent_call(client: AsyncClient):
    resp = await client.get("/api/ml/predict/nonexistent-call")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_population_analytics(client: AsyncClient):
    resp = await client.get("/api/analytics/population")
    assert resp.status_code == 200
    data = resp.json()
    assert "call_type_distribution" in data
    assert "social_function_distribution" in data
    assert "by_site" in data
    assert "temporal_patterns" in data


@pytest.mark.asyncio
async def test_social_graph(client: AsyncClient):
    resp = await client.get("/api/analytics/social-graph")
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert "edges" in data


@pytest.mark.asyncio
async def test_per_recording_features_404_for_missing(client: AsyncClient):
    resp = await client.get("/api/analytics/recording/nonexistent/features")
    assert resp.status_code == 404
