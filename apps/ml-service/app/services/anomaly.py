"""Scan anomaly detection: Isolation Forest trained on synthetic *normal* scan behaviour + transparent rules.

Features: scans in last minute / 10 minutes, distinct IPs in 10 minutes, failed-OTP ratio, night flag.
"""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import IsolationForest

FEATURES = ["scans_1m", "scans_10m", "distinct_ips_10m", "failed_otp_ratio", "night"]


def _normal_data(n: int = 4000, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    s1 = rng.poisson(1.2, n).clip(1, 5)  # a scan always counts itself
    s10 = (s1 + rng.poisson(1.5, n)).clip(1, 12)
    ips = np.minimum(s10, rng.integers(1, 3, n))
    fails = np.where(rng.random(n) < 0.15, rng.random(n) * 0.4, 0.0)
    night = (rng.random(n) < 0.2).astype(float)
    return np.column_stack([s1, s10, ips, fails, night]).astype(float)


class AnomalyModel:
    def __init__(self) -> None:
        X = _normal_data()
        self.model = IsolationForest(n_estimators=200, contamination="auto", random_state=7).fit(X)
        raw = -self.model.score_samples(X)
        self.lo = float(np.percentile(raw, 50))
        self.hi = float(np.percentile(raw, 99.9)) + 0.12  # beyond anything seen in normal traffic => 100

    def model_score(self, x: list[float]) -> float:
        raw = float(-self.model.score_samples(np.array([x]))[0])
        return float(np.clip((raw - self.lo) / (self.hi - self.lo), 0, 1) * 100)

    def score(self, f: dict) -> dict:
        x = [f[k] for k in FEATURES]
        m = self.model_score(x)
        rules, reasons = 0.0, []
        if f["scans_1m"] > 10: rules += 40; reasons.append("high scan velocity")
        elif f["scans_1m"] > 5: rules += 20; reasons.append("elevated scan velocity")
        if f["scans_10m"] > 30: rules += 25; reasons.append("many scans in 10 minutes")
        if f["distinct_ips_10m"] > 4: rules += 30; reasons.append("many distinct IPs")
        elif f["distinct_ips_10m"] > 2: rules += 12; reasons.append("multiple IPs")
        if f["failed_otp_ratio"] > 0.5: rules += 25; reasons.append("high failed OTP ratio")
        score = int(round(min(100.0, max(m * 0.9, rules))))
        if m >= 70 and "statistical outlier" not in reasons:
            reasons.append("statistical outlier (isolation forest)")
        return {"score": score, "reasons": reasons, "model_score": round(m, 1)}


_model: AnomalyModel | None = None


def get_model() -> AnomalyModel:
    global _model
    if _model is None:
        _model = AnomalyModel()
    return _model
