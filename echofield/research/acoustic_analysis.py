"""Advanced acoustic analysis utilities."""

from __future__ import annotations

import math
import hashlib
import json
from pathlib import Path
from typing import Any

import librosa
import numpy as np
from scipy import stats

from echofield.metrics import metrics
from echofield.pipeline.feature_extract import _features_to_vector
from echofield.research.call_fingerprint import cosine_similarity, ensure_call_fingerprint

from echofield.pipeline.feature_extract import classify_call_type, extract_acoustic_features


def track_frequency_contour(y: np.ndarray, sr: int) -> list[float]:
    if y.size == 0:
        return []
    contour = librosa.yin(y, fmin=8, fmax=300, sr=sr)
    contour = np.nan_to_num(contour, nan=0.0, posinf=0.0, neginf=0.0)
    return [round(float(value), 2) for value in contour.tolist()]


def harmonic_to_noise_ratio(y: np.ndarray) -> float:
    if y.size == 0:
        return 0.0
    harmonic, noise = librosa.effects.hpss(y)
    harmonic_energy = float(np.sum(harmonic ** 2))
    noise_energy = max(float(np.sum(noise ** 2)), 1e-8)
    return round(10.0 * math.log10(harmonic_energy / noise_energy), 2)


def build_identity_signature(features: dict[str, Any]) -> list[float]:
    formants = list(features.get("formant_peaks_hz", []))[:3]
    formants += [0.0] * (3 - len(formants))
    return [
        float(features.get("fundamental_frequency_hz", 0.0)),
        float(features.get("harmonicity", 0.0)),
        float(features.get("spectral_centroid_hz", 0.0)),
        *[float(value) for value in formants],
    ]


def contour_similarity(
    contour_a: list[float],
    contour_b: list[float],
    *,
    method: str = "dtw",
    window: int | None = None,
) -> float:
    """Compare two frequency contours.

    Returns a similarity score between 0.0 and 1.0.
    """
    a = np.asarray(contour_a, dtype=np.float32)
    b = np.asarray(contour_b, dtype=np.float32)
    a = a[a > 0]
    b = b[b > 0]
    if a.size < 2 or b.size < 2:
        return 0.0
    if method == "pearson":
        target_len = max(len(a), len(b))
        a_resampled = np.interp(
            np.linspace(0, 1, target_len), np.linspace(0, 1, len(a)), a,
        )
        b_resampled = np.interp(
            np.linspace(0, 1, target_len), np.linspace(0, 1, len(b)), b,
        )
        corr_matrix = np.corrcoef(a_resampled, b_resampled)
        corr = float(corr_matrix[0, 1])
        if not np.isfinite(corr):
            return 0.0
        return round(max(corr, 0.0), 3)

    a_norm = (a - np.mean(a)) / max(float(np.std(a)), 1e-8)
    b_norm = (b - np.mean(b)) / max(float(np.std(b)), 1e-8)
    try:
        if window is None:
            cost, _ = librosa.sequence.dtw(X=a_norm.reshape(1, -1), Y=b_norm.reshape(1, -1), metric="euclidean")
        else:
            cost, _ = librosa.sequence.dtw(
                X=a_norm.reshape(1, -1),
                Y=b_norm.reshape(1, -1),
                metric="euclidean",
                global_constraints=True,
                band_rad=max(window / max(len(a_norm), len(b_norm)), 0.01),
            )
        distance = float(cost[-1, -1]) / max(len(a_norm) + len(b_norm), 1)
        similarity = 1.0 / (1.0 + distance)
        return round(float(np.clip(similarity, 0.0, 1.0)), 3)
    except Exception:
        target_len = max(len(a), len(b))
        a_resampled = np.interp(
            np.linspace(0, 1, target_len), np.linspace(0, 1, len(a)), a,
        )
        b_resampled = np.interp(
            np.linspace(0, 1, target_len), np.linspace(0, 1, len(b)), b,
        )
        distance = float(np.mean(np.abs(a_resampled - b_resampled))) / max(float(np.mean(np.abs(a_resampled))), 1e-8)
        return round(float(np.clip(1.0 / (1.0 + distance), 0.0, 1.0)), 3)


def acoustic_similarity(signature_a: list[float], signature_b: list[float]) -> float:
    a = np.asarray(signature_a, dtype=np.float32)
    b = np.asarray(signature_b, dtype=np.float32)
    if a.size == 0 or b.size == 0:
        return 0.0
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denominator <= 1e-8:
        return 0.0
    return round(float(np.dot(a, b) / denominator), 3)


def analyze_recording(y: np.ndarray, sr: int, call_id: str) -> dict[str, Any]:
    features = extract_acoustic_features(y, sr)
    call_type = classify_call_type(features)
    contour = track_frequency_contour(y, sr)
    hnr = harmonic_to_noise_ratio(y)
    signature = build_identity_signature(features)
    return {
        "call_id": call_id,
        "features": features,
        "call_type": call_type["call_type"],
        "confidence": call_type["confidence"],
        "frequency_contour_hz": contour,
        "harmonic_to_noise_ratio_db": hnr,
        "identity_signature": signature,
    }


def _annotate_graph(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not nodes:
        return []
    try:
        import networkx as nx

        graph = nx.Graph()
        for node in nodes:
            graph.add_node(node["id"])
        for edge in edges:
            graph.add_edge(edge["source"], edge["target"], weight=edge["weight"])

        communities = list(nx.algorithms.community.greedy_modularity_communities(graph, weight="weight"))
        community_by_node: dict[str, int] = {}
        for community_id, community in enumerate(communities):
            for node_id in sorted(community):
                community_by_node[str(node_id)] = community_id
        for node in nodes:
            community_by_node.setdefault(node["id"], len(community_by_node))

        degree = nx.degree_centrality(graph)
        betweenness = nx.betweenness_centrality(graph, weight="weight", normalized=True)
        for node in nodes:
            node["community_id"] = int(community_by_node.get(node["id"], 0))
            node["degree_centrality"] = round(float(degree.get(node["id"], 0.0)), 6)
            node["betweenness_centrality"] = round(float(betweenness.get(node["id"], 0.0)), 6)
        return nodes
    except Exception:
        visited: set[str] = set()
        adjacency: dict[str, set[str]] = {node["id"]: set() for node in nodes}
        for edge in edges:
            adjacency.setdefault(edge["source"], set()).add(edge["target"])
            adjacency.setdefault(edge["target"], set()).add(edge["source"])
        community_id = 0
        for node in nodes:
            if node["id"] in visited:
                continue
            stack = [node["id"]]
            while stack:
                current = stack.pop()
                if current in visited:
                    continue
                visited.add(current)
                for candidate in nodes:
                    if candidate["id"] == current:
                        candidate["community_id"] = community_id
                        candidate["degree_centrality"] = round(len(adjacency.get(current, set())) / max(len(nodes) - 1, 1), 6)
                        candidate["betweenness_centrality"] = 0.0
                        break
                stack.extend(adjacency.get(current, set()) - visited)
            community_id += 1
        return nodes


def build_similarity_graph(analyses: list[dict[str, Any]], threshold: float = 0.75) -> dict[str, Any]:
    nodes = [{"id": item["call_id"], "label": item["call_type"]} for item in analyses]
    edges = []
    for index, source in enumerate(analyses):
        for target in analyses[index + 1 :]:
            similarity = acoustic_similarity(
                source["identity_signature"],
                target["identity_signature"],
            )
            if similarity >= threshold:
                edges.append(
                    {
                        "source": source["call_id"],
                        "target": target["call_id"],
                        "weight": similarity,
                    }
                )
    nodes = _annotate_graph(nodes, edges)
    return {"nodes": nodes, "edges": edges}


class SimilarityMatrixCache:
    """Persistent sparse pairwise similarity cache."""

    def __init__(self, path: str | Path, max_calls: int = 500) -> None:
        self.path = Path(path)
        self.max_calls = max_calls
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._payload: dict[str, Any] = {}
        if self.path.exists():
            try:
                self._payload = json.loads(self.path.read_text(encoding="utf-8"))
            except Exception:
                self._payload = {}

    @staticmethod
    def _digest(calls: list[dict[str, Any]], threshold: float) -> str:
        rows = []
        for call in calls:
            enriched = ensure_call_fingerprint(dict(call))
            rows.append({
                "id": call.get("id"),
                "call_type": call.get("call_type"),
                "fingerprint": enriched.get("fingerprint"),
                "fingerprint_version": enriched.get("fingerprint_version"),
            })
        encoded = json.dumps({"threshold": threshold, "rows": rows}, sort_keys=True, default=str)
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    def get_graph(self, calls: list[dict[str, Any]], threshold: float = 0.75) -> dict[str, Any]:
        capped_calls = calls[: self.max_calls]
        digest = self._digest(capped_calls, threshold)
        if self._payload.get("digest") == digest:
            metrics.inc("echofield_similarity_cache_hits_total")
            return self._payload["graph"]
        metrics.inc("echofield_similarity_cache_misses_total")
        enriched = [ensure_call_fingerprint(dict(call)) for call in capped_calls]
        nodes = [{"id": call.get("id", ""), "label": call.get("call_type", "unknown")} for call in enriched]
        edges = []
        for index, source in enumerate(enriched):
            for target in enriched[index + 1 :]:
                similarity = round(cosine_similarity(source.get("fingerprint") or [], target.get("fingerprint") or []), 4)
                if similarity >= threshold:
                    edges.append({
                        "source": source.get("id", ""),
                        "target": target.get("id", ""),
                        "weight": similarity,
                    })
        graph = {"nodes": _annotate_graph(nodes, edges), "edges": edges}
        self._payload = {"digest": digest, "threshold": threshold, "graph": graph}
        self.path.write_text(json.dumps(self._payload, indent=2, default=str), encoding="utf-8")
        return graph

    def invalidate(self) -> None:
        self._payload = {}
        if self.path.exists():
            self.path.unlink()


def compute_embedding(calls: list[dict[str, Any]], method: str = "pca") -> dict[str, Any]:
    if not calls:
        return {"method": method, "points": [], "total": 0}
    matrix = np.asarray([_features_to_vector(call.get("acoustic_features") or {}) for call in calls], dtype=np.float32)
    if matrix.shape[0] == 1:
        coords = np.zeros((1, 2), dtype=np.float32)
        resolved_method = "pca"
    else:
        resolved_method = method.lower()
        if resolved_method == "umap":
            try:
                import umap

                coords = umap.UMAP(n_components=2, random_state=42).fit_transform(matrix)
            except Exception:
                resolved_method = "pca"
                from sklearn.decomposition import PCA

                coords = PCA(n_components=2, random_state=42).fit_transform(matrix)
        else:
            resolved_method = "pca"
            from sklearn.decomposition import PCA

            n_components = min(2, matrix.shape[0], matrix.shape[1])
            raw = PCA(n_components=n_components, random_state=42).fit_transform(matrix)
            coords = np.zeros((matrix.shape[0], 2), dtype=np.float32)
            coords[:, :n_components] = raw
    points = [
        {
            "call_id": call.get("id", ""),
            "x": round(float(coords[index, 0]), 6),
            "y": round(float(coords[index, 1]), 6),
            "call_type": call.get("call_type", "unknown"),
            "confidence": float(call.get("confidence") or 0.0),
        }
        for index, call in enumerate(calls)
    ]
    return {"method": resolved_method, "points": points, "total": len(points)}


def _numeric_feature_matrix(calls: list[dict[str, Any]]) -> dict[str, list[float]]:
    feature_names = [
        "fundamental_frequency_hz",
        "harmonicity",
        "harmonic_count",
        "bandwidth_hz",
        "spectral_centroid_hz",
        "spectral_rolloff_hz",
        "zero_crossing_rate",
        "snr_db",
        "duration_s",
        "pitch_contour_slope",
        "temporal_energy_variance",
        "spectral_entropy",
    ]
    values: dict[str, list[float]] = {name: [] for name in feature_names}
    for call in calls:
        features = call.get("acoustic_features") or {}
        for name in feature_names:
            try:
                values[name].append(float(features.get(name, 0.0)))
            except (TypeError, ValueError):
                values[name].append(0.0)
    return values


def compare_groups(group_a: list[dict[str, Any]], group_b: list[dict[str, Any]], alpha: float = 0.05) -> dict[str, Any]:
    a_features = _numeric_feature_matrix(group_a)
    b_features = _numeric_feature_matrix(group_b)
    feature_names = sorted(set(a_features) & set(b_features))
    correction_n = max(len(feature_names), 1)
    results: list[dict[str, Any]] = []
    for feature in feature_names:
        a = np.asarray(a_features[feature], dtype=np.float64)
        b = np.asarray(b_features[feature], dtype=np.float64)
        if len(a) == 0 or len(b) == 0:
            continue
        try:
            u_stat, p_value = stats.mannwhitneyu(a, b, alternative="two-sided")
        except ValueError:
            u_stat, p_value = 0.0, 1.0
        pooled_std = math.sqrt(((len(a) - 1) * np.var(a, ddof=1) + (len(b) - 1) * np.var(b, ddof=1)) / max(len(a) + len(b) - 2, 1)) if len(a) > 1 and len(b) > 1 else 0.0
        mean_diff = float(np.mean(a) - np.mean(b))
        cohen_d = mean_diff / pooled_std if pooled_std > 1e-12 else 0.0
        sem = math.sqrt(float(np.var(a, ddof=1)) / max(len(a), 1) + float(np.var(b, ddof=1)) / max(len(b), 1)) if len(a) > 1 and len(b) > 1 else 0.0
        p_corrected = min(float(p_value) * correction_n, 1.0)
        results.append({
            "feature": feature,
            "group_a_mean": round(float(np.mean(a)), 6),
            "group_b_mean": round(float(np.mean(b)), 6),
            "mann_whitney_u": round(float(u_stat), 6),
            "p_value": round(float(p_value), 8),
            "p_value_corrected": round(float(p_corrected), 8),
            "cohen_d": round(float(cohen_d), 6),
            "ci95_low": round(mean_diff - 1.96 * sem, 6),
            "ci95_high": round(mean_diff + 1.96 * sem, 6),
            "significant": bool(p_corrected < alpha),
        })
    return {
        "group_a_count": len(group_a),
        "group_b_count": len(group_b),
        "alpha": alpha,
        "correction": "bonferroni",
        "results": results,
        "significant_features": [item["feature"] for item in results if item["significant"]],
    }
