"""Triage severity classifier (decision support only).

Trained on SYNTHETIC data generated from a clinical-style scoring function plus label noise. It demonstrates the
pipeline (features -> gradient boosting -> calibrated probabilities -> factors). It is NOT clinically validated.
"""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier

SYMPTOMS = ["unconscious", "not_breathing", "severe_bleeding", "chest_pain", "breathing_difficulty", "stroke_signs",
            "seizure", "confusion", "fracture", "burn", "allergic_reaction", "abdominal_pain", "fever"]
NUMERIC = ["age", "heart_rate", "spo2", "systolic_bp"]
FEATURES = NUMERIC + SYMPTOMS
LEVELS = ["LOW", "MODERATE", "HIGH", "CRITICAL"]
SYMPTOM_WEIGHT = {"unconscious": 100, "not_breathing": 100, "severe_bleeding": 60, "chest_pain": 45, "breathing_difficulty": 50,
                  "stroke_signs": 55, "seizure": 40, "confusion": 25, "fracture": 15, "burn": 20, "allergic_reaction": 35,
                  "abdominal_pain": 12, "fever": 5}
LABEL = {
    "unconscious": "unconscious", "not_breathing": "not breathing", "severe_bleeding": "severe bleeding", "chest_pain": "chest pain",
    "breathing_difficulty": "breathing difficulty", "stroke_signs": "stroke signs", "seizure": "seizure", "confusion": "confusion",
    "fracture": "possible fracture", "burn": "burn", "allergic_reaction": "allergic reaction", "abdominal_pain": "abdominal pain", "fever": "fever",
}


def _risk(age, hr, spo2, sbp, sym: dict) -> float:
    s = sum(SYMPTOM_WEIGHT[k] * sym[k] for k in SYMPTOMS)
    s += 40 * (spo2 < 90) + 20 * (90 <= spo2 < 94) + 25 * (hr > 130 or hr < 45) + 35 * (sbp < 90) + 10 * (age > 75 or age < 2)
    return s


def _synthetic(n: int = 6000, seed: int = 11):
    rng = np.random.default_rng(seed)
    X, y = [], []
    for _ in range(n):
        age = float(rng.integers(0, 95)); hr = float(np.clip(rng.normal(85, 22), 30, 200))
        spo2 = float(np.clip(rng.normal(97, 4), 70, 100)); sbp = float(np.clip(rng.normal(120, 22), 55, 220))
        k = rng.choice([0, 1, 1, 2, 3], p=[0.2, 0.3, 0.25, 0.15, 0.1])
        chosen = set(rng.choice(SYMPTOMS, size=k, replace=False)) if k else set()
        if rng.random() < 0.02: chosen.add("unconscious")
        sym = {s: 1 if s in chosen else 0 for s in SYMPTOMS}
        r = _risk(age, hr, spo2, sbp, sym) + rng.normal(0, 6)  # label noise
        label = 3 if r >= 90 else 2 if r >= 45 else 1 if r >= 20 else 0
        X.append([age, hr, spo2, sbp] + [sym[s] for s in SYMPTOMS]); y.append(label)
    return np.array(X), np.array(y)


class TriageModel:
    def __init__(self) -> None:
        X, y = _synthetic()
        self.model = GradientBoostingClassifier(n_estimators=120, max_depth=3, random_state=11).fit(X, y)
        self.importances = dict(zip(FEATURES, self.model.feature_importances_))

    def predict(self, inp: dict) -> dict:
        sym = {s: 1 if s in set(inp.get("symptoms", [])) else 0 for s in SYMPTOMS}
        age = inp.get("age"); hr = inp.get("heart_rate"); spo2 = inp.get("spo2"); sbp = inp.get("systolic_bp")
        row = [30 if age is None else age, 80 if hr is None else hr, 98 if spo2 is None else spo2, 120 if sbp is None else sbp] + [sym[s] for s in SYMPTOMS]
        probs = self.model.predict_proba(np.array([row]))[0]
        classes = list(self.model.classes_)
        full = {LEVELS[c]: float(p) for c, p in zip(classes, probs)}
        for lv in LEVELS: full.setdefault(lv, 0.0)
        # Safety net: life-threatening flags can never be down-triaged by the statistical model.
        level = max(full, key=full.get)
        if sym["unconscious"] or sym["not_breathing"]: level = "CRITICAL"
        expected = sum(LEVELS.index(k) * v for k, v in full.items()) / 3 * 100
        # Importance-weighted factors (a simple explanation, not SHAP).
        factors = []
        for s in SYMPTOMS:
            if sym[s]: factors.append((self.importances[s] + SYMPTOM_WEIGHT[s] / 1000, LABEL[s]))
        if spo2 is not None and spo2 < 94: factors.append((self.importances["spo2"] + 0.05, f"low oxygen saturation ({spo2:g}%)"))
        if hr is not None and (hr > 120 or hr < 50): factors.append((self.importances["heart_rate"] + 0.03, f"abnormal heart rate ({hr:g} bpm)"))
        if sbp is not None and (sbp < 100 or sbp > 180): factors.append((self.importances["systolic_bp"] + 0.03, f"abnormal blood pressure ({sbp:g})"))
        if age is not None and (age > 75 or age < 2): factors.append((self.importances["age"], "age risk"))
        factors.sort(reverse=True)
        return {"source": "ml", "level": level, "score": int(round(min(100, expected))), "probabilities": {k: round(v, 3) for k, v in full.items()},
                "factors": [f for _, f in factors[:5]], "disclaimer": "Decision support only (trained on synthetic data). Always call emergency services for serious symptoms."}


_model: TriageModel | None = None


def get_model() -> TriageModel:
    global _model
    if _model is None:
        _model = TriageModel()
    return _model
