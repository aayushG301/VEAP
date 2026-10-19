import json

from ..core.config import DATA_DIR

_RULES = json.loads((DATA_DIR / "interactions.json").read_text())


def _hit(items: list[str], words: list[str]) -> list[str]:
    return [i for i in items if any(w in i.lower() for w in words)]


def check(medications: list[str], allergies: list[str]) -> list[dict]:
    out = []
    for r in _RULES["allergy_rules"]:
        a, b = _hit(allergies, r["a"]), _hit(medications, r["b"])
        if a and b:
            out.append({"level": r["level"], "message": f"{r['msg']} Patient takes: {', '.join(b)}.", "items": a + b})
    for r in _RULES["med_rules"]:
        a, b = _hit(medications, r["a"]), _hit(medications, r["b"])
        if a and b:
            out.append({"level": r["level"], "message": r["msg"], "items": a + b})
    return out
