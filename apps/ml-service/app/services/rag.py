"""First-aid assistant: TF-IDF retrieval over a curated corpus + patient-aware safety warnings.

Retrieval-only (no free-text generation): every step shown comes from the vetted corpus, so it cannot hallucinate
medical advice. An LLM adapter could be added later behind the same guardrails.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ..core.config import DATA_DIR
from .guardrails import DISCLAIMER, sanitize

NSAID = ["aspirin", "ibuprofen", "naproxen", "diclofenac", "nsaid"]
THINNERS = ["warfarin", "apixaban", "rivaroxaban", "dabigatran", "heparin", "clopidogrel", "eliquis", "xarelto"]


@dataclass
class Doc:
    id: str
    title: str
    keywords: list[str]
    steps: list[str]


def _load() -> list[Doc]:
    docs = []
    for p in sorted((DATA_DIR / "first_aid_corpus").glob("*.md")):
        lines = p.read_text().splitlines()
        title = lines[0].lstrip("# ").strip()
        meta = {l.split(":", 1)[0]: l.split(":", 1)[1].strip() for l in lines[1:4] if ":" in l}
        steps = [re.sub(r"^\d+\.\s*", "", l) for l in lines if re.match(r"^\d+\.", l)]
        docs.append(Doc(meta.get("id", p.stem), title, [k.strip() for k in meta.get("keywords", "").split(",")], steps))
    return docs


def _has(items: list[str], words: list[str]) -> bool:
    return any(w in x.lower() for x in items for w in words)


def personal_warnings(doc_id: str, ctx: dict) -> list[str]:
    al, med, cond = ctx.get("allergies", []), ctx.get("medications", []), ctx.get("conditions", [])
    w = []
    if _has(al, NSAID): w.append("Patient has a recorded aspirin/NSAID allergy: do NOT give aspirin or NSAIDs.")
    if _has(med, THINNERS): w.append("Patient takes a blood thinner: bleeding may be harder to stop and aspirin/NSAIDs must be avoided. Tell the paramedics.")
    if _has(med, ["insulin", "metformin", "glipizide"]) or _has(cond, ["diabet"]): w.append("Patient has diabetes: consider low blood sugar as a cause of confusion or collapse.")
    if _has(al, ["penicillin", "amoxicillin"]): w.append("Penicillin-class allergy recorded: tell medical staff before any antibiotic is given.")
    if doc_id == "anaphylaxis" and al: w.append(f"Known allergies: {', '.join(al)}. Check for exposure.")
    if _has(cond, ["asthma"]) and doc_id != "choking": w.append("Patient has asthma: ask about a reliever inhaler.")
    if _has(cond, ["epilep", "seizure"]): w.append("Patient has epilepsy: seizures may be their known condition; still call for help if prolonged.")
    return w


class FirstAidRAG:
    def __init__(self) -> None:
        self.docs = _load()
        corpus = [f"{d.title} {' '.join(d.keywords)} {' '.join(d.keywords)} {' '.join(d.steps)}" for d in self.docs]
        self.vec = TfidfVectorizer(ngram_range=(1, 2), stop_words="english", sublinear_tf=True)
        self.matrix = self.vec.fit_transform(corpus)

    def answer(self, scenario: str, ctx: dict) -> dict:
        text, flags = sanitize(scenario)
        q = self.vec.transform([text])
        sims = cosine_similarity(q, self.matrix)[0]
        # keyword hits get a strong boost: "chest pain" should always win over incidental word overlap
        for i, d in enumerate(self.docs):
            sims[i] += 0.5 * sum(1 for k in d.keywords if k in text.lower())
        best = int(sims.argmax())
        matched = bool(sims[best] >= 0.12)
        doc = self.docs[best]
        base = {"source": "ml-retrieval", "disclaimer": DISCLAIMER, "flags": flags, "confidence": round(float(min(1.0, sims[best])), 2)}
        if not matched:
            return {**base, "matched": False, "title": "General emergency guidance", "warnings": personal_warnings("", ctx),
                    "steps": ["Check the scene is safe.", "Check responsiveness and breathing.", "Call your local emergency number.", "Follow the dispatcher instructions; start CPR if not breathing normally."]}
        return {**base, "matched": True, "title": doc.title, "steps": doc.steps, "warnings": personal_warnings(doc.id, ctx),
                "alternatives": [self.docs[i].title for i in sims.argsort()[::-1][1:3] if sims[i] >= 0.12]}


_rag: FirstAidRAG | None = None


def get_rag() -> FirstAidRAG:
    global _rag
    if _rag is None:
        _rag = FirstAidRAG()
    return _rag
